import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import OrderService from '../services/order.service';
import ShoppingListService from '../services/shoppingList.service';
import { BadRequestError, ForbiddenError } from '../utils/customErrors';

export default class OrderController {
    /**
     * Extracts and processes standard query parameters from request query object
     *
     * @param query - The Express request query object
     * @returns A record containing processed query parameters
     *
     * @remarks
     * - Converts pagination parameters (page, size) to numbers
     * - Passes through status parameter as is
     * - Processes date range parameters (startDate, endDate) as strings
     *
     * @example
     * // From a request with the query ?page=2&size=10&status=pending
     * const queryParams = this.extractOrderQueryParams(req.query);
     * // Returns: { page: 2, size: 10, status: 'pending' }
     */
    private static extractOrderQueryParams(query: Request['query']): Record<string, unknown> {
        const { page, size, status, startDate, endDate } = query;

        const queryParams: Record<string, unknown> = {};

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (status) queryParams.status = status;
        if (startDate) queryParams.startDate = startDate as string;
        if (endDate) queryParams.endDate = endDate as string;

        return queryParams;
    }

    static async createOrder(req: AuthenticatedRequest, res: Response) {
        const { shoppingListId, deliveryAddress, customerNotes } = req.body;

        if (!shoppingListId || !deliveryAddress) {
            throw new BadRequestError('Shopping list ID and delivery address are required');
        }

        // Get the shopping list to verify ownership
        const shoppingList = await ShoppingListService.getShoppingList(shoppingListId);

        if (shoppingList.customerId !== req.user.id) {
            throw new ForbiddenError(
                'You are not authorized to create an order from this shopping list',
            );
        }
        
        // Check if shopping list is in accepted status (payment completed or admin approved)
        if (shoppingList.status !== 'accepted') {
            throw new BadRequestError(
                'Shopping list must be paid for or approved before creating an order. Current status: ' + shoppingList.status
            );
        }

        // Calculate totals for the order
        const { totalAmount, serviceFee, deliveryFee } =
            await OrderService.calculateTotals(shoppingListId);

        // Create the order
        const order = await OrderService.createOrder({
            shoppingListId,
            customerId: req.user.id,
            agentId: shoppingList.agentId,
            totalAmount,
            serviceFee,
            deliveryFee,
            deliveryAddress,
            customerNotes,
        });

        res.status(201).json({
            status: 'success',
            message: 'Order created successfully',
            data: order,
        });
    }

    static async getUserOrders(req: AuthenticatedRequest, res: Response) {
        const queryParams = OrderController.extractOrderQueryParams(req.query);

        const orders = await OrderService.getUserOrders(req.user.id, queryParams);

        res.status(200).json({
            status: 'success',
            message: 'Orders retrieved successfully',
            data: { ...orders },
        });
    }

    static async getAgentOrders(req: AuthenticatedRequest, res: Response) {
        // Check if the user is an agent
        if (req.user.status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can access their assigned orders');
        }

        const queryParams = OrderController.extractOrderQueryParams(req.query);

        const orders = await OrderService.getAgentOrders(req.user.id, queryParams);

        res.status(200).json({
            status: 'success',
            message: 'Agent orders retrieved successfully',
            data: { ...orders },
        });
    }

    static async getOrder(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;

        const order = await OrderService.getOrder(id);

        // Check if the user is authorized to view this order
        // if
        // (order.customerId !== req.user.id && order.agentId !== req.user.id && req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('Not authorized to view this order');
        // }

        res.status(200).json({
            status: 'success',
            message: 'Order retrieved successfully',
            data: order,
        });
    }

    static async updateOrderStatus(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            throw new BadRequestError('Status is required');
        }

        const order = await OrderService.updateOrderStatus(id, req.user.id, status);

        res.status(200).json({
            status: 'success',
            message: 'Order status updated successfully',
            data: order,
        });
    }

    static async addNotes(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { notes } = req.body;
        const userType = req.user.status.userType as 'agent' | 'customer';

        if (!notes) {
            throw new BadRequestError('Notes are required');
        }

        const order = await OrderService.addNotes(id, req.user.id, notes, userType);

        res.status(200).json({
            status: 'success',
            message: 'Notes added successfully',
            data: order,
        });
    }

    /**
     * Create order with payment method consideration
     * This method allows COD orders to be created without prior payment
     */
    static async createOrderWithPaymentMethod(req: AuthenticatedRequest, res: Response) {
        const { shoppingListId, deliveryAddress, customerNotes, paymentMethod } = req.body;

        if (!shoppingListId || !deliveryAddress || !paymentMethod) {
            throw new BadRequestError('Shopping list ID, delivery address, and payment method are required');
        }

        // Get the shopping list to verify ownership
        const shoppingList = await ShoppingListService.getShoppingList(shoppingListId);

        if (shoppingList.customerId !== req.user.id) {
            throw new ForbiddenError(
                'You are not authorized to create an order from this shopping list',
            );
        }

        // For COD and Wallet payments, we can accept pending status (which means submitted)
        const acceptableStatuses = paymentMethod === 'cod' || paymentMethod === 'wallet' 
            ? ['pending', 'accepted']
            : ['accepted'];

        if (!acceptableStatuses.includes(shoppingList.status)) {
            throw new BadRequestError(
                `Shopping list must be in one of these statuses: ${acceptableStatuses.join(', ')}. Current status: ${shoppingList.status}`
            );
        }

        // If status is 'pending' and payment method allows it, update to 'accepted'
        if (shoppingList.status === 'pending' && (paymentMethod === 'cod' || paymentMethod === 'wallet')) {
            await ShoppingListService.updateListStatus(shoppingListId, req.user.id, 'accepted');
        }

        // Calculate totals for the order
        const { totalAmount, serviceFee, deliveryFee } =
            await OrderService.calculateTotals(shoppingListId);

        // Create the order
        const order = await OrderService.createOrder({
            shoppingListId,
            customerId: req.user.id,
            agentId: shoppingList.agentId,
            totalAmount,
            serviceFee,
            deliveryFee,
            deliveryAddress,
            customerNotes,
        });

        res.status(201).json({
            status: 'success',
            message: 'Order created successfully',
            data: order,
        });
    }

    /**
     * Handle agent rejection of an assigned order
     */
    static async rejectOrder(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { reason } = req.body;

        if (!reason) {
            throw new BadRequestError('Reason for rejection is required');
        }

        // Check if the user is an agent
        if (req.user.status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can reject orders');
        }

        const order = await OrderService.handleAgentRejection(id, req.user.id, reason);

        res.status(200).json({
            status: 'success',
            message: 'Order rejection processed successfully',
            data: order,
        });
    }
}
