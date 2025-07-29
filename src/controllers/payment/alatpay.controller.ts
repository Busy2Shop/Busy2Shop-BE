// src/controllers/payment/alatpay.controller.ts
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/authMiddleware';
import AlatPayService from '../../services/payment/alatpay.service';
import { BadRequestError, NotFoundError } from '../../utils/customErrors';
import { logger } from '../../utils/logger';
import OrderService from '../../services/order.service';
import ShoppingListService from '../../services/shoppingList.service';
import SystemSettingsService from '../../services/systemSettings.service';
import { paymentWebhookQueue } from '../../queues/payment.queue';
import ShoppingListItem from '../../models/shoppingListItem.model';
import TransactionService from '../../services/transaction.service';

// Interface for calculated fees
interface CalculatedFees {
    subtotal: number;
    serviceFee: number;
    deliveryFee: number;
    discountAmount: number;
    total: number;
}

// Helper function to calculate fees with proper type handling
async function calculateOrderFees(
    subtotal: number | string, 
    discountAmount: number = 0
): Promise<CalculatedFees> {
    // Ensure subtotal is a number
    const numericSubtotal = typeof subtotal === 'string' ? parseFloat(subtotal) : subtotal;
    
    if (isNaN(numericSubtotal) || numericSubtotal < 0) {
        throw new BadRequestError('Invalid subtotal amount');
    }
    
    // Ensure discount is a number
    const numericDiscount = typeof discountAmount === 'string' ? parseFloat(discountAmount) : (discountAmount || 0);
    const finalDiscount = isNaN(numericDiscount) ? 0 : Math.max(0, numericDiscount);
    
    // Get fees from system settings
    const serviceFee = await SystemSettingsService.calculateServiceFee(numericSubtotal);
    const deliveryFee = await SystemSettingsService.getDeliveryFee();
    
    // Calculate total ensuring all values are numbers
    const total = Math.max(0, numericSubtotal + serviceFee + deliveryFee - finalDiscount);
    
    return {
        subtotal: numericSubtotal,
        serviceFee: Math.round(serviceFee * 100) / 100, // Round to 2 decimal places
        deliveryFee: Math.round(deliveryFee * 100) / 100,
        discountAmount: Math.round(finalDiscount * 100) / 100,
        total: Math.round(total * 100) / 100
    };
}

export default class AlatPayController {
    /**
     * Generate a virtual account for payment with automatic fee calculation
     */
    static async generateVirtualAccount(req: AuthenticatedRequest, res: Response) {
        const { subtotal, orderId, description, currency, referenceType, discountAmount } = req.body;

        if (!subtotal || !orderId) {
            throw new BadRequestError('Subtotal and orderId are required');
        }

        // Calculate fees using system settings
        const calculatedFees = await calculateOrderFees(subtotal, discountAmount);
        
        // You might want to validate if the order exists and belongs to the user
        const user = req.user;

        const response = await AlatPayService.generateVirtualAccount({
            amount: calculatedFees.total,
            orderId,
            description: description || `Payment for ${referenceType === 'shopping_list' ? 'shopping list' : 'order'} ${orderId}`,
            user,
            currency: currency || 'NGN',
            idempotencyKey: req.body.idempotencyKey,
            referenceType: referenceType || 'order',
            metadata: {
                ...calculatedFees,
                originalSubtotal: subtotal
            }
        });

        res.status(200).json({
            status: 'success',
            message: 'Virtual account generated successfully',
            data: {
                ...response.data,
                fees: calculatedFees
            },
        });
    }

    /**
     * Check payment status and ensure order creation if payment is completed
     */
    static async checkPaymentStatus(req: AuthenticatedRequest, res: Response) {
        const { transactionId } = req.params;

        if (!transactionId) {
            throw new BadRequestError('Transaction ID is required');
        }

        // Get the transaction status from AlatPay (this will also trigger webhook processing if status changed)
        const response = await AlatPayService.checkTransactionStatus(transactionId);

        // Get our local transaction record
        const transaction = await TransactionService.getTransactionByProviderId(transactionId);
        
        if (!transaction) {
            throw new NotFoundError('Transaction not found');
        }

        // Check if user has access to this transaction  
        if (transaction.userId !== req.user.id) {
            throw new BadRequestError('You do not have access to this transaction');
        }

        let orderInfo = null;

        // If payment is completed and it's for a shopping list, check if order exists
        if (response.data.status === 'COMPLETED' && transaction.type === 'shopping_list') {
            try {
                // Check if an order already exists for this shopping list using the efficient method
                const relatedOrder = await OrderService.findOrderByShoppingListId(
                    transaction.referenceId, 
                    req.user.id
                );

                if (relatedOrder) {
                    orderInfo = {
                        orderId: relatedOrder.id,
                        orderNumber: relatedOrder.orderNumber, // Using the actual human-readable order number
                        status: relatedOrder.status,
                        paymentStatus: relatedOrder.paymentStatus
                    };
                }

                // If no order exists, the webhook processing should create it soon
                // We'll let the async processing handle it rather than creating it synchronously here
                // to avoid race conditions
            } catch (error) {
                logger.error('Error checking for existing order:', error);
                // Don't throw here, just log and continue
            }
        }

        res.status(200).json({
            status: 'success',
            message: 'Transaction status retrieved',
            data: {
                ...response.data,
                // Include our local transaction info
                localStatus: transaction.status,
                transactionType: transaction.type,
                referenceId: transaction.referenceId,
                order: orderInfo
            },
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
     * Generate payment link for a shopping list and create order
     */
    static async generatePaymentLink(req: AuthenticatedRequest, res: Response) {
        const { shoppingListId } = req.params;
        const { currency, deliveryAddress, customerNotes, frontendTotal, discountAmount } = req.body;

        if (!shoppingListId) {
            throw new BadRequestError('Shopping list ID is required');
        }

        if (!deliveryAddress) {
            throw new BadRequestError('Delivery address is required');
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

            // Allow payment generation for draft or pending status (for retries)
            if (!['draft', 'pending'].includes(shoppingList.status)) {
                throw new BadRequestError(`Cannot create payment for shopping list in ${shoppingList.status} status`);
            }

            // Check if an order already exists for this shopping list
            const existingOrder = await OrderService.findOrderByShoppingListId(shoppingListId, req.user.id);
            
            // If order exists and payment is completed, don't allow new payment
            if (existingOrder && existingOrder.paymentStatus === 'completed') {
                throw new BadRequestError('Payment has already been completed for this order');
            }
            
            // If order exists but payment failed/expired, we can continue with new payment
            // This allows retry scenarios

            // Calculate subtotal with explicit typing to fix TypeScript error
            const subtotal =
                shoppingList.estimatedTotal ||
                shoppingList.items.reduce(
                    (acc: number, item: ShoppingListItem) =>
                        acc + (item.estimatedPrice || 0) * item.quantity,
                    0,
                );

            // Calculate fees using the reusable function
            const calculatedFees = await calculateOrderFees(subtotal, discountAmount || 0);

            // Update shopping list status to pending only if it's currently draft
            if (shoppingList.status === 'draft') {
                await ShoppingListService.updateListStatus(shoppingListId, req.user.id, 'pending');
            }

            // Generate virtual account
            const response = await AlatPayService.generateVirtualAccount({
                amount: calculatedFees.total, // Use calculated total including fees
                orderId: shoppingListId,
                description: `Payment for shopping list: ${shoppingList.name}`,
                user: req.user,
                currency: currency || 'NGN',
                idempotencyKey: req.body.idempotencyKey,
                referenceType: 'shopping_list',
                metadata: {
                    deliveryAddress,
                    customerNotes,
                    shoppingListId,
                    customerId: req.user.id,
                    ...calculatedFees
                }
            });

            let order: any;
            
            if (existingOrder && existingOrder.paymentStatus !== 'completed') {
                // Update existing order with new payment details (retry scenario)
                order = await existingOrder.update({
                    totalAmount: calculatedFees.total,
                    paymentStatus: 'pending',
                    paymentId: response.data.data.transactionId,
                    serviceFee: calculatedFees.serviceFee,
                    deliveryFee: calculatedFees.deliveryFee,
                    deliveryAddress: deliveryAddress,
                    customerNotes: customerNotes,
                    updatedAt: new Date()
                });
                
                logger.info(`Order ${order.id} updated for retry payment on shopping list ${shoppingListId}`);
            } else {
                // Create new order with pending payment status
                order = await OrderService.createOrder({
                    customerId: req.user.id,
                    shoppingListId: shoppingListId,
                    totalAmount: calculatedFees.total,
                    status: 'pending', // Order pending payment
                    paymentStatus: 'pending', // Payment not yet completed
                    paymentId: response.data.data.transactionId,
                    serviceFee: calculatedFees.serviceFee,
                    deliveryFee: calculatedFees.deliveryFee,
                    deliveryAddress: deliveryAddress,
                    customerNotes: customerNotes
                });
                
                logger.info(`Order ${order.id} created with pending payment for shopping list ${shoppingListId}`);
            }

            res.status(200).json({
                status: 'success',
                message: 'Payment link generated and order created successfully',
                data: {
                    ...response.data.data, // AlatPay response has structure: { data: { ... } }
                    transactionId: response.data.data.transactionId, // Ensure transactionId is included
                    orderId: order.id,
                    orderStatus: order.status,
                    paymentStatus: order.paymentStatus,
                    amount: calculatedFees.total, // Include the total amount as number
                    createdAt: response.data.data.createdAt, // Include creation time
                    // Add bank details for frontend display
                    bankName: 'Wema Bank',
                    accountName: 'Busy2Shop Limited',
                    bankCode: response.data.data.virtualBankCode || '035',
                    // Include fee breakdown
                    fees: calculatedFees
                },
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
