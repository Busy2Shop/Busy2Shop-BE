import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import OrderService from '../services/order.service';
import ShoppingListService from '../services/shoppingList.service';
import { BadRequestError, ForbiddenError } from '../utils/customErrors';

export default class OrderController {
    static async createOrder(req: AuthenticatedRequest, res: Response) {
        const { shoppingListId, deliveryAddress, customerNotes } = req.body;

        if (!shoppingListId || !deliveryAddress) {
            throw new BadRequestError('Shopping list ID and delivery address are required');
        }

        // Get the shopping list to verify ownership
        const shoppingList = await ShoppingListService.getShoppingList(shoppingListId);

        if (shoppingList.userId !== req.user.id) {
            throw new ForbiddenError('You are not authorized to create an order from this shopping list');
        }

        // Calculate totals for the order
        const { totalAmount, serviceFee, deliveryFee } = await OrderService.calculateTotals(shoppingListId);

        // Create the order
        const order = await OrderService.createOrder({
            shoppingListId,
            customerId: req.user.id,
            vendorId: shoppingList.vendorId,
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
        const { page, size, status, startDate, endDate } = req.query;

        const queryParams: Record<string, unknown> = {};

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (status) queryParams.status = status;
        if (startDate) queryParams.startDate = startDate as string;
        if (endDate) queryParams.endDate = endDate as string;

        const orders = await OrderService.getUserOrders(req.user.id, queryParams);

        res.status(200).json({
            status: 'success',
            message: 'Orders retrieved successfully',
            data: { ...orders },
        });
    }

    static async getVendorOrders(req: AuthenticatedRequest, res: Response) {
        // Check if user is a vendor
        if (req.user.status.userType !== 'vendor') {
            throw new ForbiddenError('Only vendors can access their assigned orders');
        }

        const { page, size, status, startDate, endDate } = req.query;

        const queryParams: Record<string, unknown> = {};

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (status) queryParams.status = status;
        if (startDate) queryParams.startDate = startDate as string;
        if (endDate) queryParams.endDate = endDate as string;

        const orders = await OrderService.getVendorOrders(req.user.id, queryParams);

        res.status(200).json({
            status: 'success',
            message: 'Vendor orders retrieved successfully',
            data: { ...orders },
        });
    }

    static async getOrder(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;

        const order = await OrderService.getOrder(id);

        // Check if user is authorized to view this order
        // if (order.customerId !== req.user.id && order.vendorId !== req.user.id && req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('You are not authorized to view this order');
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

        const updatedOrder = await OrderService.updateOrderStatus(id, req.user.id, status);

        res.status(200).json({
            status: 'success',
            message: 'Order status updated successfully',
            data: updatedOrder,
        });
    }

    static async addVendorNotes(req: AuthenticatedRequest, res: Response) {
        // Only vendors can add vendor notes
        if (req.user.status.userType !== 'vendor') {
            throw new ForbiddenError('Only vendors can add vendor notes');
        }

        const { id } = req.params;
        const { notes } = req.body;

        if (!notes) {
            throw new BadRequestError('Notes are required');
        }

        const updatedOrder = await OrderService.addVendorNotes(id, req.user.id, notes);

        res.status(200).json({
            status: 'success',
            message: 'Vendor notes added successfully',
            data: updatedOrder,
        });
    }

    static async addCustomerNotes(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { notes } = req.body;

        if (!notes) {
            throw new BadRequestError('Notes are required');
        }

        const updatedOrder = await OrderService.addCustomerNotes(id, req.user.id, notes);

        res.status(200).json({
            status: 'success',
            message: 'Customer notes added successfully',
            data: updatedOrder,
        });
    }
}