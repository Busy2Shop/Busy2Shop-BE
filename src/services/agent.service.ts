/* eslint-disable @typescript-eslint/no-explicit-any */
import { FindAndCountOptions, Op, Transaction } from 'sequelize';
import User from '../models/user.model';
import UserSettings, { IAgentMeta } from '../models/userSettings.model';
import Market from '../models/market.model';
import ShoppingList from '../models/shoppingList.model';
import Order from '../models/order.model';
import { BadRequestError, NotFoundError } from '../utils/customErrors';
import Pagination, { IPaging } from '../utils/pagination';
import { Database } from '../models';


export interface IViewAgentsQuery {
    page?: number;
    size?: number;
    q?: string; // Search query
    isActive?: boolean;
    lat?: number; // Latitude for location-based search
    lng?: number; // Longitude for location-based search
    distance?: number; // Distance in kilometers
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
                'status.userType': 'agent',
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

    static async getNearbyAgents(latitude: number, longitude: number, distance: number = 5, queryData?: IViewAgentsQuery): Promise<{ agents: User[], count: number, totalPages?: number }> {
        // TODO: Implement geospatial search with PostGIS or similar
        // This is a placeholder implementation. In a real application, you'd use
        // a geospatial query to find agents within a certain distance.
        console.log(`Searching for agents near ${latitude}, ${longitude} within ${distance}km`);

        // For now, return all agents
        return await this.getAgents(queryData);
    }

    static async getAvailableAgentsForOrder(shoppingListId: string): Promise<User[]> {
        // Get the shopping list to find its location
        const shoppingList = await ShoppingList.findByPk(shoppingListId, {
            include: [
                {
                    model: Market,
                    as: 'market',
                },
            ],
        });

        if (!shoppingList?.market) {
            throw new NotFoundError('Shopping list or market not found');
        }

        // const market = shoppingList.market;

        // Find active agents (not blocked or deactivated)
        // In a real application.
        // One would filter agents based on:
        // 1. Distance to the market
        // 2. Agent availability/schedule
        // 3. Agent rating/performance
        // 4. Agent specialization (if relevant)

        return await User.findAll({
            where: {
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
        });
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
            const agent = await User.findOne({
                where: {
                    id: agentId,
                    'status.userType': 'agent',
                },
                transaction,
            });

            if (!agent) {
                throw new NotFoundError('Agent not found');
            }

            // Get current agent metadata or initialize the empty object
            const currentAgentMeta = agent.agentMeta || {};
            
            // Update with new document data
            const updatedAgentMeta = {
                ...currentAgentMeta,
                ...(documents.nin && { nin: documents.nin }),
                ...(documents.images && { 
                    images: documents.images.length > 0 
                        ? [...(currentAgentMeta.images || []), ...documents.images]
                        : currentAgentMeta.images || [],
                }),
            };

            // Update agent with new metadata
            await agent.update({ agentMeta: updatedAgentMeta }, { transaction });

            return agent;
        });
    }
}