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
     * Get available agents for an order at a specific market
     * @param shoppingListId The ID of the shopping list for the order
     * @param excludeAgentIds Optional array of agent IDs to exclude from the search
     * @returns Array of available agents
     */
    static async getAvailableAgentsForOrder(
        shoppingListId: string,
        excludeAgentIds: string[] = [],
    ): Promise<User[]> {
        // First, get the shopping list to get the market ID
        const shoppingList = await ShoppingList.findByPk(shoppingListId);
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

        // Get all available agents with KYC verification and proper status checks
        const availableAgents = await User.findAll({
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
                                Sequelize.where(
                                    Sequelize.fn('jsonb_extract_path_text', Sequelize.col('"settings"."agentMetaData"'), 'kycComplete'),
                                    'true'
                                ),
                            ],
                        },
                    },
                    required: true, // Exclude agents without proper settings
                },
            ],
            limit: 10, // Limit to first 10 available agents
            order: [['createdAt', 'ASC']], // Prioritize older agents (more experienced)
        });

        // Log agent availability for monitoring
        console.log(`Found ${availableAgents.length} KYC-verified, available agents for shopping list ${shoppingListId}`);
        
        // Filter out agents who don't meet all criteria (additional safety check)
        const fullyVerifiedAgents = availableAgents.filter(agent => {
            const agentMeta = agent.settings?.agentMetaData;
            const isFullyVerified = (
                agent.settings?.isKycVerified === true &&
                agentMeta?.kycComplete === true &&
                agentMeta?.currentStatus === 'available' &&
                agentMeta?.isAcceptingOrders === true
            );
            
            if (!isFullyVerified) {
                console.log(`Agent ${agent.id} filtered out - KYC: ${agent.settings?.isKycVerified}, Status: ${agentMeta?.currentStatus}, Accepting: ${agentMeta?.isAcceptingOrders}, KYC Complete: ${agentMeta?.kycComplete}`);
            }
            
            return isFullyVerified;
        });

        // If we have market location, try to sort by proximity (optional enhancement)
        if (shoppingList.marketId && fullyVerifiedAgents.length > 0) {
            const market = await Market.findByPk(shoppingList.marketId);
            if (market && market.location) {
                console.log(`Found ${fullyVerifiedAgents.length} agents for market ${market.name}`);
            }
        }

        return fullyVerifiedAgents;
    }

    /**
     * Find the nearest available agent to a location
     * @param latitude The latitude coordinate
     * @param longitude The longitude coordinate
     * @param excludeAgentIds Optional array of agent IDs to exclude from the search
     * @returns The nearest available agent or undefined if none found
     */
    static async findNearestAgent(
        latitude: number,
        longitude: number,
        excludeAgentIds: string[] = [],
    ): Promise<User | undefined> {
        // Get all available agents with their locations
        const availableAgents = (await User.findAll({
            where: {
                'status.userType': 'agent',
                'status.availability': 'available',
                id: {
                    [Op.notIn]: excludeAgentIds,
                },
            },
            include: [
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

        if (availableAgents.length === 0) {
            return undefined;
        }

        // Calculate distances and find the nearest agent
        let nearestAgent: User | undefined;
        let shortestDistance = Infinity;

        for (const agent of availableAgents) {
            if (!agent.locations || agent.locations.length === 0) continue;

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

            if (minDistance < shortestDistance) {
                shortestDistance = minDistance;
                nearestAgent = agent;
            }
        }

        return nearestAgent;
    }

    static async assignOrderToAgent(orderId: string, agentId: string): Promise<Order> {
        return Database.transaction(async (transaction: Transaction) => {
            // Get the order
            const order = await Order.findByPk(orderId, { transaction });

            if (!order) {
                throw new NotFoundError('Order not found');
            }

            // Allow assignment to pending orders or orders that need reassignment
            if (!['pending', 'accepted'].includes(order.status)) {
                throw new BadRequestError('Can only assign pending or accepted orders to agents');
            }

            // Verify the agent exists and is active
            const agent = await User.findOne({
                where: {
                    id: agentId,
                    'status.userType': 'agent',
                    'status.activated': true,
                    'status.emailVerified': true,
                },
                include: [
                    {
                        model: UserSettings,
                        as: 'settings',
                        where: {
                            isBlocked: false,
                            isDeactivated: false,
                        },
                    },
                ],
                transaction,
            });

            if (!agent) {
                throw new NotFoundError('Agent not found or is inactive');
            }

            // Update the order
            await order.update(
                {
                    agentId,
                    status: 'accepted',
                    acceptedAt: new Date(),
                },
                { transaction },
            );

            // Also update the shopping list (assign agent, but don't change status - it's already 'accepted')
            await ShoppingList.update(
                {
                    agentId,
                    // Don't change status - it's already 'accepted' from payment confirmation
                },
                {
                    where: { id: order.shoppingListId },
                    transaction,
                },
            );

            // Update agent status to busy
            await this.setAgentBusy(agentId, orderId, transaction);

            return order;
        });
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
    ): Promise<User> {
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

        // Get current agent metadata or create default
        const currentMetaData = agent.settings.agentMetaData || {
            nin: '',
            images: [],
            currentStatus: 'offline' as AgentStatus,
            lastStatusUpdate: new Date().toISOString(),
            isAcceptingOrders: false,
        };

        // Update status fields
        const updatedMetaData = {
            ...currentMetaData,
            currentStatus: 'busy' as AgentStatus,
            isAcceptingOrders: false,
            lastStatusUpdate: new Date().toISOString(),
        };

        // Update using simple JSON assignment
        await UserSettings.update(
            {
                agentMetaData: updatedMetaData,
            },
            {
                where: { userId: agentId },
                transaction,
            }
        );

        // Return the updated agent
        return (await User.findOne({
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
        })) as User;
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
}
