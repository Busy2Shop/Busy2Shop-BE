// src/controllers/payment/alatpay.controller.ts
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/authMiddleware';
import AlatPayService from '../../services/payment/alatpay.service';
import { BadRequestError, NotFoundError } from '../../utils/customErrors';
import { logger } from '../../utils/logger';
import OrderService from '../../services/order.service';
import ShoppingListService from '../../services/shoppingList.service';
import { paymentWebhookQueue } from '../../queues/payment.queue';
import ShoppingListItem from '../../models/shoppingListItem.model';
import TransactionService from '../../services/transaction.service';

export default class AlatPayController {
    /**
     * Generate a virtual account for payment
     */
    static async generateVirtualAccount(req: AuthenticatedRequest, res: Response) {
        const { amount, orderId, description, currency, referenceType } = req.body;

        if (!amount || !orderId) {
            throw new BadRequestError('Amount and orderId are required');
        }

        // You might want to validate if the order exists and belongs to the user
        const user = req.user;

        const response = await AlatPayService.generateVirtualAccount({
            amount,
            orderId,
            description: description || `Payment for ${referenceType === 'shopping_list' ? 'shopping list' : 'order'} ${orderId}`,
            user,
            currency: currency || 'NGN',
            idempotencyKey: req.body.idempotencyKey,
            referenceType: referenceType || 'order',
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
        const status = req.query.status as string;
        const startAt = req.query.startAt ? new Date(req.query.startAt as string) : undefined;
        const endAt = req.query.endAt ? new Date(req.query.endAt as string) : undefined;

        // Build filters object
        const filters: Record<string, any> = {};
        if (status) filters.Status = status;
        if (startAt) filters.StartAt = startAt.toISOString();
        if (endAt) filters.EndAt = endAt.toISOString();

        const transactions = await AlatPayService.getTransactionHistory(page, limit, filters);

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

            // Log webhook receipt
            logger.info('Received ALATPay webhook', {
                payloadSummary: payload?.Value?.Data
                    ? {
                        transactionId: payload.Value.Data.Id,
                        status: payload.Value.Data.Status,
                        amount: payload.Value.Data.Amount,
                        orderId: payload.Value.Data.OrderId,
                    }
                    : 'Invalid payload structure',
            });

            // Find the transaction by provider transaction ID
            const transaction = await TransactionService.getTransactionByProviderId(payload.Value.Data.Id);

            if (!transaction) {
                logger.warn(`Transaction not found for provider transaction ID: ${payload.Value.Data.Id}`);
                return res.status(200).json({
                    status: 'success',
                    message: 'Webhook received but transaction not found',
                });
            }

            // Process the webhook asynchronously using the queue system
            await paymentWebhookQueue.add('process-webhook', {
                providerTransactionId: payload.Value.Data.Id,
                transactionId: transaction.id,
                userId: transaction.userId,
            });

            // Always respond with 200 to acknowledge receipt
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
        const { currency } = req.body;

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

            // Calculate total amount with explicit typing to fix TypeScript error
            const totalAmount =
                shoppingList.estimatedTotal ||
                shoppingList.items.reduce(
                    (acc: number, item: ShoppingListItem) =>
                        acc + (item.estimatedPrice || 0) * item.quantity,
                    0,
                );

            // Generate virtual account
            const response = await AlatPayService.generateVirtualAccount({
                amount: totalAmount,
                orderId: shoppingListId,
                description: `Payment for shopping list: ${shoppingList.name}`,
                user: req.user,
                currency: currency || 'NGN',
                idempotencyKey: req.body.idempotencyKey,
                referenceType: 'shopping_list',
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
        const { currency } = req.body;

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
                currency: currency || 'NGN',
                idempotencyKey: req.body.idempotencyKey,
                referenceType: 'order',
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
     * Reconcile local transactions with ALATPay
     */
    static async reconcileTransactions(req: AuthenticatedRequest, res: Response) {
        try {
            const result = await AlatPayService.reconcileTransactions();

            res.status(200).json({
                status: 'success',
                message: 'Transactions reconciled successfully',
                data: result,
            });
        } catch (error) {
            logger.error('Error reconciling transactions:', error);
            throw error;
        }
    }

    /**
     * Check for expired transactions
     */
    static async checkExpiredTransactions(req: AuthenticatedRequest, res: Response) {
        try {
            const result = await AlatPayService.checkExpiredTransactions();

            res.status(200).json({
                status: 'success',
                message: 'Expired transactions checked successfully',
                data: result,
            });
        } catch (error) {
            logger.error('Error checking expired transactions:', error);
            throw error;
        }
    }
}
