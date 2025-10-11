import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import OrderService from '../services/order.service';
import ShoppingListService from '../services/shoppingList.service';
import OrderTrailService from '../services/orderTrail.service';
import { BadRequestError, ForbiddenError } from '../utils/customErrors';

export default class OrderController {

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

    private static isValidUUID(id: string): boolean {
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidPattern.test(id);
    }

    private static validateOrderId(id: string): void {
        const isOrderNum = this.isOrderNumber(id);
        const isUUID = this.isValidUUID(id);

        if (!isOrderNum && !isUUID) {
            throw new BadRequestError('Invalid order ID format. Must be either a valid UUID or order number (B2S-XXXXX)');
        }
    }

    private static extractOrderQueryParams(query: Request['query']): Record<string, unknown> {
        const { page, size, status, startDate, endDate } = query;

        const queryParams: Record<string, unknown> = {};

        if (page && size) {
            let pageNum = Number(page);
            let sizeNum = Number(size);

            // Validate pagination parameters
            if (isNaN(pageNum) || pageNum < 1) {
                throw new BadRequestError('Page must be a positive number');
            }
            if (isNaN(sizeNum) || sizeNum < 1) {
                throw new BadRequestError('Size must be a positive number');
            }
            // Cap maximum size for DoS protection
            if (sizeNum > 100) {
                sizeNum = 100;
            }

            queryParams.page = pageNum;
            queryParams.size = sizeNum;
        }

        if (status) queryParams.status = status;
        if (startDate) queryParams.startDate = startDate as string;
        if (endDate) queryParams.endDate = endDate as string;

        return queryParams;
    }

    static async createOrder(req: AuthenticatedRequest, res: Response) {
        const { shoppingListId, deliveryAddress, customerNotes, deliveryQuoteId } = req.body;

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

        // Calculate totals for the order with discount consideration
        const { totalAmount, serviceFee, deliveryFee, originalSubtotal, discountAmount } =
            await OrderService.calculateTotals(shoppingListId);

        // Validate minimum order amount (₦5,000 in new pricing model)
        // OPTIMIZATION: This is now included in the batched settings fetch inside calculateTotals
        // so minimum order check uses the same cache
        const SystemSettingsService = (await import('../services/systemSettings.service')).default;
        const { SYSTEM_SETTING_KEYS } = await import('../models/systemSettings.model');
        const minimumOrder = await SystemSettingsService.getSetting(
            SYSTEM_SETTING_KEYS.MINIMUM_ORDER_AMOUNT
        );

        if (totalAmount < (minimumOrder || 5000)) {
            throw new BadRequestError(
                `Minimum order amount is ₦${(minimumOrder || 5000).toLocaleString()}`
            );
        }

        // Create the order with audit trail fields
        const order = await OrderService.createOrder({
            shoppingListId,
            customerId: req.user.id,
            agentId: shoppingList.agentId,
            totalAmount,
            serviceFee,
            deliveryFee,
            originalSubtotal,
            discountAmount,
            appliedDiscounts: [], // Will be populated if discounts were applied
            deliveryAddress,
            customerNotes,
            deliveryQuoteId, // Link to the delivery quote
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

        try {
            // Validate order ID format
            OrderController.validateOrderId(id);

            // Check if the id is a UUID (old format) or orderNumber (new format)
            let order;
            if (OrderController.isOrderNumber(id)) {
                // New format: orderNumber (e.g., B2S-ABC123)
                console.log('Fetching order by number:', id);
                order = await OrderService.getOrderByNumber(id);
            } else {
                // Old format: UUID
                console.log('Fetching order by UUID:', id);
                order = await OrderService.getOrder(id);
            }

            // Check if the user is authorized to view this order
            // if
            // (order.customerId !== req.user.id && order.agentId !== req.user.id && req.user.status.userType !== 'admin') {
            //     throw new ForbiddenError('Not authorized to view this order');
            // }

            // Add cache headers for better performance (cache for 30 seconds)
            res.set({
                'Cache-Control': 'public, max-age=30, s-maxage=30',
                'ETag': `"order-${order.id}-${order.updatedAt?.getTime()}"`,
            });

            res.status(200).json({
                status: 'success',
                message: 'Order retrieved successfully',
                data: order,
            });
        } catch (error) {
            console.error('Error retrieving order:', { id, error: error instanceof Error ? error.message : String(error) });
            throw error;
        }
    }

    static async updateOrderStatus(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { status } = req.body;

        // Validate order ID format
        OrderController.validateOrderId(id);

        if (!status) {
            throw new BadRequestError('Status is required');
        }

        // Validate status value
        const validStatuses = [
            'pending', 'accepted', 'in_progress', 'shopping',
            'shopping_completed', 'delivery', 'picked_up', 'in_transit',
            'out_for_delivery', 'delivered', 'completed', 'cancelled', 'rejected'
        ];

        if (!validStatuses.includes(status)) {
            throw new BadRequestError(
                `Invalid status value '${status}'. Must be one of: ${validStatuses.join(', ')}`
            );
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

    static async getOrderTrail(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;

        try {
            // Check if the id is a UUID (old format) or orderNumber (new format)
            let orderId;
            if (OrderController.isOrderNumber(id)) {
                // New format: orderNumber (e.g., B2S-ABC123)
                const order = await OrderService.getOrderByNumber(id);
                orderId = order.id;
            } else {
                // Old format: UUID
                orderId = id;
            }

            // Verify the order exists and user has permission
            const order = await OrderService.getOrder(orderId);
            
            // Check if the user is authorized to view this order trail
            // Only customers and agents involved in the order can view the trail
            if (order.customerId !== req.user.id && order.agentId !== req.user.id) {
                throw new ForbiddenError('Not authorized to view this order trail');
            }

            const trail = await OrderTrailService.getOrderTrail(orderId);

            res.status(200).json({
                status: 'success',
                message: 'Order trail retrieved successfully',
                data: trail,
            });
        } catch (error) {
            console.error('Error retrieving order trail:', { 
                id, 
                error: error instanceof Error ? error.message : String(error), 
            });
            throw error;
        }
    }
}