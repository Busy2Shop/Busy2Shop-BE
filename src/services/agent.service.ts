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
    static async getAgents(queryData?: IViewAgentsQuery): Promise<{ agents: User[], count: number, totalPages?: number }> {
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
        const agent = await User.findOne({
            where: {
                id,
                // Fix the ambiguous status column by specifying the table
                [Op.and]: [
                    Sequelize.where(
                        Sequelize.fn('jsonb_extract_path_text', Sequelize.col('"User"."status"'), 'userType'),
                        'agent'
                    ),
                ],
            },
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

        if (!agent) {
            throw new NotFoundError('Agent not found');
        }

        return agent;
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
            include: [{
                model: ShoppingList,
                attributes: [],
            }],
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
        excludeAgentIds: string[] = []
    ): Promise<User[]> {
        // First, get the shopping list to get the market ID
        const shoppingList = await ShoppingList.findByPk(shoppingListId);
        if (!shoppingList) {
            throw new NotFoundError('Shopping list not found');
        }

        // Make sure we have a market ID
        if (!shoppingList.marketId) {
            throw new NotFoundError('Shopping list has no associated market');
        }

        // Get the market to get its location
        const market = await Market.findByPk(shoppingList.marketId);
        if (!market || !market.location) {
            // Instead of throwing an error, return an empty array if no market location
            // This allows the code to continue and try other methods to find agents
            console.warn(`Market ${shoppingList.marketId} not found or has no location. Returning empty agent list.`);
            return [];
        }

        // Now we can use the market's location to find agents near it
        const agents = await this.findNearbyAgents(
            market.location.latitude,
            market.location.longitude,
        );

        // Filter out excluded agents
        return agents.filter(agent => !excludeAgentIds.includes(agent.id));
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
        excludeAgentIds: string[] = []
    ): Promise<User | undefined> {
        // Get all available agents with their locations
        const availableAgents = await User.findAll({
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
        }) as UserWithLocations[];

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
                    location.longitude
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

            if (order.status !== 'pending') {
                throw new BadRequestError('Can only assign pending orders to agents');
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
            await order.update({
                agentId,
                status: 'accepted',
                acceptedAt: new Date(),
            }, { transaction });

            // Also update the shopping list
            await ShoppingList.update(
                {
                    agentId,
                    status: 'accepted',
                },
                {
                    where: { id: order.shoppingListId },
                    transaction,
                }
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
    static async updateAgentDocuments(agentId: string, documents: Partial<IAgentMeta>): Promise<User> {
        return await Database.transaction(async (transaction: Transaction) => {
            // First check if agent exists
            const agent = await User.findOne({
                where: {
                    id: agentId,
                    'status.userType': 'agent',
                },
                include: [{
                    model: UserSettings,
                    as: 'settings',
                }],
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
                                Sequelize.literal(`'{"nin":"","images":[],"currentStatus":"offline","lastStatusUpdate":"${new Date().toISOString()}","isAcceptingOrders":false}'::jsonb`)
                            ),
                            // Path to the property
                            Sequelize.literal('\'{nin}\''),
                            // Value to set
                            Sequelize.literal(`'"${documents.nin}"'`),
                            // Create if it doesn't exist
                            true
                        ),
                    },
                    {
                        where: { userId: agentId },
                        transaction,
                    }
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
                                Sequelize.literal(`'{"nin":"","images":[],"currentStatus":"offline","lastStatusUpdate":"${new Date().toISOString()}","isAcceptingOrders":false}'::jsonb`)
                            ),
                            // Path to the image property
                            Sequelize.literal('\'{images}\''),
                            // If images are missing, initialize with an empty array
                            Sequelize.fn(
                                'COALESCE',
                                Sequelize.fn(
                                    'jsonb_extract_path',
                                    Sequelize.col('agentMetaData'),
                                    'images'
                                ),
                                Sequelize.literal('\'[]\'::jsonb')
                            ),
                            // Create if it doesn't exist
                            true
                        ),
                    },
                    {
                        where: { userId: agentId },
                        transaction,
                    }
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
                            )`
                            ),
                        },
                        {
                            where: { userId: agentId },
                            transaction,
                        }
                    );
                }
            }

            // Get the updated agent
            const updatedAgent = await User.findOne({
                where: {
                    id: agentId,
                    'status.userType': 'agent',
                },
                include: [{
                    model: UserSettings,
                    as: 'settings',
                }],
                transaction,
            });

            return updatedAgent!;
        });
    }


    /**
     * Update an agent's status
     */
    static async updateAgentStatus(
        userId: string,
        status: 'available' | 'busy' | 'away' | 'offline',
        isAcceptingOrders: boolean = true,
        transaction?: Transaction
    ): Promise<User> {
        // Check if the user exists
        const user = await User.findByPk(userId, {
            include: [{
                model: UserSettings,
                as: 'settings',
            }],
            transaction,
        });

        if (!user) {
            throw new NotFoundError('User not found');
        }

        if (!user.settings) {
            throw new NotFoundError('User settings not found');
        }

        const currentTime = new Date().toISOString();

        // Create a transaction if one wasn't provided
        const txn = transaction || await Database.transaction();

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
                },
                {
                    where: { userId: userId },
                    transaction: txn,
                }
            );

            // Only commit if we created our own transaction
            if (!transaction) {
                await txn.commit();
            }

            // Fetch and return the updated user
            return await User.findByPk(userId, {
                include: [{
                    model: UserSettings,
                    as: 'settings',
                }],
                transaction,
            }) as User;
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
    static async updateAgentAcceptingOrders(userId: string, isAcceptingOrders: boolean): Promise<User> {
        // Check if the user exists
        const user = await User.findByPk(userId, {
            include: [{
                model: UserSettings,
                as: 'settings',
            }],
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
                }
            );

            // Fetch and return the updated user
            return await User.findByPk(userId, {
                include: [{
                    model: UserSettings,
                    as: 'settings',
                }],
                transaction,
            }) as User;
        });
    }

    /**
     * Set agent as busy with a specific order
     */
    static async setAgentBusy(agentId: string, orderId: string, transaction?: Transaction): Promise<User> {
        // Use the provided transaction or create a new one
        const txn = transaction || await Database.transaction();

        try {
            const agent = await User.findOne({
                where: {
                    id: agentId,
                    'status.userType': 'agent',
                },
                include: [{
                    model: UserSettings,
                    as: 'settings',
                }],
                transaction: txn,
            });

            if (!agent) {
                throw new NotFoundError('Agent not found');
            }

            if (!agent.settings) {
                throw new NotFoundError('User settings not found');
            }

            const currentTime = new Date().toISOString();

            // Update only the status-related fields
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
                                '"busy"'::jsonb,
                                true
                            ),
                            '{lastStatusUpdate}',
                            '"${currentTime}"'::jsonb,
                            true
                        ),
                        '{isAcceptingOrders}',
                        'false'::jsonb,
                        true
                    )
                `),
                },
                {
                    where: { userId: agentId },
                    transaction: txn,
                }
            );

            // Only commit if we created our own transaction
            if (!transaction) {
                await txn.commit();
            }

            // Fetch the updated agent to return
            return await User.findOne({
                where: {
                    id: agentId,
                    'status.userType': 'agent',
                },
                include: [{
                    model: UserSettings,
                    as: 'settings',
                }],
                transaction: txn,
            }) as User;
        } catch (error) {
            // Only rollback if we created our own transaction
            if (!transaction) {
                await txn.rollback();
            }
            throw error;
        }
    }

    /**
     * Get agent's current status
     */
    static async getAgentStatus(agentId: string): Promise<{
        status: AgentStatus;
        isAcceptingOrders: boolean;
        lastStatusUpdate: string;
    }> {
        const agent = await User.findByPk(agentId);

        if (!agent) {
            throw new NotFoundError('Agent not found');
        }

        if (agent.status.userType !== 'agent') {
            throw new BadRequestError('User is not an agent');
        }

        return {
            status: agent.settings?.agentMetaData?.currentStatus ?? 'offline',
            isAcceptingOrders: agent.settings?.agentMetaData?.isAcceptingOrders || false,
            lastStatusUpdate: agent.settings?.agentMetaData?.lastStatusUpdate ?? new Date().toISOString(),
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
            include: [{
                model: UserSettings,
                as: 'settings',
                where: {
                    agentMetaData: {
                        [Op.and]: [
                            { currentStatus: 'available' },
                            { isAcceptingOrders: true },
                        ],
                    },
                },
            }],
        });
    }

    /**
    * Add a new preferred location for an agent
    */
    static async addAgentLocation(agentId: string, locationData: Partial<IAgentLocation>, transaction?: Transaction): Promise<AgentLocation> {
        // Use the provided transaction or create a new one
        const txn = transaction || await Database.transaction();

        try {
            const agent = await User.findByPk(agentId, { transaction: txn });
            if (!agent) {
                throw new NotFoundError('Agent not found');
            }

            if (agent.status.userType !== 'agent') {
                throw new BadRequestError('User is not an agent');
            }

            // Create a new location with the required fields
            const newLocation = await AgentLocation.create({
                agentId,
                latitude: locationData.latitude ?? 0,
                longitude: locationData.longitude ?? 0,
                radius: locationData.radius ?? 5.0,
                isActive: locationData.isActive !== undefined ? locationData.isActive : true,
                name: locationData.name,
                address: locationData.address,
            } as IAgentLocation, { transaction: txn });

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
    static async updateAgentLocation(agentId: string, locationId: string, locationData: Partial<IAgentLocation>, transaction?: Transaction): Promise<AgentLocation> {
        // Use the provided transaction or create a new one
        const txn = transaction || await Database.transaction();

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
    static async getAgentLocations(agentId: string, transaction?: Transaction): Promise<AgentLocation[]> {
        return await AgentLocation.findAll({
            where: {
                agentId,
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
        limit: number = 10
    ): Promise<User[]> {
        // Start with a small radius and gradually expand if no agents are found
        let currentRadius = initialRadius;
        let agents: UserWithLocations[] = [];

        while (currentRadius <= maxRadius && agents.length === 0) {
            // Find agents within the current radius
            const nearbyAgents = await User.findAll({
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
                                        'currentStatus'
                                    ),
                                    'available'
                                ),
                                Sequelize.where(
                                    Sequelize.fn(
                                        'jsonb_extract_path_text',
                                        Sequelize.col('"settings"."agentMetaData"'),
                                        'isAcceptingOrders'
                                    ),
                                    'true'
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
            }) as UserWithLocations[];

            // Filter agents by distance
            agents = nearbyAgents.filter(agent => {
                if (!agent.locations || agent.locations.length === 0) return false;

                // Calculate the distance for each location and use the closest one
                const distances = agent.locations.map(location => {
                    return this.calculateDistance(
                        latitude,
                        longitude,
                        location.latitude,
                        location.longitude
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
                const distanceA = Math.min(...(a.locations?.map(loc =>
                    this.calculateDistance(latitude, longitude, loc.latitude, loc.longitude)
                ) || [0]));
                const distanceB = Math.min(...(b.locations?.map(loc =>
                    this.calculateDistance(latitude, longitude, loc.latitude, loc.longitude)
                ) || [0]));
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
        return await this.findNearbyAgents(
            market.location.latitude,
            market.location.longitude
        );
    }

    /**
     * Calculate the distance between two points using the Haversine formula
     */
    private static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371; // Radius of the earth in km
        const dLat = this.deg2rad(lat2 - lat1);
        const dLon = this.deg2rad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
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