/* eslint-disable @typescript-eslint/no-explicit-any */
import { Transaction, Op, FindAndCountOptions } from 'sequelize';
import Order, { IOrder } from '../models/order.model';
import ShoppingList from '../models/shoppingList.model';
import ShoppingListItem from '../models/shoppingListItem.model';
import User from '../models/user.model';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/customErrors';
import Pagination, { IPaging } from '../utils/pagination';
import { Database } from '../models';

export interface IViewOrdersQuery {
    page?: number;
    size?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
}

export default class OrderService {
    /**
     * Helper Functions for the Order Service
     */

    /**
     * Applies common order filtering criteria to a where clause
     *
     * @param whereClause - The existing where conditions object to modify
     * @param queryData - Query parameters containing filtering options
     * @returns The updated where clause with applied filters
     */
    private static applyOrderFilters(
        whereClause: Record<string, any>,
        queryData?: IViewOrdersQuery
    ): Record<string, any> {
        const { status, startDate, endDate } = queryData || {};

        // Filter by status if provided
        if (status) {
            whereClause.status = status;
        }

        // Filter by date range if provided
        if (startDate && endDate) {
            whereClause.createdAt = {
                [Op.between]: [new Date(startDate), new Date(endDate)],
            };
        } else if (startDate) {
            whereClause.createdAt = {
                [Op.gte]: new Date(startDate),
            };
        } else if (endDate) {
            whereClause.createdAt = {
                [Op.lte]: new Date(endDate),
            };
        }

        return whereClause;
    }


    /**
     * Executes a paginated query for orders and formats the results
     *
     * @param queryOptions - The query configuration for finding orders
     * @param queryData - Pagination parameters
     * @returns Formatted query results with pagination metadata if applicable
     */
    private static async executeOrderQuery(
        queryOptions: FindAndCountOptions<Order>,
        queryData?: IViewOrdersQuery
    ): Promise<{ orders: Order[], count: number, totalPages?: number }> {
        const { page, size } = queryData || {};

        // Handle pagination
        if (page && size && page > 0 && size > 0) {
            const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);
            queryOptions.limit = limit ?? 0;
            queryOptions.offset = offset ?? 0;
        }

        const { rows: orders, count } = await Order.findAndCountAll(queryOptions);

        // Calculate pagination metadata if applicable
        if (page && size && orders.length > 0) {
            const totalPages = Pagination.estimateTotalPage({ count, limit: size } as IPaging);
            return { orders, count, ...totalPages };
        } else {
            return { orders, count };
        }
    }


    /**
     * Validates if a user has permission to change an order to the requested status
     *
     * @param order - The order being updated
     * @param user - User attempting to update the order
     * @param userId - ID of the user attempting the update
     * @param status - The requested new status
     * @throws {ForbiddenError|BadRequestError} - When user lacks permission for the requested change
     */
    private static validateOrderStatusPermissions(
        order: Order,
        user: User,
        userId: string,
        status: string
    ): void {
        if (user.status.userType === 'agent') {
            // Agents can only update orders assigned to them
            if (order.agentId !== userId) {
                throw new ForbiddenError('You are not assigned to this order');
            }

            // Agents can only set certain statuses
            if (!['accepted', 'in_progress', 'completed'].includes(status)) {
                throw new ForbiddenError('Agents can only accept, start or complete orders');
            }
        } else if (order.customerId === userId) {
            // Customers can only cancel their own orders
            if (status !== 'cancelled') {
                throw new ForbiddenError('You can only cancel your orders');
            }

            // Can't cancel if already completed
            if (order.status === 'completed') {
                throw new BadRequestError('Cannot cancel a completed order');
            }
            // } else if (user.status.userType === 'admin') {
            // Admins can update to any status
        } else {
            throw new ForbiddenError('You are not authorized to update this order');
        }
    }

    /**
     * Applies status change to an order and performs necessary side effects
     *
     * @param order - The order to update
     * @param status - The new status to apply
     * @returns The updated order
     */
    private static async applyStatusChange(
        order: Order,
        status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'
    ): Promise<Order> {
        if (status === 'accepted' && !order.acceptedAt) {
            await order.update({
                status,
                acceptedAt: new Date(),
            });
        } else if (status === 'completed' && !order.completedAt) {
            await order.update({
                status,
                completedAt: new Date(),
            });

            // Also update the shopping list status
            await ShoppingList.update(
                { status: 'completed' },
                { where: { id: order.shoppingListId } }
            );
        } else if (status === 'cancelled') {
            await order.update({ status });

            // Also update the shopping list status
            await ShoppingList.update(
                { status: 'cancelled' },
                { where: { id: order.shoppingListId } }
            );
        } else {
            await order.update({ status });
        }

        return await this.getOrder(order.id);
    }


    /**
     * Validates if a transition between order statuses is allowed
     *
     * @param currentStatus - The current status of the order
     * @param newStatus - The requested target status
     * @returns `true` if the transition is valid, `false` otherwise
     *
     * @example
     * // Valid transitions:
     * isValidStatusTransition('pending', 'accepted') // true
     * isValidStatusTransition('accepted', 'in_progress') // true
     *
     * // Invalid transitions:
     * isValidStatusTransition('pending', 'completed') // false
     * isValidStatusTransition('completed', 'in_progress') // false
     */
    private static isValidStatusTransition(currentStatus: string, newStatus: string): boolean {
        const validTransitions: Record<string, string[]> = {
            'pending': ['accepted', 'cancelled'],
            'accepted': ['in_progress', 'cancelled'],
            'in_progress': ['completed', 'cancelled'],
            'completed': [],
            'cancelled': [],
        };

        return validTransitions[currentStatus]?.includes(newStatus) || false;
    }


    static async createOrder(orderData: IOrder): Promise<Order> {
        return await Database.transaction(async (transaction: Transaction) => {
            // Check if the shopping list exists and is in a valid state
            const shoppingList = await ShoppingList.findByPk(orderData.shoppingListId, { transaction });

            if (!shoppingList) {
                throw new NotFoundError('Shopping list not found');
            }

            if (shoppingList.status !== 'accepted') {
                throw new BadRequestError('Can only create orders from accepted shopping lists');
            }

            // Create the order
            const newOrder = await Order.create({
                ...orderData,
                status: 'pending',
            }, { transaction });

            // Update the shopping list status
            await shoppingList.update({ status: 'processing' }, { transaction });

            return newOrder;
        });
    }

    static async getUserOrders(userId: string, queryData?: IViewOrdersQuery): Promise<{ orders: Order[], count: number, totalPages?: number }> {

        // Filter by status if provided
        let where: Record<string, any> = { customerId: userId };
        where = this.applyOrderFilters(where, queryData);


        // Basic query options
        const queryOptions: FindAndCountOptions<Order> = {
            where,
            include: [
                {
                    model: ShoppingList,
                    as: 'shoppingList',
                    include: [
                        {
                            model: ShoppingListItem,
                            as: 'items',
                        },
                    ],
                },
                {
                    model: User,
                    as: 'agent',
                    attributes: ['id', 'firstName', 'lastName', 'email'],
                    required: false,
                },
            ],
            order: [['createdAt', 'DESC']],
        };

        // Handle pagination
        return this.executeOrderQuery(queryOptions, queryData);
    }

    static async getAgentOrders(agentId: string, queryData?: IViewOrdersQuery): Promise<{ orders: Order[], count: number, totalPages?: number }> {
        let where: Record<string, any> = { agentId };
        where = this.applyOrderFilters(where, queryData);

        // Basic query options
        const queryOptions: FindAndCountOptions<Order> = {
            where,
            include: [
                {
                    model: ShoppingList,
                    as: 'shoppingList',
                    include: [
                        {
                            model: ShoppingListItem,
                            as: 'items',
                        },
                    ],
                },
                {
                    model: User,
                    as: 'customer',
                    attributes: ['id', 'firstName', 'lastName', 'email'],
                },
            ],
            order: [['createdAt', 'DESC']],
        };

        // Handle pagination
        return this.executeOrderQuery(queryOptions, queryData);
    }

    static async getOrder(id: string): Promise<Order> {
        const order = await Order.findByPk(id, {
            include: [
                {
                    model: ShoppingList,
                    as: 'shoppingList',
                    include: [
                        {
                            model: ShoppingListItem,
                            as: 'items',
                        },
                    ],
                },
                {
                    model: User,
                    as: 'customer',
                    attributes: ['id', 'firstName', 'lastName', 'email'],
                },
                {
                    model: User,
                    as: 'agent',
                    attributes: ['id', 'firstName', 'lastName', 'email'],
                    required: false,
                },
            ],
        });

        if (!order) {
            throw new NotFoundError('Order not found');
        }

        return order;
    }

    static async updateOrderStatus(id: string, userId: string, status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled'): Promise<Order> {
        const order = await this.getOrder(id);

        // Validate the status transition
        if (!this.isValidStatusTransition(order.status, status)) {
            throw new BadRequestError(`Cannot change status from ${order.status} to ${status}`);
        }

        // Check permissions based on the user role
        const user = await User.findByPk(userId);
        if (!user) {
            throw new NotFoundError('User not found');
        }

        // Validate user permissions
        this.validateOrderStatusPermissions(order, user, userId, status);

        // Apply status change and any side effects
        return await this.applyStatusChange(order, status);
    }



    static async addAgentNotes(id: string, agentId: string, notes: string): Promise<Order> {
        const order = await this.getOrder(id);

        // Check if an agent is assigned to this order
        if (order.agentId !== agentId) {
            throw new ForbiddenError('You are not assigned to this order');
        }

        await order.update({ agentNotes: notes });

        return await this.getOrder(id);
    }

    static async addCustomerNotes(id: string, customerId: string, notes: string): Promise<Order> {
        const order = await this.getOrder(id);

        // Check if the user is the customer for this order
        if (order.customerId !== customerId) {
            throw new ForbiddenError('You are not the customer for this order');
        }

        await order.update({ customerNotes: notes });

        return await this.getOrder(id);
    }

    static async calculateTotals(shoppingListId: string): Promise<{ totalAmount: number, serviceFee: number, deliveryFee: number }> {
        const shoppingList = await ShoppingList.findByPk(shoppingListId, {
            include: [
                {
                    model: ShoppingListItem,
                    as: 'items',
                },
            ],
        });

        if (!shoppingList) {
            throw new NotFoundError('Shopping list not found');
        }

        // Calculate the base total from items' actual prices if available, otherwise estimated prices
        let subtotal = 0;
        for (const item of shoppingList.items) {
            const itemPrice = item.actualPrice || item.estimatedPrice || 0;
            const quantity = item.quantity || 1;
            subtotal += itemPrice * quantity;
        }

        // Calculate service fee (e.g., 5% of subtotal)
        const serviceFee = Math.round(subtotal * 0.05 * 100) / 100;

        // Calculate delivery fee (could be based on distance, fixed amount, etc.)
        const deliveryFee = 5.00; // Fixed delivery fee for simplicity

        // Calculate total amount
        const totalAmount = subtotal + serviceFee + deliveryFee;

        return {
            totalAmount,
            serviceFee,
            deliveryFee,
        };
    }
}