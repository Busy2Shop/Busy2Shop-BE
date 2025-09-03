/* eslint-disable @typescript-eslint/no-explicit-any */
import { FindAndCountOptions, Op, Sequelize, Transaction } from 'sequelize';
import User from '../models/user.model';
import UserSettings, { IAgentMeta } from '../models/userSettings.model';
import Market from '../models/market.model';
import ShoppingList from '../models/shoppingList.model';
import Order from '../models/order.model';
import { BadRequestError, NotFoundError } from '../utils/customErrors';
import Pagination, { IPaging } from '../utils/pagination';
import { Database } from '../models';
import AgentLocation, { IAgentLocation } from '../models/agentLocation.model';
import { GoogleMapsService } from '../utils/googleMaps';
import { logger } from '../utils/logger';
import { ChatService } from './chat.service';

export interface IViewAgentsQuery {
    page?: number;
    size?: number;
    q?: string; // Search query
    isActive?: boolean;
    lat?: number; // Latitude for location-based search
    lng?: number; // Longitude for location-based search
    distance?: number; // Distance in kilometers
}

export type AgentStatus = 'available' | 'busy' | 'away' | 'offline';

interface UserWithLocations extends User {
    locations?: AgentLocation[];
}

export default class AgentService {
    static async getAgents(
        queryData?: IViewAgentsQuery,
    ): Promise<{ agents: User[]; count: number; totalPages?: number }> {
        const { page, size, q: query, isActive } = queryData || {};

        const where: any = {
            'status.userType': 'agent',
        };

        // Handle search query
        if (query) {
            where[Op.or as unknown as string] = [
                { firstName: { [Op.iLike]: `%${query}%` } },
                { lastName: { [Op.iLike]: `%${query}%` } },
                { email: { [Op.iLike]: `%${query}%` } },
            ];
        }

        const settingsWhere: Record<string, unknown> = {};

        // Filter by active status
        if (isActive !== undefined) {
            settingsWhere.isDeactivated = !isActive;
        }

        // Basic query options
        const queryOptions: FindAndCountOptions<User> = {
            where,
            include: [
                {
                    model: UserSettings,
                    as: 'settings',
                    where: settingsWhere,
                },
            ],
        };

        // Handle pagination
        if (page && size && page > 0 && size > 0) {
            const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);
            queryOptions.limit = limit ?? 0;
            queryOptions.offset = offset ?? 0;
        }

        const { rows: agents, count } = await User.findAndCountAll(queryOptions);

        // Calculate pagination metadata if applicable
        if (page && size && agents.length > 0) {
            const totalPages = Pagination.estimateTotalPage({ count, limit: size } as IPaging);
            return { agents, count, ...totalPages };
        } else {
            return { agents, count };
        }
    }

    static async getAgentById(id: string): Promise<User> {
        // First try to find the user by ID only to see if they exist
        const user = await User.findByPk(id, {
            include: [
                {
                    model: UserSettings,
                    as: 'settings',
                },
                {
                    model: ShoppingList,
                    as: 'assignedOrders',
                },
            ],
        });

        if (!user) {
            throw new NotFoundError('User not found');
        }

        // Check if the user is an agent
        if (user.status?.userType !== 'agent') {
            throw new NotFoundError('Agent not found - user is not an agent');
        }

        return user;
    }

    static async getAgentStats(agentId: string): Promise<{
        totalOrders: number;
        completedOrders: number;
        cancelledOrders: number;
        pendingOrders: number;
        uniqueMarkets: number;
    }> {
        // Get count of different order statuses
        const totalOrders = await Order.count({
            where: { agentId },
        });

        const completedOrders = await Order.count({
            where: {
                agentId,
                status: 'completed',
            },
        });

        const cancelledOrders = await Order.count({
            where: {
                agentId,
                status: 'cancelled',
            },
        });

        const pendingOrders = await Order.count({
            where: {
                agentId,
                status: {
                    [Op.in]: ['pending', 'accepted', 'in_progress'],
                },
            },
        });

        // Replace with the count of unique markets the agent has shopped in
        const uniqueMarkets = await Order.count({
            where: { agentId },
            distinct: true,
            col: 'shoppingList.marketId',
            include: [
                {
                    model: ShoppingList,
                    attributes: [],
                },
            ],
        });

        return {
            totalOrders,
            completedOrders,
            cancelledOrders,
            pendingOrders,
            uniqueMarkets,
        };
    }

    /**
     * Get available agents for an order considering location and preferences
     *   Priority System (Market-Focused):
        1. 🥇 Score +1000: Agents already working in same market (< 3 orders)
        2. 🥈 Score +200: Agents with orders in other markets but under capacity
        3. 🥉 Score +50: Fresh agents with no active orders
        4. ⚠️ Score -200: Agents at total capacity (3+ orders across all markets)
        5. ❌ Score -1000: Agents at capacity in current market (filtered out)
     * @param shoppingListId The ID of the shopping list for the order
     * @param excludeAgentIds Optional array of agent IDs to exclude from the search
     * @returns Array of available agents sorted by relevance
     */
    static async getAvailableAgentsForOrder(
        shoppingListId: string,
        excludeAgentIds: string[] = [],
    ): Promise<User[]> {
        // Get the shopping list with market information
        const shoppingList = await ShoppingList.findByPk(shoppingListId, {
            include: [
                {
                    model: Market,
                    as: 'market',
                    attributes: ['id', 'name', 'location'],
                },
            ],
        });

        if (!shoppingList) {
            throw new NotFoundError('Shopping list not found');
        }

        // Build where clause for agent query
        const whereClause: any = {
            'status.userType': 'agent',
            'status.activated': true,
            'status.emailVerified': true,
        };

        // Exclude specific agents if provided
        if (excludeAgentIds && excludeAgentIds.length > 0) {
            whereClause.id = {
                [Op.notIn]: excludeAgentIds,
            };
        }

        // Get all available agents with KYC verification, status checks, and locations
        const availableAgents = (await User.findAll({
            where: whereClause,
            include: [
                {
                    model: UserSettings,
                    as: 'settings',
                    where: {
                        isDeactivated: false,
                        isKycVerified: true, // Only KYC verified agents
                        // Check that agent has proper metadata and is accepting orders
                        agentMetaData: {
                            [Op.and]: [
                                Sequelize.where(
                                    Sequelize.fn('jsonb_extract_path_text', Sequelize.col('"settings"."agentMetaData"'), 'currentStatus'),
                                    'available'
                                ),
                                Sequelize.where(
                                    Sequelize.fn('jsonb_extract_path_text', Sequelize.col('"settings"."agentMetaData"'), 'isAcceptingOrders'),
                                    'true'
                                ),
                            ],
                        },
                    },
                    required: true, // Exclude agents without proper settings
                },
                {
                    model: AgentLocation,
                    as: 'locations',
                    where: {
                        isActive: true,
                    },
                    required: false, // Don't exclude agents without locations
                },
            ],
            limit: 50, // Get more agents for better sorting
            order: [['createdAt', 'ASC']], // Base ordering
        })) as UserWithLocations[];

        logger.info(`Found ${availableAgents.length} KYC-verified, available agents for shopping list ${shoppingListId}`);
        
        // Get active orders for all agents to determine their current workload
        const agentIds = availableAgents.map(agent => agent.id);
        const agentActiveOrders = await Order.findAll({
            where: {
                agentId: {
                    [Op.in]: agentIds,
                },
                status: {
                    [Op.in]: ['accepted', 'in_progress'], // Active orders
                },
            },
            include: [
                {
                    model: ShoppingList,
                    as: 'shoppingList',
                    include: [
                        {
                            model: Market,
                            as: 'market',
                            attributes: ['id', 'name'],
                        },
                    ],
                },
            ],
        });

        // Group orders by agent ID for efficient lookup
        const ordersByAgent = new Map<string, Order[]>();
        agentActiveOrders.forEach(order => {
            const agentId = order.agentId;
            if (!ordersByAgent.has(agentId)) {
                ordersByAgent.set(agentId, []);
            }
            ordersByAgent.get(agentId)!.push(order);
        });

        logger.info(`Found ${agentActiveOrders.length} active orders across ${ordersByAgent.size} agents`);
        
        // Enhanced logging for debugging agent assignment
        availableAgents.forEach(agent => {
            const agentOrders = ordersByAgent.get(agent.id) || [];
            const ordersInTargetMarket = agentOrders.filter(order => 
                order.shoppingList?.market?.id === shoppingList.marketId
            ).length;
            
            logger.info(`Agent ${agent.id} (${agent.firstName} ${agent.lastName}): ${agentOrders.length} total orders, ${ordersInTargetMarket} in target market ${shoppingList.marketId}`);
        });
        
        // Process agents asynchronously for distance calculation and scoring  
        const agentScoringPromises = availableAgents.map(async (agent: UserWithLocations) => {
                let score = 0;
                let distance = Infinity;
                
                // Define market location for distance calculations
                const marketLocation = shoppingList.market?.location ? {
                    latitude: shoppingList.market.location.latitude,
                    longitude: shoppingList.market.location.longitude,
                } : null;
                
                // HIGHEST PRIORITY: Check if agent is already working in the same market (up to 3 orders)
                const agentActiveOrders = ordersByAgent.get(agent.id) || [];
                const totalActiveOrders = agentActiveOrders.length;
                
                // Check how many orders the agent has in the current market specifically
                const ordersInCurrentMarket = agentActiveOrders.filter((order: Order) => 
                    order.shoppingList?.market?.id === shoppingList.marketId
                ).length;
                
                if (ordersInCurrentMarket > 0 && ordersInCurrentMarket < 3) {
                    // TOP PRIORITY: Agent is already working in this exact market and has capacity
                    score += 1000; // Maximum priority for same-market agents
                    logger.info(`Agent ${agent.id} gets HIGHEST priority - already has ${ordersInCurrentMarket} orders in market ${shoppingList.marketId}`);
                } else if (ordersInCurrentMarket >= 3) {
                    // Agent is at capacity for this market - exclude them
                    score -= 1000; // Massive penalty - should not be assigned
                    logger.info(`Agent ${agent.id} at capacity in market ${shoppingList.marketId} with ${ordersInCurrentMarket} orders - excluded`);
                } else if (totalActiveOrders > 0 && totalActiveOrders < 3) {
                    // Secondary priority: Agent has active orders in other markets but under total capacity
                    score += 200; // Good bonus for experienced agents with capacity
                    logger.info(`Agent ${agent.id} has ${totalActiveOrders} active orders in other markets - medium priority`);
                } else if (totalActiveOrders >= 3) {
                    // Agent is at total capacity across all markets
                    score -= 200; // Lower priority but still consider
                    logger.info(`Agent ${agent.id} at total capacity with ${totalActiveOrders} orders across all markets`);
                } else {
                    // Agent has no active orders - fresh agent
                    score += 50; // Small bonus for available fresh agents
                    logger.info(`Agent ${agent.id} has no active orders - fresh agent`);
                }
                
                // Score based on location proximity using Google Maps API with Haversine fallback
                if (marketLocation && agent.locations && agent.locations.length > 0) {
                    
                    // Calculate distances to all agent locations using Google Maps API
                    const distancePromises = agent.locations.map(async location => {
                        const agentLocation = {
                            latitude: location.latitude,
                            longitude: location.longitude,
                        };
                        
                        try {
                            const result = await GoogleMapsService.calculateDistance(marketLocation, agentLocation);
                            return result.distance;
                        } catch (error) {
                            // Fallback to Haversine if Google Maps fails
                            logger.warn(`Google Maps API failed for agent ${agent.id}, using Haversine fallback`);
                            return AgentService.calculateDistance(marketLocation.latitude, marketLocation.longitude, agentLocation.latitude, agentLocation.longitude);
                        }
                    });
                    
                    // Get the minimum distance (closest location)
                    const distanceResults = await Promise.all(distancePromises);
                    distance = Math.min(...distanceResults);
                    
                    // Score based on proximity (closer = higher score)
                    if (distance <= 2) score += 100; // Within 2km - highest priority
                    else if (distance <= 5) score += 80; // Within 5km - high priority
                    else if (distance <= 10) score += 60; // Within 10km - medium priority
                    else if (distance <= 20) score += 40; // Within 20km - low priority
                    
                    // Bonus for agents with preferred locations that match
                    const hasPreferredLocationNearby = agent.locations.some(loc => 
                        loc.locationType === 'service_area' && 
                        AgentService.calculateDistance(marketLocation.latitude, marketLocation.longitude, loc.latitude, loc.longitude) <= loc.radius
                    );
                    
                    if (hasPreferredLocationNearby) {
                        score += 50; // Bonus for preferred location match
                    }
                }
                
                // Score based on current location if available
                const currentLocation = agent.locations?.find(loc => loc.locationType === 'current_location');
                if (currentLocation && marketLocation) {
                    const currentDistance = AgentService.calculateDistance(
                        marketLocation.latitude,
                        marketLocation.longitude,
                        currentLocation.latitude,
                        currentLocation.longitude
                    );
                    
                    // Prefer agents whose current location is closer
                    if (currentDistance <= 1) score += 30; // Very close
                    else if (currentDistance <= 3) score += 20; // Close
                    else if (currentDistance <= 5) score += 10; // Nearby
                }
                
                // Score based on agent experience (older agents get slight preference)
                const daysActive = Math.floor((Date.now() - new Date(agent.createdAt).getTime()) / (1000 * 60 * 60 * 24));
                if (daysActive > 30) score += 10; // Active for more than 30 days
                else if (daysActive > 7) score += 5; // Active for more than 7 days
                
                return {
                    agent,
                    score,
                    distance,
                };
        });

        // Wait for all distance calculations to complete
        const scoredAgents = (await Promise.all(agentScoringPromises))
            .filter(item => {
                // Filter out agents with negative scores (at capacity or unavailable)
                if (item.score < 0) {
                    logger.info(`Filtering out agent ${item.agent.id} due to negative score: ${item.score}`);
                    return false;
                }
                return true;
            })
            .sort((a, b) => {
                // Primary sort: by score (higher is better)
                if (a.score !== b.score) {
                    return b.score - a.score;
                }
                // Secondary sort: by distance (closer is better)
                return a.distance - b.distance;
            });

        const sortedAgents = scoredAgents.map(item => item.agent).slice(0, 4); // Return top 4 agents
        
        // Enhanced logging for final sorted agents
        logger.info(`Final sorted agents for market ${shoppingList.market?.name} (${shoppingList.marketId}):`);
        scoredAgents.slice(0, 10).forEach((item, index) => {
            const agent = item.agent;
            const agentOrders = ordersByAgent.get(agent.id) || [];
            const ordersInMarket = agentOrders.filter(order => 
                order.shoppingList?.market?.id === shoppingList.marketId
            ).length;
            
            logger.info(`${index + 1}. Agent ${agent.id} (${agent.firstName} ${agent.lastName}) - Score: ${item.score}, Distance: ${item.distance.toFixed(2)}km, Orders in market: ${ordersInMarket}, Total orders: ${agentOrders.length}`);
        });
        
        if (shoppingList.market?.location && sortedAgents.length > 0) {
            logger.info(`Selected top agent: ${sortedAgents[0].id} (${sortedAgents[0].firstName} ${sortedAgents[0].lastName})`);
        } else {
            logger.warn(`No available agents found for market ${shoppingList.market?.name}`);
        }

        return sortedAgents;
    }

    /**
     * Find the nearest available agent to a location with enhanced filtering
     * @param latitude The latitude coordinate
     * @param longitude The longitude coordinate
     * @param excludeAgentIds Optional array of agent IDs to exclude from the search
     * @param maxDistance Maximum distance in km to search (default: 20km)
     * @returns The nearest available agent or undefined if none found
     */
    static async findNearestAgent(
        latitude: number,
        longitude: number,
        excludeAgentIds: string[] = [],
        maxDistance: number = 20,
    ): Promise<User | undefined> {
        // Build exclusion clause
        const whereClause: any = {
            'status.userType': 'agent',
            'status.activated': true,
            'status.emailVerified': true,
        };

        if (excludeAgentIds.length > 0) {
            whereClause.id = { [Op.notIn]: excludeAgentIds };
        }

        // Get all available agents with proper KYC and status checks
        const availableAgents = (await User.findAll({
            where: whereClause,
            include: [
                {
                    model: UserSettings,
                    as: 'settings',
                    where: {
                        isDeactivated: false,
                        isKycVerified: true,
                        agentMetaData: {
                            [Op.and]: [
                                Sequelize.where(
                                    Sequelize.fn('jsonb_extract_path_text', Sequelize.col('"settings"."agentMetaData"'), 'currentStatus'),
                                    'available'
                                ),
                                Sequelize.where(
                                    Sequelize.fn('jsonb_extract_path_text', Sequelize.col('"settings"."agentMetaData"'), 'isAcceptingOrders'),
                                    'true'
                                ),
                            ],
                        },
                    },
                    required: true,
                },
                {
                    model: AgentLocation,
                    as: 'locations',
                    where: {
                        isActive: true,
                    },
                    required: true, // Must have at least one active location
                },
            ],
        })) as UserWithLocations[];

        if (availableAgents.length === 0) {
            logger.warn(`No available agents found within ${maxDistance}km of coordinates ${latitude}, ${longitude}`);
            return undefined;
        }

        // Calculate distances and find the nearest agent within maxDistance
        let nearestAgent: User | undefined;
        let shortestDistance = Infinity;

        for (const agent of availableAgents) {
            if (!agent.locations || agent.locations.length === 0) continue;

            // Check current location first (most accurate)
            const currentLocation = agent.locations.find(loc => loc.locationType === 'current_location');
            let minDistance = Infinity;

            if (currentLocation) {
                minDistance = this.calculateDistance(
                    latitude,
                    longitude,
                    currentLocation.latitude,
                    currentLocation.longitude,
                );
            } else {
                // Fall back to service area locations
                const serviceAreas = agent.locations.filter(loc => loc.locationType === 'service_area');
                if (serviceAreas.length > 0) {
                    const distances = serviceAreas.map(location => 
                        this.calculateDistance(latitude, longitude, location.latitude, location.longitude)
                    );
                    minDistance = Math.min(...distances);
                }
            }

            // Only consider agents within maxDistance
            if (minDistance <= maxDistance && minDistance < shortestDistance) {
                shortestDistance = minDistance;
                nearestAgent = agent;
            }
        }

        if (nearestAgent) {
            logger.info(`Found nearest agent ${nearestAgent.id} at distance ${shortestDistance.toFixed(2)}km`);
        } else {
            logger.warn(`No agents found within ${maxDistance}km of coordinates ${latitude}, ${longitude}`);
        }

        return nearestAgent;
    }

    /**
     * Assign an order to a specific agent
     * @param orderId The order ID
     * @param agentId The agent ID
     * @param transaction Optional transaction
     * @returns Updated order
     */
    static async assignOrderToAgent(orderId: string, agentId: string, transaction?: Transaction): Promise<Order> {
        const txn = transaction;
        
            console.log('starting assignment transaction', { orderId, agentId });
            // Get the order with shopping list
            const order = await Order.findByPk(orderId, {
                include: [
                    {
                        model: ShoppingList,
                        as: 'shoppingList',
                        attributes: ['id', 'status'],
                    },
                ],
                // transaction: txn,
            });
        
            console.log('fetched order for assignment', { order });

            if (!order) {
                throw new NotFoundError('Order not found');
            }

            // Update the order with agent assignment
            await order.update(
                {
                    agentId,
                    status: 'accepted', // Order is now assigned to agent
                    acceptedAt: new Date(),
                },
                // { transaction: txn },
            );

            // Update agent status to busy (not accepting new orders)
            await this.setAgentBusy(agentId, orderId, txn);

            // Log the assignment
            logger.info(`Order ${orderId} successfully assigned to agent ${agentId}`);

            return order;

    }

    /**
     * Update agent documents (NIN and verification images)
     * @param agentId Agent ID
     * @param documents Document data (NIN or images)
     * @returns Updated agent
     */
    static async updateAgentDocuments(
        agentId: string,
        documents: Partial<IAgentMeta>,
    ): Promise<User> {
        return await Database.transaction(async (transaction: Transaction) => {
            // First check if agent exists
            const agent = await User.findOne({
                where: {
                    id: agentId,
                    'status.userType': 'agent',
                },
                include: [
                    {
                        model: UserSettings,
                        as: 'settings',
                    },
                ],
                transaction,
            });

            if (!agent) {
                throw new NotFoundError('Agent not found');
            }

            if (!agent.settings) {
                throw new NotFoundError('User settings not found');
            }

            // Use different approaches based on what we're updating
            if (documents.nin !== undefined) {
                // Update NIN using jsonb_set
                await UserSettings.update(
                    {
                        agentMetaData: Sequelize.fn(
                            'jsonb_set',
                            // If agentMetaData is null, initialize with the default structure
                            Sequelize.fn(
                                'COALESCE',
                                Sequelize.col('agentMetaData'),
                                Sequelize.literal(
                                    `'{"nin":"","images":[],"currentStatus":"offline","lastStatusUpdate":"${new Date().toISOString()}","isAcceptingOrders":false}'::jsonb`,
                                ),
                            ),
                            // Path to the property
                            Sequelize.literal('\'{nin}\''),
                            // Value to set
                            Sequelize.literal(`'"${documents.nin}"'`),
                            // Create if it doesn't exist
                            true,
                        ),
                    },
                    {
                        where: { userId: agentId },
                        transaction,
                    },
                );
            }

            if (documents.images && documents.images.length > 0) {
                // First, ensure the agentMetaData exists and has an image array
                await UserSettings.update(
                    {
                        agentMetaData: Sequelize.fn(
                            'jsonb_set',
                            // If agentMetaData is null, initialize with the default structure
                            Sequelize.fn(
                                'COALESCE',
                                Sequelize.col('agentMetaData'),
                                Sequelize.literal(
                                    `'{"nin":"","images":[],"currentStatus":"offline","lastStatusUpdate":"${new Date().toISOString()}","isAcceptingOrders":false}'::jsonb`,
                                ),
                            ),
                            // Path to the image property
                            Sequelize.literal('\'{images}\''),
                            // If images are missing, initialize with an empty array
                            Sequelize.fn(
                                'COALESCE',
                                Sequelize.fn(
                                    'jsonb_extract_path',
                                    Sequelize.col('agentMetaData'),
                                    'images',
                                ),
                                Sequelize.literal('\'[]\'::jsonb'),
                            ),
                            // Create if it doesn't exist
                            true,
                        ),
                    },
                    {
                        where: { userId: agentId },
                        transaction,
                    },
                );

                // Now append the new images to the existing images array
                for (const imageUrl of documents.images) {
                    await UserSettings.update(
                        {
                            agentMetaData: Sequelize.literal(
                                `jsonb_set(
                                "agentMetaData",
                                '{images}',
                                (
                                    COALESCE(
                                        jsonb_extract_path("agentMetaData", 'images'), 
                                        '[]'::jsonb
                                    ) || '"${imageUrl}"'::jsonb
                                )
                            )`,
                            ),
                        },
                        {
                            where: { userId: agentId },
                            transaction,
                        },
                    );
                }
            }

            if (documents.livenessVerification) {
                // Update liveness verification data
                await UserSettings.update(
                    {
                        agentMetaData: Sequelize.fn(
                            'jsonb_set',
                            // If agentMetaData is null, initialize with the default structure
                            Sequelize.fn(
                                'COALESCE',
                                Sequelize.col('agentMetaData'),
                                Sequelize.literal(
                                    `'{"nin":"","images":[],"currentStatus":"offline","lastStatusUpdate":"${new Date().toISOString()}","isAcceptingOrders":false}'::jsonb`,
                                ),
                            ),
                            // Path to the liveness verification property
                            Sequelize.literal('\'{livenessVerification}\''),
                            // Value to set (the liveness data as JSON)
                            Sequelize.literal(`'${JSON.stringify(documents.livenessVerification)}'::jsonb`),
                            // Create if it doesn't exist
                            true,
                        ),
                    },
                    {
                        where: { userId: agentId },
                        transaction,
                    },
                );
            }

            if (documents.identityDocument) {
                // Update identity document data
                await UserSettings.update(
                    {
                        agentMetaData: Sequelize.fn(
                            'jsonb_set',
                            // If agentMetaData is null, initialize with the default structure
                            Sequelize.fn(
                                'COALESCE',
                                Sequelize.col('agentMetaData'),
                                Sequelize.literal(
                                    `'{"nin":"","images":[],"currentStatus":"offline","lastStatusUpdate":"${new Date().toISOString()}","isAcceptingOrders":false}'::jsonb`,
                                ),
                            ),
                            // Path to the identity document property
                            Sequelize.literal('\'{identityDocument}\''),
                            // Value to set (the identity document data as JSON)
                            Sequelize.literal(`'${JSON.stringify(documents.identityDocument)}'::jsonb`),
                            // Create if it doesn't exist
                            true,
                        ),
                    },
                    {
                        where: { userId: agentId },
                        transaction,
                    },
                );
            }

            if (documents.kycComplete !== undefined) {
                // Update KYC completion status
                await UserSettings.update(
                    {
                        agentMetaData: Sequelize.fn(
                            'jsonb_set',
                            // If agentMetaData is null, initialize with the default structure
                            Sequelize.fn(
                                'COALESCE',
                                Sequelize.col('agentMetaData'),
                                Sequelize.literal(
                                    `'{"nin":"","images":[],"currentStatus":"offline","lastStatusUpdate":"${new Date().toISOString()}","isAcceptingOrders":false}'::jsonb`,
                                ),
                            ),
                            // Path to the kycComplete property
                            Sequelize.literal('\'{kycComplete}\''),
                            // Value to set
                            Sequelize.literal(`'${documents.kycComplete}'::jsonb`),
                            // Create if it doesn't exist
                            true,
                        ),
                    },
                    {
                        where: { userId: agentId },
                        transaction,
                    },
                );
            }

            if (documents.kycCompletedAt) {
                // Update KYC completion timestamp
                await UserSettings.update(
                    {
                        agentMetaData: Sequelize.fn(
                            'jsonb_set',
                            // If agentMetaData is null, initialize with the default structure
                            Sequelize.fn(
                                'COALESCE',
                                Sequelize.col('agentMetaData'),
                                Sequelize.literal(
                                    `'{"nin":"","images":[],"currentStatus":"offline","lastStatusUpdate":"${new Date().toISOString()}","isAcceptingOrders":false}'::jsonb`,
                                ),
                            ),
                            // Path to the kycCompletedAt property
                            Sequelize.literal('\'{kycCompletedAt}\''),
                            // Value to set
                            Sequelize.literal(`'"${documents.kycCompletedAt}"'::jsonb`),
                            // Create if it doesn't exist
                            true,
                        ),
                    },
                    {
                        where: { userId: agentId },
                        transaction,
                    },
                );
            }

            if (documents.kycStatus) {
                // Update KYC status
                await UserSettings.update(
                    {
                        agentMetaData: Sequelize.fn(
                            'jsonb_set',
                            // If agentMetaData is null, initialize with the default structure
                            Sequelize.fn(
                                'COALESCE',
                                Sequelize.col('agentMetaData'),
                                Sequelize.literal(
                                    `'{"nin":"","images":[],"currentStatus":"offline","lastStatusUpdate":"${new Date().toISOString()}","isAcceptingOrders":false}'::jsonb`,
                                ),
                            ),
                            // Path to the kycStatus property
                            Sequelize.literal('\'{kycStatus}\''),
                            // Value to set
                            Sequelize.literal(`'"${documents.kycStatus}"'::jsonb`),
                            // Create if it doesn't exist
                            true,
                        ),
                    },
                    {
                        where: { userId: agentId },
                        transaction,
                    },
                );
            }

            // Get the updated agent
            const updatedAgent = await User.findOne({
                where: {
                    id: agentId,
                    'status.userType': 'agent',
                },
                include: [
                    {
                        model: UserSettings,
                        as: 'settings',
                    },
                ],
                transaction,
            });

            return updatedAgent!;
        });
    }

    /**
     * Update an agent's status (with KYC verification for 'available' status)
     */
    static async updateAgentStatus(
        userId: string,
        status: 'available' | 'busy' | 'away' | 'offline',
        isAcceptingOrders: boolean = true,
        transaction?: Transaction,
    ): Promise<User> {
        // Check if the user exists
        const user = await User.findByPk(userId, {
            include: [
                {
                    model: UserSettings,
                    as: 'settings',
                },
            ],
            transaction,
        });

        if (!user) {
            throw new NotFoundError('User not found');
        }

        if (!user.settings) {
            throw new NotFoundError('User settings not found');
        }

        // Verify agent is KYC verified before allowing 'available' status
        if (status === 'available' && isAcceptingOrders) {
            const isKycVerified = user.settings.isKycVerified;
            const agentMeta = user.settings.agentMetaData;
            const kycComplete = agentMeta?.kycComplete === true;
            
            // Primary check: isKycVerified (set by admin approval)
            if (!isKycVerified) {
                throw new BadRequestError(
                    'Agent must complete KYC verification before going online. ' +
                    `KYC Status: ${isKycVerified ? 'Verified' : 'Not Verified'}`
                );
            }
            
            // If KYC is verified but kycComplete is not set, auto-update it
            if (isKycVerified && !kycComplete) {
                logger.info(`Auto-updating kycComplete flag for verified agent ${userId}`, {
                    userId,
                    isKycVerified,
                    kycComplete,
                });
                
                // Update kycComplete flag in agent metadata
                await AgentService.updateAgentDocuments(userId, {
                    kycComplete: true,
                    kycCompletedAt: new Date().toISOString(),
                });
            }
        }

        const currentTime = new Date().toISOString();

        // Create a transaction if one wasn't provided
        const txn = transaction || (await Database.transaction());

        try {
            // Use jsonb_set to update status-related fields while preserving others
            await UserSettings.update(
                {
                    agentMetaData: Sequelize.literal(`
                    jsonb_set(
                        jsonb_set(
                            jsonb_set(
                                COALESCE("agentMetaData", 
                                    '{"nin":"","images":[],"currentStatus":"offline","lastStatusUpdate":"${currentTime}","isAcceptingOrders":false}'::jsonb
                                ),
                                '{currentStatus}',
                                '"${status}"'::jsonb,
                                true
                            ),
                            '{lastStatusUpdate}',
                            '"${currentTime}"'::jsonb,
                            true
                        ),
                        '{isAcceptingOrders}',
                        '${isAcceptingOrders}'::jsonb,
                        true
                    )
                `),
                    lastLogin: new Date(), // Update last seen
                },
                {
                    where: { userId: userId },
                    transaction: txn,
                },
            );

            // Only commit if we created our own transaction
            if (!transaction) {
                await txn.commit();
            }

            // Fetch and return the updated user
            return (await User.findByPk(userId, {
                include: [
                    {
                        model: UserSettings,
                        as: 'settings',
                    },
                ],
                transaction,
            })) as User;
        } catch (error) {
            // Only rollback if we created our own transaction
            if (!transaction) {
                await txn.rollback();
            }
            throw error;
        }
    }

    /**
     * Update an agent's accepting orders status
     */
    static async updateAgentAcceptingOrders(
        userId: string,
        isAcceptingOrders: boolean,
    ): Promise<User> {
        // Check if the user exists
        const user = await User.findByPk(userId, {
            include: [
                {
                    model: UserSettings,
                    as: 'settings',
                },
            ],
        });

        if (!user) {
            throw new NotFoundError('User not found');
        }

        if (!user.settings) {
            throw new NotFoundError('User settings not found');
        }

        const currentTime = new Date().toISOString();

        // Use a transaction
        return await Database.transaction(async (transaction: Transaction) => {
            // Update only the isAcceptingOrders and lastStatusUpdate fields
            await UserSettings.update(
                {
                    agentMetaData: Sequelize.literal(`
                    jsonb_set(
                        jsonb_set(
                            COALESCE("agentMetaData", 
                                '{"nin":"","images":[],"currentStatus":"offline","lastStatusUpdate":"${currentTime}","isAcceptingOrders":false}'::jsonb
                            ),
                            '{isAcceptingOrders}',
                            '${isAcceptingOrders}'::jsonb,
                            true
                        ),
                        '{lastStatusUpdate}',
                        '"${currentTime}"'::jsonb,
                        true
                    )
                `),
                },
                {
                    where: { userId: userId },
                    transaction,
                },
            );

            // Fetch and return the updated user
            return (await User.findByPk(userId, {
                include: [
                    {
                        model: UserSettings,
                        as: 'settings',
                    },
                ],
                transaction,
            })) as User;
        });
    }

    /**
     * Set agent as busy with a specific order
     */
    static async setAgentBusy(
        agentId: string,
        orderId: string,
        transaction?: Transaction,
    ): Promise<void> {
        console.log(`Setting agent ${agentId} as busy for order ${orderId}`);
        // Update agent status to busy using SQL literal for JSON update
        await UserSettings.update(
            {
                agentMetaData: Sequelize.literal(`
                    COALESCE("agentMetaData", '{}') || 
                    '{"currentStatus": "busy", "isAcceptingOrders": false, "lastStatusUpdate": "${new Date().toISOString()}"}'
                `),
            },
            {
                where: { userId: agentId },
                transaction,
            }
        );
    }

    /**
     * Get agent's current status
     */
    static async getAgentStatus(agentId: string): Promise<{
        currentStatus: AgentStatus;
        isAcceptingOrders: boolean;
        lastStatusUpdate: string;
        kycVerified: boolean;
        canGoOnline: boolean;
    }> {
        const agent = await User.findByPk(agentId, {
            include: [
                {
                    model: UserSettings,
                    as: 'settings',
                },
            ],
        });

        if (!agent) {
            throw new NotFoundError('Agent not found');
        }

        if (agent.status.userType !== 'agent') {
            throw new BadRequestError('User is not an agent');
        }

        const settings = agent.settings;
        const agentMeta = settings?.agentMetaData;
        const isKycVerified = settings?.isKycVerified || false;
        const kycComplete = agentMeta?.kycComplete === true;

        // If KYC is verified but kycComplete is not set, auto-update it
        if (isKycVerified && !kycComplete) {
            logger.info(`Auto-updating kycComplete flag for verified agent ${agentId}`, {
                agentId,
                isKycVerified,
                kycComplete,
            });
            
            // Update kycComplete flag in agent metadata
            await AgentService.updateAgentDocuments(agentId, {
                kycComplete: true,
                kycCompletedAt: new Date().toISOString(),
            });
        }

        // Use isKycVerified as the primary check for canGoOnline
        return {
            currentStatus: agentMeta?.currentStatus ?? 'offline',
            isAcceptingOrders: agentMeta?.isAcceptingOrders || false,
            lastStatusUpdate: agentMeta?.lastStatusUpdate ?? new Date().toISOString(),
            kycVerified: isKycVerified,
            canGoOnline: isKycVerified,
        };
    }

    /**
     * Get all available agents
     */
    static async getAvailableAgents(): Promise<User[]> {
        return await User.findAll({
            where: {
                'status.userType': 'agent',
            },
            include: [
                {
                    model: UserSettings,
                    as: 'settings',
                    where: {
                        agentMetaData: {
                            [Op.and]: [{ currentStatus: 'available' }, { isAcceptingOrders: true }],
                        },
                    },
                },
            ],
        });
    }

    /**
     * Add a new preferred location for an agent
     */
    static async addAgentLocation(
        agentId: string,
        locationData: Partial<IAgentLocation>,
        transaction?: Transaction,
    ): Promise<AgentLocation> {
        // Use the provided transaction or create a new one
        const txn = transaction || (await Database.transaction());

        try {
            const agent = await User.findByPk(agentId, { transaction: txn });
            if (!agent) {
                throw new NotFoundError('Agent not found');
            }

            if (agent.status.userType !== 'agent') {
                throw new BadRequestError('User is not an agent');
            }

            // Create a new location with the required fields
            const newLocation = await AgentLocation.create(
                {
                    agentId,
                    latitude: locationData.latitude ?? 0,
                    longitude: locationData.longitude ?? 0,
                    radius: locationData.radius ?? 5.0,
                    isActive: locationData.isActive !== undefined ? locationData.isActive : true,
                    name: locationData.name,
                    address: locationData.address,
                } as IAgentLocation,
                { transaction: txn },
            );

            // Only commit if we created our own transaction
            if (!transaction) {
                await txn.commit();
            }

            return newLocation;
        } catch (error) {
            // Only rollback if we created our own transaction
            if (!transaction) {
                await txn.rollback();
            }
            throw error;
        }
    }

    /**
     * Update an agent's location
     */
    static async updateAgentLocation(
        agentId: string,
        locationId: string,
        locationData: Partial<IAgentLocation>,
        transaction?: Transaction,
    ): Promise<AgentLocation> {
        // Use the provided transaction or create a new one
        const txn = transaction || (await Database.transaction());

        try {
            const location = await AgentLocation.findOne({
                where: {
                    id: locationId,
                    agentId,
                },
                transaction: txn,
            });

            if (!location) {
                throw new NotFoundError('Location not found');
            }

            await location.update(locationData, { transaction: txn });

            // Only commit if we created our own transaction
            if (!transaction) {
                await txn.commit();
            }

            return location;
        } catch (error) {
            // Only rollback if we created our own transaction
            if (!transaction) {
                await txn.rollback();
            }
            throw error;
        }
    }

    /**
     * Delete an agent's location
     */
    static async deleteAgentLocation(id: string, agentId: string): Promise<void> {
        const location = await AgentLocation.findOne({
            where: { id, agentId },
        });

        if (!location) {
            throw new NotFoundError('Location not found');
        }

        await location.destroy();
    }

    /**
     * Get all locations for an agent
     */
    static async getAgentLocations(
        agentId: string,
        transaction?: Transaction,
    ): Promise<AgentLocation[]> {
        return await AgentLocation.findAll({
            where: {
                agentId,
            },
            transaction,
        });
    }

    /**
     * Update agent's current real-time location
     */
    static async updateCurrentLocation(
        agentId: string,
        latitude: number,
        longitude: number,
        accuracy?: number,
        address?: string,
        transaction?: Transaction,
    ): Promise<AgentLocation> {
        const txn = transaction || (await Database.transaction());

        try {
            // Find existing current_location record
            let currentLocation = await AgentLocation.findOne({
                where: {
                    agentId,
                    locationType: 'current_location',
                },
                transaction: txn,
            });

            const locationData: Partial<IAgentLocation> = {
                latitude,
                longitude,
                accuracy: accuracy || undefined,
                address: address || undefined,
                timestamp: Date.now(),
                isActive: true,
                radius: 0, // Not applicable for current location
            };

            if (currentLocation) {
                // Update existing current location
                await currentLocation.update(locationData, { transaction: txn });
            } else {
                // Create new current location record
                currentLocation = await AgentLocation.create({
                    agentId,
                    locationType: 'current_location',
                    name: 'Current Location',
                    ...locationData,
                } as IAgentLocation, { transaction: txn });
            }

            // Only commit if we created our own transaction
            if (!transaction) {
                await txn.commit();
            }

            return currentLocation;
        } catch (error) {
            // Only rollback if we created our own transaction
            if (!transaction) {
                await txn.rollback();
            }
            throw error;
        }
    }

    /**
     * Get agent's current location
     */
    static async getCurrentLocation(
        agentId: string,
        transaction?: Transaction,
    ): Promise<AgentLocation | null> {
        return await AgentLocation.findOne({
            where: {
                agentId,
                locationType: 'current_location',
                isActive: true,
            },
            transaction,
        });
    }

    /**
     * Find nearby agents based on coordinates and radius
     */
    static async findNearbyAgents(
        latitude: number,
        longitude: number,
        initialRadius: number = 5,
        maxRadius: number = 20,
        radiusIncrement: number = 5,
        limit: number = 10,
    ): Promise<User[]> {
        // Start with a small radius and gradually expand if no agents are found
        let currentRadius = initialRadius;
        let agents: UserWithLocations[] = [];

        while (currentRadius <= maxRadius && agents.length === 0) {
            // Find agents within the current radius
            const nearbyAgents = (await User.findAll({
                where: {
                    'status.userType': 'agent',
                },
                include: [
                    {
                        model: UserSettings,
                        as: 'settings',
                        where: {
                            [Op.and]: [
                                Sequelize.where(
                                    Sequelize.fn(
                                        'jsonb_extract_path_text',
                                        Sequelize.col('"settings"."agentMetaData"'),
                                        'currentStatus',
                                    ),
                                    'available',
                                ),
                                Sequelize.where(
                                    Sequelize.fn(
                                        'jsonb_extract_path_text',
                                        Sequelize.col('"settings"."agentMetaData"'),
                                        'isAcceptingOrders',
                                    ),
                                    'true',
                                ),
                            ],
                        },
                    },
                    {
                        model: AgentLocation,
                        as: 'locations',
                        where: {
                            isActive: true,
                        },
                        required: true,
                    },
                ],
            })) as UserWithLocations[];

            // Filter agents by distance
            agents = nearbyAgents.filter(agent => {
                if (!agent.locations || agent.locations.length === 0) return false;

                // Calculate the distance for each location and use the closest one
                const distances = agent.locations.map(location => {
                    return this.calculateDistance(
                        latitude,
                        longitude,
                        location.latitude,
                        location.longitude,
                    );
                });

                const minDistance = Math.min(...distances);
                return minDistance <= currentRadius;
            });

            // If no agents found, increase the radius
            if (agents.length === 0) {
                currentRadius += radiusIncrement;
            }
        }

        // Sort agents by distance and limit the results
        return agents
            .sort((a, b) => {
                const distanceA = Math.min(
                    ...(a.locations?.map(loc =>
                        this.calculateDistance(latitude, longitude, loc.latitude, loc.longitude),
                    ) || [0]),
                );
                const distanceB = Math.min(
                    ...(b.locations?.map(loc =>
                        this.calculateDistance(latitude, longitude, loc.latitude, loc.longitude),
                    ) || [0]),
                );
                return distanceA - distanceB;
            })
            .slice(0, limit);
    }

    /**
     * Find the nearest available agent
     * @deprecated Use findNearestAgent with latitude and longitude parameters instead
     */
    static async findNearestAgentLegacy(latitude: number, longitude: number): Promise<User | null> {
        const agents = await this.findNearbyAgents(latitude, longitude, 5, 20, 5, 1);
        return agents.length > 0 ? agents[0] : null;
    }

    /**
     * Find agents near a specific market
     */
    static async findAgentsNearMarket(marketId: string): Promise<User[]> {
        // Get the market location
        const market = await Market.findByPk(marketId);
        if (!market || !market.location) {
            throw new NotFoundError('Market not found or has no location');
        }

        // Use findNearbyAgents to find agents near the market
        return await this.findNearbyAgents(market.location.latitude, market.location.longitude);
    }

    /**
     * Calculate the distance between two points using the Haversine formula
     */
    private static calculateDistance(
        lat1: number,
        lon1: number,
        lat2: number,
        lon2: number,
    ): number {
        const R = 6371; // Radius of the earth in km
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(lat1)) *
                Math.cos(this.deg2rad(lat2)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in km
    }

    /**
     * Convert degrees to radians
     */
    private static deg2rad(deg: number): number {
        return deg * (Math.PI / 180);
    }

    /**
     * Get preferred locations for agent
     */
    static async getPreferredLocations(agentId: string): Promise<AgentLocation[]> {
        return await AgentLocation.findAll({
            where: {
                agentId,
                locationType: 'service_area',
                isActive: true,
            },
            order: [['createdAt', 'DESC']],
        });
    }

    /**
     * Add preferred location for agent
     */
    static async addPreferredLocation(locationData: {
        agentId: string;
        name: string;
        address: string;
        latitude: number;
        longitude: number;
        radius: number;
        locationType: string;
        isActive: boolean;
    }): Promise<AgentLocation> {
        return await AgentLocation.create({
            agentId: locationData.agentId,
            name: locationData.name,
            address: locationData.address,
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            radius: locationData.radius,
            locationType: locationData.locationType as 'service_area' | 'current_location',
            isActive: locationData.isActive,
        } as any);
    }

    /**
     * Remove preferred location for agent
     */
    static async removePreferredLocation(agentId: string, locationId: string): Promise<void> {
        const location = await AgentLocation.findOne({
            where: {
                id: locationId,
                agentId,
                locationType: 'service_area',
            },
        });

        if (!location) {
            throw new Error('Location not found or access denied');
        }

        await location.destroy();
    }

    /**
     * Agent accepts an assigned order
     * @param agentId The agent ID
     * @param orderId The order ID
     * @returns Updated order
     */
    static async acceptOrder(agentId: string, orderId: string): Promise<Order> {
        return Database.transaction(async (transaction: Transaction) => {
            // Get the order and verify it's assigned to this agent
            const order = await Order.findOne({
                where: {
                    id: orderId,
                    agentId: agentId,
                    status: 'accepted', // Order should be in 'accepted' status (assigned but not started)
                },
                include: [
                    {
                        model: ShoppingList,
                        as: 'shoppingList',
                        attributes: ['id', 'status'],
                    },
                ],
                transaction,
            });

            if (!order) {
                throw new NotFoundError('Order not found or not assigned to this agent');
            }

            // Update order status to 'in_progress' (agent has started working)
            await order.update(
                {
                    status: 'in_progress',
                },
                { transaction }
            );

            // Update shopping list status to 'processing' (agent is now actively working)
            if (order.shoppingListId) {
                await ShoppingList.update(
                    {
                        status: 'processing',
                    },
                    {
                        where: { id: order.shoppingListId },
                        transaction,
                    }
                );
            }

            // Update agent status to busy and actively working
            await this.setAgentBusy(agentId, orderId, transaction);

            // Activate chat channel for agent-customer communication
            await this.activateOrderChat(agentId, orderId, transaction);

            logger.info(`Agent ${agentId} accepted and started working on order ${orderId}`);

            return order;
        });
    }

    /**
     * Agent rejects an assigned order
     * @param agentId The agent ID
     * @param orderId The order ID
     * @param reason Reason for rejection
     * @returns Boolean indicating success
     */
    static async rejectOrder(agentId: string, orderId: string, reason?: string): Promise<boolean> {
        return Database.transaction(async (transaction: Transaction) => {
            // Get the order and verify it's assigned to this agent
            const order = await Order.findOne({
                where: {
                    id: orderId,
                    agentId: agentId,
                    status: 'accepted', // Can only reject assigned but not started orders
                },
                transaction,
            });

            if (!order) {
                throw new NotFoundError('Order not found or not assigned to this agent');
            }

            // Remove agent assignment and reset order to pending
            await order.update(
                {
                    status: 'pending',
                },
                { transaction }
            );
            
            // Clear the agentId separately to avoid type issues
            await Database.query(
                'UPDATE "Orders" SET "agentId" = NULL WHERE "id" = :orderId',
                {
                    replacements: { orderId },
                    transaction,
                }
            );

            // Remove agent assignment from shopping list
            if (order.shoppingListId) {
                await ShoppingList.update(
                    {
                        status: 'accepted', // Reset to accepted for reassignment
                    },
                    {
                        where: { id: order.shoppingListId },
                        transaction,
                    }
                );
            }

            // Update agent status back to available
            await this.updateAgentStatus(agentId, 'available', true, transaction);

            logger.info(`Agent ${agentId} rejected order ${orderId}. Reason: ${reason || 'No reason provided'}`);

            // Queue the order for reassignment to another agent
            const { queueAgentAssignment } = await import('../queues/agent.queue');
            await queueAgentAssignment(orderId, order.shoppingListId!, order.customerId, 1); // 1 minute delay

            return true;
        });
    }

    /**
     * Get orders assigned to an agent
     * @param agentId The agent ID
     * @param status Optional status filter
     * @param limit Number of orders to return (default: 20)
     * @returns Array of orders
     */
    static async getAgentOrders(
        agentId: string,
        status?: 'accepted' | 'in_progress' | 'completed',
        limit: number = 20
    ): Promise<Order[]> {
        const whereClause: any = {
            agentId: agentId,
        };

        if (status) {
            whereClause.status = status;
        }

        return await Order.findAll({
            where: whereClause,
            include: [
                {
                    model: ShoppingList,
                    as: 'shoppingList',
                    include: [
                        {
                            model: Market,
                            as: 'market',
                            attributes: ['id', 'name', 'location'],
                        },
                    ],
                },
            ],
            order: [['createdAt', 'DESC']],
            limit,
        });
    }

    /**
     * Get available orders for an agent based on their location and preferences
     * @param agentId The agent ID
     * @param limit Number of orders to return (default: 10)
     * @returns Array of available orders
     */
    static async getAvailableOrdersForAgent(agentId: string, limit: number = 10): Promise<Order[]> {
        // Get agent locations
        const agentLocations = await this.getAgentLocations(agentId);
        
        if (agentLocations.length === 0) {
            logger.warn(`Agent ${agentId} has no locations set - returning empty order list`);
            return [];
        }

        // Get orders that are pending and not assigned to any agent
        const availableOrders = await Order.findAll({
            where: {
                status: 'pending',
                paymentStatus: 'completed',
                agentId: { [Op.is]: null },
            } as any,
            include: [
                {
                    model: ShoppingList,
                    as: 'shoppingList',
                    where: {
                        status: 'accepted',
                    },
                    include: [
                        {
                            model: Market,
                            as: 'market',
                            attributes: ['id', 'name', 'location'],
                        },
                    ],
                },
            ],
            order: [['createdAt', 'ASC']],
            limit: limit * 3, // Get more orders to filter by location
        });

        // Filter orders by agent's service areas and sort by proximity
        const ordersByDistance = availableOrders
            .map(order => {
                if (!order.shoppingList?.market?.location) {
                    return { order, distance: Infinity };
                }

                const marketLat = order.shoppingList.market.location.latitude;
                const marketLng = order.shoppingList.market.location.longitude;

                // Find the closest agent location to this market
                let minDistance = Infinity;
                
                for (const agentLocation of agentLocations) {
                    const distance = this.calculateDistance(
                        marketLat,
                        marketLng,
                        agentLocation.latitude,
                        agentLocation.longitude
                    );
                    
                    // If it's a service area, check if market is within radius
                    if (agentLocation.locationType === 'service_area' && distance <= agentLocation.radius) {
                        minDistance = Math.min(minDistance, distance);
                    } else if (agentLocation.locationType === 'current_location') {
                        minDistance = Math.min(minDistance, distance);
                    }
                }

                return { order, distance: minDistance };
            })
            .filter(item => item.distance !== Infinity) // Only include orders within service areas
            .sort((a, b) => a.distance - b.distance)
            .slice(0, limit)
            .map(item => item.order);

        logger.info(`Found ${ordersByDistance.length} available orders for agent ${agentId} within their service areas`);

        return ordersByDistance;
    }

    /**
     * Activate chat channel for agent-customer communication
     * @param agentId The agent ID
     * @param orderId The order ID  
     * @param transaction Optional transaction
     * @returns void
     */
    private static async activateOrderChat(agentId: string, orderId: string, transaction?: Transaction): Promise<void> {
        try {
            // Get order with customer and agent info
            const order = await Order.findByPk(orderId, {
                include: [
                    {
                        model: User,
                        as: 'customer',
                        attributes: ['id', 'firstName', 'lastName'],
                    },
                    {
                        model: User,
                        as: 'agent',
                        attributes: ['id', 'firstName', 'lastName'],
                    },
                ],
                transaction,
            });

            if (!order || !order.customer) {
                logger.warn(`Cannot activate chat for order ${orderId} - order or customer not found`);
                return;
            }

            // Get agent details
            const agent = await User.findByPk(agentId, {
                attributes: ['id', 'firstName', 'lastName'],
                transaction,
            });

            if (!agent) {
                logger.warn(`Cannot activate chat for order ${orderId} - agent ${agentId} not found`);
                return;
            }

            // Activate chat channel using the chat service
            const chatActivation = {
                orderId: orderId,
                activatedBy: {
                    id: agentId,
                    type: 'agent' as const,
                    name: `${agent.firstName} ${agent.lastName}`,
                },
            };

            await ChatService.activateChat(chatActivation);

            // Send initial message to establish connection
            const welcomeMessage = {
                orderId: orderId,
                senderId: agentId,
                senderType: 'agent' as const,
                message: `Hi ${order.customer.firstName}! I'm ${agent.firstName}, your personal shopping agent. I've started working on your order and I'm here to help with any questions or updates you need. Let's get shopping! 🛒`,
            };

            await ChatService.saveMessage(welcomeMessage);

            logger.info(`Chat channel activated for order ${orderId} between agent ${agentId} and customer ${order.customerId}`);
        } catch (error) {
            logger.error(`Failed to activate chat for order ${orderId}:`, error);
            // Don't throw - chat activation should not fail the order acceptance
        }
    }

    /**
     * Send a chat message from agent to customer
     * @param agentId The agent ID
     * @param orderId The order ID
     * @param message The message content
     * @param imageUrl Optional image URL
     * @returns Chat message
     */
    static async sendChatMessage(
        agentId: string,
        orderId: string,
        message: string,
        imageUrl?: string
    ): Promise<any> {
        // Verify agent has access to this order
        const order = await Order.findOne({
            where: {
                id: orderId,
                agentId: agentId,
            },
        });

        if (!order) {
            throw new NotFoundError('Order not found or not assigned to this agent');
        }

        const messageData = {
            orderId,
            senderId: agentId,
            senderType: 'agent' as const,
            message,
            imageUrl,
        };

        return await ChatService.saveMessage(messageData);
    }

    /**
     * Get chat messages for an order (agent view)
     * @param agentId The agent ID
     * @param orderId The order ID
     * @param limit Number of messages to retrieve
     * @returns Chat messages
     */
    static async getChatMessages(agentId: string, orderId: string, limit: number = 50): Promise<any[]> {
        // Verify agent has access to this order
        const order = await Order.findOne({
            where: {
                id: orderId,
                agentId: agentId,
            },
        });

        if (!order) {
            throw new NotFoundError('Order not found or not assigned to this agent');
        }

        return await ChatService.getMessagesByOrderId(orderId);
    }
}
