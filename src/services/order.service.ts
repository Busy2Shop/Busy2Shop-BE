/* eslint-disable @typescript-eslint/no-explicit-any */
import { FindAndCountOptions, Includeable, Op, Transaction, WhereOptions } from 'sequelize';
import Order, { IOrder } from '../models/order.model';
import ShoppingList from '../models/shoppingList.model';
import ShoppingListItem from '../models/shoppingListItem.model';
import User from '../models/user.model';
import UserSettings from '../models/userSettings.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/customErrors';
import Pagination, { IPaging } from '../utils/pagination';
import { Database } from '../models';
import AgentService from './agent.service';
import Market from '../models/market.model';
import { logger } from '../utils/logger';
import OrderNumberGenerator from '../utils/orderNumberGenerator';
import OrderTrailService from './orderTrail.service';

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
     * Determines if an ID is an orderNumber or UUID
     * @param id - The ID to check
     * @returns true if it's an orderNumber, false if it's a UUID
     */
    private static isOrderNumber(id: string): boolean {
        // Order numbers start with B2S- and are shorter than UUIDs
        // UUIDs are 36 characters long with specific format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const orderNumberPattern = /^B2S-[A-Z0-9]{5,}$/;
        
        // If it matches the order number pattern, it's an order number
        if (orderNumberPattern.test(id)) {
            return true;
        }
        
        // If it matches UUID pattern, it's a UUID
        if (uuidPattern.test(id)) {
            return false;
        }
        
        // Fallback: if it starts with B2S-, treat as order number
        return id.startsWith('B2S-');
    }

    /**
     * Get order by ID (handles both UUID and orderNumber)
     * @param id - Either UUID or orderNumber
     * @param includeAgent - Whether to include agent information
     * @param includeCustomer - Whether to include customer information
     * @returns Order with requested includes
     */
    private static async getOrderById(
        id: string,
        includeAgent: boolean = true,
        includeCustomer: boolean = true,
    ): Promise<Order> {
        if (this.isOrderNumber(id)) {
            return await this.getOrderByNumber(id, includeAgent, includeCustomer);
        } else {
            return await this.getOrder(id, includeAgent, includeCustomer);
        }
    }

    /**
     * Applies common order filtering criteria to a where clause
     *
     * @param whereClause - The existing where conditions object to modify
     * @param queryData - Query parameters containing filtering options
     * @returns The updated where clause with applied filters
     */
    private static applyOrderFilters(
        whereClause: Record<string, any>,
        queryData?: IViewOrdersQuery,
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
        queryData?: IViewOrdersQuery,
    ): Promise<{ orders: Order[]; count: number; totalPages?: number }> {
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
        status: string,
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
            pending: ['accepted', 'cancelled'],
            accepted: ['in_progress', 'cancelled'],
            in_progress: ['shopping', 'cancelled'],
            shopping: ['shopping_completed', 'cancelled'],
            shopping_completed: ['delivery', 'cancelled'],
            delivery: ['completed', 'cancelled'],
            completed: [],
            cancelled: [],
        };

        return validTransitions[currentStatus]?.includes(newStatus) || false;
    }

    /**
     * Create a new order without automatic agent assignment (agents are assigned after payment completion)
     */
    static async createOrder(orderData: IOrder): Promise<Order> {
        return await Database.transaction(async (transaction: Transaction) => {
            // Check if the shopping list exists and is in a valid state
            const shoppingList = await ShoppingList.findByPk(orderData.shoppingListId, {
                include: [
                    {
                        model: Market,
                        as: 'market',
                    },
                ],
                transaction,
            });

            if (!shoppingList) {
                throw new NotFoundError('Shopping list not found');
            }

            // Allow orders to be created from draft, pending, or accepted shopping lists
            // This supports the payment flow where orders are created before payment completion
            if (!['draft', 'pending', 'accepted'].includes(shoppingList.status)) {
                throw new BadRequestError('Can only create orders from draft, pending, or accepted shopping lists');
            }

            // Generate a human-readable order number if not provided
            const orderNumber = orderData.orderNumber || await OrderNumberGenerator.generateOrderNumber();
            
            // Create the order without agent assignment (will be assigned after payment completion)
            const newOrder = await Order.create(
                {
                    ...orderData,
                    orderNumber,
                    status: 'pending',
                    agentId: undefined, // No agent assigned until payment is completed
                },
                { transaction },
            );

            // Keep the shopping list status as draft until payment is completed
            await shoppingList.update(
                {
                    status: 'draft',
                    agentId: undefined, // No agent assigned until payment is completed
                },
                { transaction },
            );

            logger.info('Order created successfully', {
                orderId: newOrder.id,
                orderNumber: newOrder.orderNumber,
                customerId: newOrder.customerId,
                totalAmount: newOrder.totalAmount,
            });

            return newOrder;
        }).then(async (order) => {
            // Log order creation in trail after transaction is committed
            try {
                await OrderTrailService.logOrderCreation(
                    order.id,
                    order.customerId,
                    order,
                );
            } catch (error) {
                logger.error('Failed to create order trail entry', {
                    orderId: order.id,
                    error: error instanceof Error ? error.message : String(error),
                });
                // Don't throw here as the order was successfully created
            }
            
            return order;
        });
    }

    /**
     * Assign an agent to an order after payment completion using location-based logic
     */
    static async assignAgentToOrder(orderId: string, shoppingListId: string): Promise<Order> {
        return await Database.transaction(async (transaction: Transaction) => {
            // Get the order
            const order = await Order.findByPk(orderId, { transaction });
            if (!order) {
                throw new NotFoundError('Order not found');
            }

            // Get the shopping list with market information
            const shoppingList = await ShoppingList.findByPk(shoppingListId, {
                include: [
                    {
                        model: Market,
                        as: 'market',
                    },
                ],
                transaction,
            });

            if (!shoppingList) {
                throw new NotFoundError('Shopping list not found');
            }

            // Get market location for agent assignment
            const marketLocation = shoppingList.market?.location || { latitude: 0, longitude: 0 };

            // Find available agents at the market first
            const availableAgents = await AgentService.getAvailableAgentsForOrder(
                shoppingList.id,
            );

            // If no agents at market, find the nearest available agent
            let assignedAgent: User | undefined = availableAgents[0];
            if (!assignedAgent && marketLocation.latitude && marketLocation.longitude) {
                const nearestAgent = await AgentService.findNearestAgent(
                    marketLocation.latitude,
                    marketLocation.longitude,
                );
                if (nearestAgent) {
                    assignedAgent = nearestAgent;
                }
            }

            if (assignedAgent) {
                // Update the order with agent assignment
                await order.update(
                    {
                        agentId: assignedAgent.id,
                        status: 'accepted',
                        acceptedAt: new Date(),
                    },
                    { transaction },
                );

                // Update the shopping list status and agent
                await shoppingList.update(
                    {
                        status: 'processing',
                        agentId: assignedAgent.id,
                    },
                    { transaction },
                );

                // Set agent as busy
                await AgentService.setAgentBusy(assignedAgent.id, order.id, transaction);

                // Log agent assignment
                await OrderTrailService.logAgentAssignment(
                    orderId,
                    assignedAgent.id,
                );

                // Log status change
                await OrderTrailService.logStatusChange(
                    orderId,
                    assignedAgent.id,
                    'pending',
                    'accepted',
                );

                logger.info(`Agent ${assignedAgent.id} assigned to order ${orderId} for shopping list ${shoppingListId}`);
            } else {
                logger.warn(`No available agents found for order ${orderId} at market ${shoppingList.marketId}`);
                // Keep order in pending status until an agent becomes available
                
                // Log system event
                await OrderTrailService.logSystemAction(
                    orderId,
                    'AGENT_ASSIGNMENT_FAILED',
                    'No available agents found for order assignment',
                    { marketId: shoppingList.marketId }
                );
            }

            return order;
        });
    }

    /**
     * Get orders with appropriate filters and includes
     * @param whereClause Base where clause for filtering orders
     * @param queryData Optional query parameters for filtering and pagination
     * @param includeAgent Whether to include agent information
     * @param includeCustomer Whether to include customer information
     * @returns Orders with count and pagination info
     */
    private static async getOrders(
        whereClause: Record<string, any>,
        queryData?: IViewOrdersQuery,
        includeAgent: boolean = false,
        includeCustomer: boolean = false,
    ): Promise<{ orders: Order[]; count: number; totalPages?: number }> {
        // Apply common filters
        whereClause = this.applyOrderFilters(whereClause, queryData);

        // Initialize includes array
        const includes: Includeable[] = [
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
        ];

        // Add the agent include if requested
        if (includeAgent) {
            includes.push({
                model: User,
                as: 'agent',
                attributes: ['id', 'firstName', 'lastName', 'email'],
                required: false,
            });
        }

        // Add customer include if requested
        if (includeCustomer) {
            includes.push({
                model: User,
                as: 'customer',
                attributes: ['id', 'firstName', 'lastName', 'email'],
            });
        }

        // Basic query options
        const queryOptions: FindAndCountOptions<Order> = {
            where: whereClause,
            include: includes,
            order: [['createdAt', 'DESC']],
        };

        // Execute the query with pagination
        return this.executeOrderQuery(queryOptions, queryData);
    }

    /**
     * Get orders for a specific customer
     */
    static async getUserOrders(
        userId: string,
        queryData?: IViewOrdersQuery,
    ): Promise<{
        orders: Order[];
        count: number;
        totalPages?: number;
    }> {
        return this.getOrders(
            { customerId: userId },
            queryData,
            true, // Include agent info
            false, // Don't include customer info
        );
    }

    /**
     * Get orders for a specific agent
     */
    static async getAgentOrders(
        agentId: string,
        queryData?: IViewOrdersQuery,
    ): Promise<{
        orders: Order[];
        count: number;
        totalPages?: number;
    }> {
        return this.getOrders(
            { agentId },
            queryData,
            false, // Don't include agent info
            true, // Include customer info
        );
    }

    /**
     * Get a single order by ID with appropriate includes
     * @param id Order ID
     * @param includeAgent Whether to include agent information
     * @param includeCustomer Whether to include customer information
     * @returns Order with requested includes
     */
    static async getOrder(
        id: string,
        includeAgent: boolean = true,
        includeCustomer: boolean = true,
    ): Promise<Order> {
        // Initialize includes array
        const includes: Includeable[] = [
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
        ];

        // Add the agent include if requested
        if (includeAgent) {
            includes.push({
                model: User,
                as: 'agent',
                attributes: [
                    'id', 
                    'firstName', 
                    'lastName', 
                    'email', 
                    'phone', 
                    'displayImage',
                    'status',
                    'createdAt',
                ],
                required: false,
                include: [
                    {
                        model: UserSettings,
                        as: 'settings',
                        attributes: ['agentMetaData'],
                        required: false,
                    },
                ],
            });
        }

        // Add customer include if requested
        if (includeCustomer) {
            includes.push({
                model: User,
                as: 'customer',
                attributes: ['id', 'firstName', 'lastName', 'email'],
            });
        }

        const queryOptions: FindAndCountOptions<Order> = {
            where: { id },
            include: includes,
        };

        const order = await Order.findOne(queryOptions);

        if (!order) {
            throw new NotFoundError('Order not found');
        }

        return order;
    }

    /**
     * Get a single order by order number with appropriate includes
     * @param orderNumber Order number (e.g., B2S-ABC123)
     * @param includeAgent Whether to include agent information
     * @param includeCustomer Whether to include customer information
     * @returns Order with requested includes
     */
    static async getOrderByNumber(
        orderNumber: string,
        includeAgent: boolean = true,
        includeCustomer: boolean = true,
    ): Promise<Order> {
        // Initialize includes array
        const includes: Includeable[] = [
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
        ];

        // Add the agent include if requested
        if (includeAgent) {
            includes.push({
                model: User,
                as: 'agent',
                attributes: [
                    'id', 
                    'firstName', 
                    'lastName', 
                    'email', 
                    'phone', 
                    'displayImage',
                    'status',
                    'createdAt',
                ],
                required: false,
                include: [
                    {
                        model: UserSettings,
                        as: 'settings',
                        attributes: ['agentMetaData'],
                        required: false,
                    },
                ],
            });
        }

        // Add customer include if requested
        if (includeCustomer) {
            includes.push({
                model: User,
                as: 'customer',
                attributes: ['id', 'firstName', 'lastName', 'email', 'phone'],
            });
        }

        const order = await Order.findOne({
            where: { orderNumber },
            include: includes,
        });

        if (!order) {
            throw new NotFoundError('Order not found');
        }

        return order;
    }

    /**
     * Get order by payment transaction ID
     */
    static async getOrderByPaymentId(
        paymentId: string,
        includeAgent: boolean = true,
        includeCustomer: boolean = true,
    ): Promise<Order | null> {
        // Initialize includes array
        const includes: Includeable[] = [
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
        ];

        // Add the agent include if requested
        if (includeAgent) {
            includes.push({
                model: User,
                as: 'agent',
                attributes: [
                    'id', 
                    'firstName', 
                    'lastName', 
                    'email', 
                    'phone', 
                    'displayImage',
                    'status',
                    'createdAt',
                ],
                required: false,
                include: [
                    {
                        model: UserSettings,
                        as: 'settings',
                        attributes: ['agentMetaData'],
                        required: false,
                    },
                ],
            });
        }

        // Add customer include if requested
        if (includeCustomer) {
            includes.push({
                model: User,
                as: 'customer',
                attributes: ['id', 'firstName', 'lastName', 'email', 'phone'],
            });
        }

        const order = await Order.findOne({
            where: { paymentId },
            include: includes,
        });

        return order;
    }

    /**
     * Update order with payment transaction ID
     */
    static async updateOrderPaymentId(orderId: string, paymentId: string): Promise<Order> {
        const order = await Order.findByPk(orderId);
        if (!order) {
            throw new NotFoundError('Order not found');
        }

        await order.update({ paymentId });
        return order;
    }

    /**
     * Update order payment status
     */
    static async updateOrderPaymentStatus(
        orderId: string, 
        paymentStatus: 'pending' | 'completed' | 'failed' | 'expired',
        transaction?: Transaction
    ): Promise<Order> {
        const order = await Order.findByPk(orderId, { transaction });
        if (!order) {
            throw new NotFoundError('Order not found');
        }

        const updateData: Partial<IOrder> = { paymentStatus };
        
        // If payment completed, also update order status if still pending
        if (paymentStatus === 'completed' && order.status === 'pending') {
            updateData.status = 'accepted';
            updateData.acceptedAt = new Date();
            updateData.paymentProcessedAt = new Date();
        }
        
        // If payment failed or expired, cancel the order if still pending
        if ((paymentStatus === 'failed' || paymentStatus === 'expired') && order.status === 'pending') {
            updateData.status = 'cancelled';
        }

        await order.update(updateData, { transaction });
        
        // Log the payment status change (outside transaction for non-critical operation)
        if (!transaction) {
            await OrderTrailService.logOrderEvent(orderId, {
                action: 'payment_status_updated',
                description: `Payment status updated to ${paymentStatus}`,
                performedBy: 'system',
                metadata: {
                    oldPaymentStatus: order.paymentStatus,
                    newPaymentStatus: paymentStatus,
                    paymentId: order.paymentId,
                },
            });
        }

        return order;
    }

    /**
     * Update order status with proper validation and side effects
     */
    static async updateOrderStatus(
        id: string,
        userId: string,
        status:
            | 'pending'
            | 'accepted'
            | 'in_progress'
            | 'shopping'
            | 'shopping_completed'
            | 'delivery'
            | 'completed'
            | 'cancelled',
        externalTransaction?: Transaction
    ): Promise<Order> {
        const executeInTransaction = async (transaction: Transaction) => {
            const order = await this.getOrderById(id);
            const user = await User.findByPk(userId, { transaction });

            if (!user) {
                throw new NotFoundError('User not found');
            }

            // Validate permissions
            this.validateOrderStatusPermissions(order, user, userId, status);

            // Validate status transition
            if (!this.isValidStatusTransition(order.status, status)) {
                throw new BadRequestError(`Cannot change status from ${order.status} to ${status}`);
            }

            // Update order status with appropriate timestamps and side effects
            const updateData: Partial<IOrder> = { status };
            const now = new Date();

            switch (status) {
                case 'accepted':
                    if (!order.acceptedAt) {
                        updateData.acceptedAt = now;
                    }
                    break;
                case 'shopping':
                    if (!order.shoppingStartedAt) {
                        updateData.shoppingStartedAt = now;
                    }
                    break;
                case 'shopping_completed':
                    if (!order.shoppingCompletedAt) {
                        updateData.shoppingCompletedAt = now;
                    }
                    break;
                case 'delivery':
                    if (!order.deliveryStartedAt) {
                        updateData.deliveryStartedAt = now;
                    }
                    break;
                case 'completed':
                    if (!order.completedAt) {
                        updateData.completedAt = now;
                        // Update shopping list status
                        await ShoppingList.update(
                            { status: 'completed' },
                            { where: { id: order.shoppingListId }, transaction },
                        );
                        // Update agent status back to available
                        if (order.agentId) {
                            await AgentService.updateAgentStatus(order.agentId, 'available');
                        }
                    }
                    break;
                case 'cancelled':
                    updateData.cancelledAt = now;
                    // Update shopping list status
                    await ShoppingList.update(
                        { status: 'cancelled' },
                        { where: { id: order.shoppingListId }, transaction },
                    );
                    // Update agent status back to available
                    if (order.agentId) {
                        await AgentService.updateAgentStatus(order.agentId, 'available');
                    }
                    break;
            }

            // Store previous status for logging
            const previousStatus = order.status;
            
            await order.update(updateData, { transaction });
            
            // Log status change
            await OrderTrailService.logStatusChange(
                order.id,
                userId,
                previousStatus,
                status,
            );

            // Log completion if order is completed
            if (status === 'completed') {
                await OrderTrailService.logOrderCompletion(
                    order.id,
                    userId,
                    { completedAt: updateData.completedAt || new Date() },
                );
            }

            return await this.getOrderById(order.id);
        };
        
        if (externalTransaction) {
            return await executeInTransaction(externalTransaction);
        } else {
            return await Database.transaction(executeInTransaction);
        }
    }

    /**
     * Add notes to an order (for both agents and customers)
     */
    static async addNotes(
        id: string,
        userId: string,
        notes: string,
        userType: 'agent' | 'customer',
    ): Promise<Order> {
        const order = await this.getOrderById(id);

        // Validate user permissions
        if (userType === 'agent' && order.agentId !== userId) {
            throw new ForbiddenError('You are not assigned to this order');
        } else if (userType === 'customer' && order.customerId !== userId) {
            throw new ForbiddenError('You are not the customer for this order');
        }

        // Update the appropriate notes field
        const updateData = userType === 'agent' ? { agentNotes: notes } : { customerNotes: notes };

        await order.update(updateData);
        
        // Log notes addition
        await OrderTrailService.logNotesAdded(
            order.id,
            userId,
            notes,
            userType,
        );
        
        return await this.getOrderById(id);
    }

    static async calculateTotals(shoppingListId: string): Promise<{
        totalAmount: number;
        serviceFee: number;
        deliveryFee: number;
    }> {
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
        const deliveryFee = 5.0; // Fixed delivery fee for simplicity

        // Calculate total amount
        const totalAmount = subtotal + serviceFee + deliveryFee;

        return {
            totalAmount,
            serviceFee,
            deliveryFee,
        };
    }

    /**
     * Handle agent rejection of an order and attempt to find a new agent
     * @param orderId The ID of the order being rejected
     * @param agentId The ID of the agent rejecting the order
     * @param reason The reason for rejection
     * @returns The updated order with new agent assignment if successful
     * @throws {NotFoundError} If order not found
     * @throws {ForbiddenError} If agent is not assigned to the order
     * @throws {BadRequestError} If maximum rejections reached or no agents available
     */
    static async handleAgentRejection(
        orderId: string,
        agentId: string,
        reason: string,
    ): Promise<Order> {
        // Initialize the result with a fake value that will be overwritten
        let orderId_to_fetch: string = orderId;

        // Use a separate variable to hold the result
        await Database.transaction(async (transaction: Transaction) => {
            const order = await this.getOrderById(orderId);

            // Verify the agent is assigned to this order
            if (order.agentId !== agentId) {
                throw new ForbiddenError('You are not assigned to this order');
            }

            // Get the shopping list to access the market location
            const shoppingList = await ShoppingList.findByPk(order.shoppingListId, {
                include: [
                    {
                        model: Market,
                        as: 'market',
                    },
                ],
                transaction,
            });

            if (!shoppingList) {
                throw new NotFoundError('Shopping list not found');
            }

            // Explicitly get the market for location data - this is the fix
            const market = await Market.findByPk(shoppingList.marketId);
            if (!market || !market.location) {
                throw new NotFoundError('Market not found or has no location');
            }

            // Get market location for agent assignment (using the correct property access)
            const marketLatitude = market.location.latitude;
            const marketLongitude = market.location.longitude;

            // Get existing rejected agents
            const existingRejectedAgents = order.rejectedAgents || [];

            // Check if this agent has already rejected the order
            if (existingRejectedAgents.some(ra => ra.agentId === agentId)) {
                console.warn(`Agent ${agentId} has rejected order ${orderId} multiple times`);
                throw new BadRequestError('You have already rejected this order');
            }

            // If not already rejected, add the new rejection
            const rejectedAgents = [
                ...existingRejectedAgents,
                {
                    agentId,
                    reason,
                    rejectedAt: new Date(),
                },
            ];

            // Check if we've reached the maximum number of rejections (5)
            if (rejectedAgents.length >= 5) {
                // Update order status to cancelled
                await order.update(
                    {
                        status: 'cancelled',
                        cancelledAt: new Date(),
                        agentId: undefined,
                        rejectedAgents,
                    },
                    { transaction },
                );

                // Update shopping list status
                await shoppingList.update(
                    {
                        status: 'cancelled',
                    },
                    { transaction },
                );
                
                // Log order cancellation due to rejections
                await OrderTrailService.logOrderCancellation(
                    orderId,
                    agentId, // Last rejecting agent
                    'Maximum agent rejections reached',
                );

                throw new BadRequestError(
                    'Maximum number of agent rejections reached. Order has been cancelled.',
                );
            }

            // Find a new agent, excluding previously rejected agents
            const rejectedAgentIds = rejectedAgents.map(ra => ra.agentId);

            // First, try to find available agents at the market
            const availableAgents = await AgentService.getAvailableAgentsForOrder(
                shoppingList.id,
                rejectedAgentIds,
            );

            // If no agents at market, find the nearest available agent
            let newAgent: User | undefined = availableAgents[0];
            if (!newAgent) {
                const nearestAgent = await AgentService.findNearestAgent(
                    marketLatitude,
                    marketLongitude,
                    rejectedAgentIds,
                );
                if (nearestAgent) {
                    newAgent = nearestAgent;
                }
            }

            // If no new agent found, update the order status
            if (!newAgent) {
                await order.update(
                    {
                        status: 'cancelled',
                        cancelledAt: new Date(),
                        agentId: undefined,
                        rejectedAgents,
                    },
                    { transaction },
                );

                // Update shopping list status
                await shoppingList.update(
                    {
                        status: 'cancelled',
                    },
                    { transaction },
                );
                
                // Log order cancellation due to no available agents
                await OrderTrailService.logOrderCancellation(
                    orderId,
                    agentId, // Last rejecting agent
                    'No available agents found after rejection',
                );

                // Log details about the rejection
                console.warn(
                    `No agents available for order ${orderId} after rejection. ` +
                        `Previous agent: ${agentId}, Market: ${shoppingList.marketId}, ` +
                        `${rejectedAgentIds.length} total rejections`,
                );

                // Then throw the error
                throw new BadRequestError(
                    'No available agents found to handle this order. Order has been cancelled.',
                );
            }

            // Update the order with the new agent
            await order.update(
                {
                    agentId: newAgent.id,
                    rejectedAgents,
                },
                { transaction },
            );

            // Update the shopping list with the new agent
            await shoppingList.update(
                {
                    agentId: newAgent.id,
                },
                { transaction },
            );

            // Update the new agent's status to busy
            await AgentService.setAgentBusy(newAgent.id, order.id, transaction);

            // Update the previous agent's status back to available
            await AgentService.updateAgentStatus(agentId, 'available');

            // Log agent rejection
            await OrderTrailService.logAgentRejection(
                orderId,
                agentId,
                reason,
            );
            
            // Log new agent assignment
            await OrderTrailService.logAgentAssignment(
                orderId,
                newAgent.id,
                agentId, // Previous agent
            );

            // Log using console.info instead
            console.info(
                `Order ${orderId} rejected by agent ${agentId}. Reason: ${reason}. Reassigned to agent ${newAgent.id}`,
            );

            // We only need to store the orderId, not the whole order object
            orderId_to_fetch = order.id;
        });

        // After the transaction completes, fetch fresh data outside the transaction
        const freshOrder = await Order.findByPk(orderId_to_fetch, {
            include: [
                { model: User, as: 'agent' },
                { model: User, as: 'customer' },
                {
                    model: ShoppingList,
                    as: 'shoppingList',
                    include: ['items'],
                },
            ],
        });

        // Handle the case where findByPk might return null
        if (!freshOrder) {
            throw new NotFoundError(`Order with ID ${orderId_to_fetch} not found after update`);
        }

        return freshOrder;
    }

    /**
     * Process payment for an order
     * @param orderId The ID of the order to process payment for
     * @param paymentId The ID of the payment record
     */
    static async processOrderPayment(orderId: string, paymentId: string): Promise<void> {
        const order = await this.getOrderById(orderId);

        if (!order) {
            throw new NotFoundError('Order not found');
        }

        // Update order status to indicate payment is processed
        await order.update({
            status: 'accepted',
            paymentId,
            paymentStatus: 'completed',
            paymentProcessedAt: new Date(),
        });
        
        // Log payment processing
        await OrderTrailService.logPaymentProcessed(
            orderId,
            {
                paymentId,
                paymentStatus: 'completed',
                amount: order.totalAmount,
                provider: 'alatpay', // or get from payment data
            },
        );
    }

    /**
     * Find order by shopping list ID for a specific user
     * @param shoppingListId The ID of the shopping list
     * @param userId The ID of the user (for security)
     * @returns Order if found, null otherwise
     */
    static async findOrderByShoppingListId(shoppingListId: string, userId: string): Promise<Order | null> {
        const order = await Order.findOne({
            where: {
                shoppingListId,
                customerId: userId,
                // Only look for pending orders to avoid returning completed/expired orders
                paymentStatus: 'pending',
            },
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
            // Get the most recent order if multiple exist
            order: [['createdAt', 'DESC']],
        });
        
        return order;
    }

    /**
     * Manually assign a specific agent to an order (admin function)
     */
    static async manuallyAssignOrderToAgent(orderId: string, agentId: string): Promise<Order> {
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
            await order.update(
                {
                    agentId,
                    status: 'accepted',
                    acceptedAt: new Date(),
                },
                { transaction },
            );

            // Also update the shopping list
            await ShoppingList.update(
                {
                    agentId,
                    status: 'processing',
                },
                {
                    where: { id: order.shoppingListId },
                    transaction,
                },
            );

            // Update agent status to busy
            await AgentService.setAgentBusy(agentId, orderId, transaction);
            
            // Log manual agent assignment
            await OrderTrailService.logAgentAssignment(
                orderId,
                agentId,
                undefined, // No previous agent
            );
            
            // Log status change
            await OrderTrailService.logStatusChange(
                orderId,
                agentId,
                'pending',
                'accepted',
            );

            return order;
        });
    }

    /**
     * Get orders that are pending agent assignment
     */
    static async getPendingAgentAssignmentOrders(): Promise<Order[]> {
        return await Order.findAll({
            where: {
                agentId: { [Op.is]: null },
                paymentStatus: 'completed',
                status: 'pending',
            } as WhereOptions<Order>,
            include: [
                {
                    model: ShoppingList,
                    as: 'shoppingList',
                    include: [
                        {
                            model: Market,
                            as: 'market',
                        },
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
            order: [['createdAt', 'ASC']], // Oldest orders first
        });
    }
}
