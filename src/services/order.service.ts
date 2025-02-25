/* eslint-disable @typescript-eslint/no-explicit-any */
import { Transaction, Op, FindAndCountOptions } from 'sequelize';
import Order, { IOrder } from '../models/order.model';
import ShoppingList from '../models/shoppingList.model';
import ShoppingListItem from '../models/shoppingList.model';
import User from '../models/user.model';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/customErrors';
import Pagination, { IPaging } from '../utils/pagination';
import { Database } from '../models/index';

export interface IViewOrdersQuery {
    page?: number;
    size?: number;
    status?: string;
    startDate?: string;
    endDate?: string;
}

export default class OrderService {
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
        const { page, size, status, startDate, endDate } = queryData || {};

        const where: Record<string, any> = { customerId: userId };

        // Filter by status if provided
        if (status) {
            where.status = status;
        }

        // Filter by date range if provided
        if (startDate && endDate) {
            where.createdAt = {
                [Op.between]: [new Date(startDate), new Date(endDate)],
            };
        } else if (startDate) {
            where.createdAt = {
                [Op.gte]: new Date(startDate),
            };
        } else if (endDate) {
            where.createdAt = {
                [Op.lte]: new Date(endDate),
            };
        }

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
                    as: 'vendor',
                    attributes: ['id', 'firstName', 'lastName', 'email'],
                    required: false,
                },
            ],
            order: [['createdAt', 'DESC']],
        };

        // Handle pagination
        if (page && size && page > 0 && size > 0) {
            const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);
            queryOptions.limit = limit || 0;
            queryOptions.offset = offset || 0;
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

    static async getVendorOrders(vendorId: string, queryData?: IViewOrdersQuery): Promise<{ orders: Order[], count: number, totalPages?: number }> {
        const { page, size, status, startDate, endDate } = queryData || {};

        const where: Record<string, any> = { vendorId };

        // Filter by status if provided
        if (status) {
            where.status = status;
        }

        // Filter by date range if provided
        if (startDate && endDate) {
            where.createdAt = {
                [Op.between]: [new Date(startDate), new Date(endDate)],
            };
        } else if (startDate) {
            where.createdAt = {
                [Op.gte]: new Date(startDate),
            };
        } else if (endDate) {
            where.createdAt = {
                [Op.lte]: new Date(endDate),
            };
        }

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
        if (page && size && page > 0 && size > 0) {
            const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);
            queryOptions.limit = limit || 0;
            queryOptions.offset = offset || 0;
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
                    as: 'vendor',
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

        if (user.status.userType === 'vendor') {
            // Vendors can only update orders assigned to them
            if (order.vendorId !== userId) {
                throw new ForbiddenError('You are not assigned to this order');
            }

            // Vendors can only set certain statuses
            if (!['accepted', 'in_progress', 'completed'].includes(status)) {
                throw new ForbiddenError('Vendors can only accept, start or complete orders');
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

        // Special handling for certain status changes
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

        return await this.getOrder(id);
    }

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

    static async addVendorNotes(id: string, vendorId: string, notes: string): Promise<Order> {
        const order = await this.getOrder(id);

        // Check if vendor is assigned to this order
        if (order.vendorId !== vendorId) {
            throw new ForbiddenError('You are not assigned to this order');
        }

        await order.update({ vendorNotes: notes });

        return await this.getOrder(id);
    }

    static async addCustomerNotes(id: string, customerId: string, notes: string): Promise<Order> {
        const order = await this.getOrder(id);

        // Check if user is the customer for this order
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