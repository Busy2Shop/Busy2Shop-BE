import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/authMiddleware';
import AlatPayService from '../../services/payment/alatpay.service';
import { BadRequestError, NotFoundError } from '../../utils/customErrors';
import { logger } from '../../utils/logger';
import OrderService from '../../services/order.service';
import ShoppingListService from '../../services/shopping-list.service';

export default class AlatPayController {
    /**
     * Generate a virtual account for payment
     */
    static async generateVirtualAccount(req: AuthenticatedRequest, res: Response) {
        const { amount, orderId, description } = req.body;

        if (!amount || !orderId) {
            throw new BadRequestError('Amount and orderId are required');
        }

        // You might want to validate if the order exists and belongs to the user
        const user = req.user;

        const response = await AlatPayService.generateVirtualAccount({
            amount,
            orderId,
            description: description || `Payment for order ${orderId}`,
            user,
        });

        res.status(200).json({
            status: 'success',
            message: 'Virtual account generated successfully',
            data: response.data,
        });
    }

    /**
     * Check payment status
     */
    static async checkPaymentStatus(req: AuthenticatedRequest, res: Response) {
        const { transactionId } = req.params;

        if (!transactionId) {
            throw new BadRequestError('Transaction ID is required');
        }

        const response = await AlatPayService.checkTransactionStatus(transactionId);

        res.status(200).json({
            status: 'success',
            message: 'Transaction status retrieved',
            data: response.data,
        });
    }

    /**
     * Get payment transaction history
     */
    static async getTransactionHistory(req: AuthenticatedRequest, res: Response) {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;

        const transactions = await AlatPayService.getTransactionHistory(page, limit);

        res.status(200).json({
            status: 'success',
            message: 'Transaction history retrieved',
            data: transactions.data,
            pagination: transactions.pagination,
        });
    }

    /**
     * Get user payments
     */
    static async getUserPayments(req: AuthenticatedRequest, res: Response) {
        const payments = await AlatPayService.getUserPayments(req.user.id);

        res.status(200).json({
            status: 'success',
            message: 'User payments retrieved',
            data: payments,
        });
    }

    /**
     * Handle webhook notifications from ALATPay
     */
    static async handleWebhook(req: Request, res: Response) {
        try {
            const payload = req.body;

            // Process the webhook asynchronously
            // We don't want to keep ALATPay waiting for a response
            AlatPayService.processWebhook({ payload })
                .catch(error => {
                    logger.error('Error processing webhook:', error);
                });

            // Always respond with 200 to acknowledge receipt
            // This prevents ALATPay from retrying the webhook
            res.status(200).json({
                status: 'success',
                message: 'Webhook received',
            });
        } catch (error) {
            logger.error('Error handling webhook:', error);

            // Still return 200 to prevent retries
            res.status(200).json({
                status: 'success',
                message: 'Webhook received with errors',
            });
        }
    }

    /**
     * Generate payment link for a shopping list
     */
    static async generatePaymentLink(req: AuthenticatedRequest, res: Response) {
        const { shoppingListId } = req.params;

        if (!shoppingListId) {
            throw new BadRequestError('Shopping list ID is required');
        }

        try {
            // Get shopping list details
            const shoppingList = await ShoppingListService.getShoppingList(shoppingListId);

            if (!shoppingList) {
                throw new NotFoundError('Shopping list not found');
            }

            // Check if the shopping list belongs to the user
            if (shoppingList.customerId !== req.user.id) {
                throw new BadRequestError('You do not have access to this shopping list');
            }

            // Calculate total amount
            const totalAmount = shoppingList.estimatedTotal ||
                shoppingList.items.reduce((acc, item) => acc + (item.estimatedPrice || 0) * item.quantity, 0);

            // Generate virtual account
            const response = await AlatPayService.generateVirtualAccount({
                amount: totalAmount,
                orderId: shoppingListId,
                description: `Payment for shopping list: ${shoppingList.name}`,
                user: req.user,
            });

            res.status(200).json({
                status: 'success',
                message: 'Payment link generated successfully',
                data: response.data,
            });
        } catch (error) {
            logger.error('Error generating payment link:', error);
            throw error;
        }
    }

    /**
     * Generate payment link for an order
     */
    static async generateOrderPaymentLink(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;

        if (!orderId) {
            throw new BadRequestError('Order ID is required');
        }

        try {
            // Get order details
            const order = await OrderService.getOrder(orderId);

            if (!order) {
                throw new NotFoundError('Order not found');
            }

            // Check if the order belongs to the user
            if (order.customerId !== req.user.id) {
                throw new BadRequestError('You do not have access to this order');
            }

            // Generate virtual account
            const response = await AlatPayService.generateVirtualAccount({
                amount: order.totalAmount,
                orderId: orderId,
                description: `Payment for order #${orderId}`,
                user: req.user,
            });

            res.status(200).json({
                status: 'success',
                message: 'Payment link generated successfully',
                data: response.data,
            });
        } catch (error) {
            logger.error('Error generating payment link:', error);
            throw error;
        }
    }
}