// src/controllers/payment/alatpay.controller.ts
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/authMiddleware';
import AlatPayService from '../../services/payment/alatpay.service';
import { BadRequestError, NotFoundError } from '../../utils/customErrors';
import { logger } from '../../utils/logger';
import OrderService from '../../services/order.service';
import ShoppingListService from '../../services/shoppingList.service';
import SystemSettingsService from '../../services/systemSettings.service';
import ShoppingListItem from '../../models/shoppingListItem.model';

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
        total: Math.round(total * 100) / 100,
    };
}

export default class AlatPayController {

    /**
     * Check payment status with ALATPay verification fallback
     */
    static async checkPaymentStatus(req: AuthenticatedRequest, res: Response) {
        const { transactionId } = req.params;

        if (!transactionId) {
            throw new BadRequestError('Transaction ID is required');
        }

        try {
            // Find order by transaction ID
            const order = await OrderService.getOrderByPaymentId(transactionId);

            if (!order) {
                res.status(200).json({
                    status: 'success',
                    message: 'No order found for this transaction',
                    data: {
                        status: 'not_found',
                        orderNumber: null,
                    },
                });
                return;
            }

            // Verify user authorization
            if (order.customerId !== req.user.id) {
                throw new BadRequestError('Not authorized to view this order');
            }

            let actualPaymentStatus = order.paymentStatus;
            let shouldSync = false;
            let alatPayStatus = null;

            // If payment is still pending, verify with ALATPay for missed webhooks
            if (order.paymentStatus === 'pending') {
                try {
                    logger.info(`Verifying pending payment ${transactionId} with ALATPay`);
                    alatPayStatus = await AlatPayService.checkTransactionStatus(transactionId);
                    
                    const isAlatPayCompleted = alatPayStatus?.status === 'COMPLETED' || alatPayStatus?.status === 'completed';
                    
                    if (isAlatPayCompleted && order.paymentStatus === 'pending') {
                        logger.warn(`Payment status mismatch detected! ALATPay: ${alatPayStatus.status}, Local: ${order.paymentStatus}`);
                        shouldSync = true;
                    }
                    
                    logger.info('ALATPay status verification result:', {
                        transactionId,
                        localStatus: order.paymentStatus,
                        alatPayStatus: alatPayStatus?.status,
                        needsSync: shouldSync,
                    });
                } catch (verificationError) {
                    logger.warn(`Failed to verify payment with ALATPay for transaction ${transactionId}:`, verificationError);
                    // Continue with local status if verification fails
                }
            }

            // Perform automatic sync if status mismatch detected
            if (shouldSync && alatPayStatus) {
                try {
                    logger.info(`Auto-syncing payment status for transaction ${transactionId}`);
                    
                    const PaymentStatusSyncService = (await import('../../services/paymentStatusSync.service')).default;
                    const result = await PaymentStatusSyncService.confirmPayment(
                        order.id,
                        transactionId,
                        'api_sync',
                        'system' // Auto-sync initiated by status check
                    );
                    
                    if (result.success) {
                        actualPaymentStatus = 'completed';
                        logger.info(`Auto-sync successful for transaction ${transactionId}`, {
                            assignedAgentId: result.assignedAgentId,
                        });
                        
                        // Get fresh order data after sync
                        const syncedOrder = await OrderService.getOrder(order.id, true, false);
                        
                        res.status(200).json({
                            status: 'success',
                            message: 'Payment status retrieved and synced',
                            data: {
                                status: syncedOrder.paymentStatus,
                                orderNumber: syncedOrder.orderNumber,
                                orderId: syncedOrder.id,
                                orderStatus: syncedOrder.status,
                                amount: syncedOrder.totalAmount,
                                createdAt: syncedOrder.createdAt,
                                paymentProcessedAt: syncedOrder.paymentProcessedAt,
                                agentId: syncedOrder.agentId,
                                shoppingListId: syncedOrder.shoppingListId,
                                autoSynced: true,
                                alatPayStatus: alatPayStatus?.status,
                                agent: syncedOrder.agent ? {
                                    id: syncedOrder.agent.id,
                                    firstName: syncedOrder.agent.firstName,
                                    lastName: syncedOrder.agent.lastName,
                                    phone: syncedOrder.agent.phone,
                                    displayImage: syncedOrder.agent.displayImage,
                                } : null,
                            },
                        });
                        return;
                    } else {
                        logger.error(`Auto-sync failed for transaction ${transactionId}:`, result.error);
                    }
                } catch (syncError) {
                    logger.error(`Failed to auto-sync payment for transaction ${transactionId}:`, syncError);
                    // Continue with original status
                }
            }

            // Get order with agent info if needed
            const orderWithAgent = await OrderService.getOrder(order.id, true, false);
            
            // Return current order status (with potential ALATPay verification info)
            res.status(200).json({
                status: 'success',
                message: 'Payment status retrieved',
                data: {
                    status: actualPaymentStatus,
                    orderNumber: order.orderNumber,
                    orderId: order.id,
                    orderStatus: order.status,
                    amount: order.totalAmount,
                    createdAt: order.createdAt,
                    paymentProcessedAt: order.paymentProcessedAt,
                    agentId: order.agentId,
                    shoppingListId: order.shoppingListId,
                    alatPayStatus: alatPayStatus?.status || 'not_checked',
                    verified: !!alatPayStatus,
                    agent: orderWithAgent.agent ? {
                        id: orderWithAgent.agent.id,
                        firstName: orderWithAgent.agent.firstName,
                        lastName: orderWithAgent.agent.lastName,
                        phone: orderWithAgent.agent.phone,
                        displayImage: orderWithAgent.agent.displayImage,
                    } : null,
                },
            });
        } catch (error) {
            logger.error('Error checking payment status:', error);
            throw error;
        }
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
     * Handle webhook notifications from ALATPay (Simplified)
     */
    static async handleWebhook(req: Request, res: Response) {
        try {
            const payload = req.body;
            const webhookData = payload?.Value?.Data;
            
            if (!webhookData) {
                logger.warn('Invalid webhook payload structure', { payload });
                res.status(200).json({ status: 'success', message: 'Invalid payload' });
                return;
            }

            const transactionId = webhookData.Id || '';
            const paymentStatus = webhookData.Status;
            
            logger.info('Processing ALATPay webhook', {
                transactionId,
                status: paymentStatus,
                amount: webhookData.Amount,
            });

            // Only process completed payments
            const isCompleted = paymentStatus === 'completed' || paymentStatus === 'COMPLETED';
            if (!isCompleted) {
                logger.info(`Payment not completed (status: ${paymentStatus}) - skipping`);
                res.status(200).json({ status: 'success', message: 'Payment not completed' });
                return;
            }

            // Find order by transaction ID
            const order = await OrderService.getOrderByPaymentId(transactionId);
            if (!order) {
                logger.warn(`No order found for transaction ${transactionId}`);
                res.status(200).json({ status: 'success', message: 'Order not found' });
                return;
            }

            // Skip if already processed
            if (order.paymentStatus === 'completed') {
                logger.info(`Order ${order.orderNumber} already completed`);
                res.status(200).json({ status: 'success', message: 'Already processed' });
                return;
            }

            // Process payment confirmation
            const PaymentStatusSyncService = (await import('../../services/paymentStatusSync.service')).default;
            const result = await PaymentStatusSyncService.confirmPayment(
                order.id,
                transactionId,
                'webhook',
                'system'
            );

            if (result.success) {
                logger.info(`Webhook processed successfully for order ${order.orderNumber}`, {
                    assignedAgentId: result.assignedAgentId,
                });
                
                res.status(200).json({
                    status: 'success',
                    message: 'Payment confirmed',
                    data: {
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        assignedAgentId: result.assignedAgentId,
                    },
                });
                return;
            } else {
                logger.error(`Webhook processing failed for order ${order.orderNumber}:`, result.error);
                res.status(200).json({ status: 'success', message: 'Processing failed' });
                return;
            }
            
        } catch (error) {
            logger.error('Webhook processing error:', {
                error: error instanceof Error ? error.message : String(error),
                payload: req.body,
            });

            // Always return 200 to prevent webhook retries
            res.status(200).json({ status: 'success', message: 'Webhook received' });
            return;
        }
    }

    /**
     * Get payment completion redirect information
     */
    static async getPaymentRedirectInfo(req: AuthenticatedRequest, res: Response) {
        const { transactionId } = req.params;

        if (!transactionId) {
            throw new BadRequestError('Transaction ID is required');
        }

        try {
            // Get the transaction status from AlatPay
            const status = await AlatPayService.checkTransactionStatus(transactionId);

            // Find order by transaction ID
            const order = await OrderService.getOrderByPaymentId(transactionId);

            if (!order) {
                res.status(404).json({
                    status: 'error',
                    message: 'Order not found for this transaction',
                    data: null,
                });
                return;
            }

            // Check if user is authorized to view this order
            if (order.customerId !== req.user.id) {
                res.status(403).json({
                    status: 'error',
                    message: 'Not authorized to view this order',
                    data: null,
                });
                return;
            }

            // Return redirect information based on payment status
            const paymentCompleted = status?.status === 'COMPLETED' || status?.status === 'completed';

            res.status(200).json({
                status: 'success',
                message: 'Payment redirect info retrieved',
                data: {
                    transactionId,
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    paymentStatus: order.paymentStatus,
                    paymentCompleted,
                    redirectUrl: paymentCompleted ? `/orders/${order.orderNumber}?new=true&payment=completed` : null,
                    shouldRedirect: paymentCompleted,
                    order: {
                        id: order.id,
                        orderNumber: order.orderNumber,
                        totalAmount: order.totalAmount,
                        status: order.status,
                        paymentStatus: order.paymentStatus,
                        createdAt: order.createdAt,
                        updatedAt: order.updatedAt,
                    },
                },
            });
        } catch (error) {
            logger.error('Error getting payment redirect info:', error);
            throw error;
        }
    }

    /**
     * Generate payment link for a shopping list and create order (Simplified)
     */
    static async generatePaymentDetails(req: AuthenticatedRequest, res: Response) {
        const { shoppingListId } = req.params;
        const { currency, deliveryAddress, customerNotes, discountAmount } = req.body;

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

            // Allow payment generation for draft status only
            if (shoppingList.status !== 'draft') {
                throw new BadRequestError(`This shopping list has already been processed (status: ${shoppingList.status})`);
            }

            // Check for existing order with ALATPay verification
            const existingOrder = await OrderService.findOrderByShoppingListId(shoppingListId, req.user.id);
            
            if (existingOrder) {
                logger.info(`Found existing order ${existingOrder.orderNumber} for shopping list ${shoppingListId}`);
                
                // If payment is completed, return completed order details
                if (existingOrder.paymentStatus === 'completed') {
                    const freshOrder = await OrderService.getOrder(existingOrder.id, true, false);
                    
                    res.status(200).json({
                        status: 'success',
                        message: 'Payment already completed for this order',
                        data: {
                            transactionId: freshOrder.paymentId,
                            orderId: freshOrder.id,
                            orderNumber: freshOrder.orderNumber,
                            orderStatus: freshOrder.status,
                            paymentStatus: freshOrder.paymentStatus,
                            amount: freshOrder.totalAmount,
                            createdAt: freshOrder.createdAt,
                            paymentProcessedAt: freshOrder.paymentProcessedAt,
                            agentId: freshOrder.agentId,
                            fees: {
                                subtotal: freshOrder.totalAmount - freshOrder.serviceFee - freshOrder.deliveryFee,
                                serviceFee: freshOrder.serviceFee,
                                deliveryFee: freshOrder.deliveryFee,
                                discountAmount: 0,
                                total: freshOrder.totalAmount,
                            },
                            isExistingOrder: true,
                            paymentCompleted: true,
                        },
                    });
                    return;
                }
                
                // Check if pending order is still valid with ALATPay verification
                if (existingOrder.paymentStatus === 'pending' && existingOrder.paymentId) {
                    const paymentTimeoutMinutes = await SystemSettingsService.getPaymentTimeout();
                    const orderAge = Date.now() - new Date(existingOrder.createdAt).getTime();
                    const timeoutMs = paymentTimeoutMinutes * 60 * 1000;
                    
                    // Verify with ALATPay for missed webhooks
                    let alatPayStatus = null;
                    let shouldSync = false;
                    
                    try {
                        logger.info(`Verifying existing order ${existingOrder.orderNumber} with ALATPay`);
                        alatPayStatus = await AlatPayService.checkTransactionStatus(existingOrder.paymentId);
                        
                        const isAlatPayCompleted = alatPayStatus?.status === 'COMPLETED' || alatPayStatus?.status === 'completed';
                        
                        if (isAlatPayCompleted && existingOrder.paymentStatus === 'pending') {
                            logger.warn(`Payment completed but not synced! Order: ${existingOrder.orderNumber}`);
                            shouldSync = true;
                        }
                    } catch (verificationError) {
                        logger.warn('Failed to verify existing order with ALATPay:', verificationError);
                    }
                    
                    // Auto-sync if payment is completed on ALATPay
                    if (shouldSync && alatPayStatus) {
                        try {
                            logger.info(`Auto-syncing completed payment for order ${existingOrder.orderNumber}`);
                            
                            const PaymentStatusSyncService = (await import('../../services/paymentStatusSync.service')).default;
                            const result = await PaymentStatusSyncService.confirmPayment(
                                existingOrder.id,
                                existingOrder.paymentId,
                                'api_sync',
                                req.user.id
                            );
                            
                            if (result.success) {
                                const syncedOrder = await OrderService.getOrder(existingOrder.id, true, false);
                                
                                logger.info(`Payment auto-synced successfully for order ${existingOrder.orderNumber}`);
                                
                                res.status(200).json({
                                    status: 'success',
                                    message: 'Payment completed and synced',
                                    data: {
                                        transactionId: syncedOrder.paymentId,
                                        orderId: syncedOrder.id,
                                        orderNumber: syncedOrder.orderNumber,
                                        orderStatus: syncedOrder.status,
                                        paymentStatus: syncedOrder.paymentStatus,
                                        amount: syncedOrder.totalAmount,
                                        createdAt: syncedOrder.createdAt,
                                        paymentProcessedAt: syncedOrder.paymentProcessedAt,
                                        agentId: syncedOrder.agentId,
                                        fees: {
                                            subtotal: syncedOrder.totalAmount - syncedOrder.serviceFee - syncedOrder.deliveryFee,
                                            serviceFee: syncedOrder.serviceFee,
                                            deliveryFee: syncedOrder.deliveryFee,
                                            discountAmount: 0,
                                            total: syncedOrder.totalAmount,
                                        },
                                        isExistingOrder: true,
                                        paymentCompleted: true,
                                        autoSynced: true,
                                    },
                                });
                                return;
                            } else {
                                logger.error(`Auto-sync failed for order ${existingOrder.orderNumber}:`, result.error);
                            }
                        } catch (syncError) {
                            logger.error(`Failed to auto-sync order ${existingOrder.orderNumber}:`, syncError);
                        }
                    }
                    
                    if (orderAge < timeoutMs) {
                        // Return existing pending order
                        res.status(200).json({
                            status: 'success',
                            message: 'Existing pending order found',
                            data: {
                                transactionId: existingOrder.paymentId,
                                orderId: existingOrder.id,
                                orderNumber: existingOrder.orderNumber,
                                orderStatus: existingOrder.status,
                                paymentStatus: existingOrder.paymentStatus,
                                amount: existingOrder.totalAmount,
                                createdAt: existingOrder.createdAt,
                                bankName: 'Wema Bank',
                                accountName: 'Busy2Shop Limited',
                                bankCode: '035',
                                accountNumber: '8880164235',
                                fees: {
                                    subtotal: existingOrder.totalAmount - existingOrder.serviceFee - existingOrder.deliveryFee,
                                    serviceFee: existingOrder.serviceFee,
                                    deliveryFee: existingOrder.deliveryFee,
                                    discountAmount: 0,
                                    total: existingOrder.totalAmount,
                                },
                                isExistingOrder: true,
                                timeRemaining: Math.max(0, timeoutMs - orderAge),
                                paymentCompleted: false,
                                alatPayStatus: alatPayStatus?.status || 'not_checked',
                            },
                        });
                        return;
                    } else {
                        // Expire old pending order
                        await OrderService.updateOrderPaymentStatus(existingOrder.id, 'expired');
                        logger.info(`Expired old pending order ${existingOrder.orderNumber}`);
                    }
                }
            }

            // Calculate order totals
            const subtotal = shoppingList.estimatedTotal || 
                shoppingList.items.reduce((acc: number, item: ShoppingListItem) => 
                    acc + ((item as any).userSetPrice || (item as any).userProvidedPrice || item.estimatedPrice || 0) * item.quantity, 0);

            const calculatedFees = await calculateOrderFees(subtotal, discountAmount || 0);

            // Create new order
            const order = await OrderService.createOrder({
                customerId: req.user.id,
                shoppingListId: shoppingListId,
                totalAmount: calculatedFees.total,
                status: 'pending',
                paymentStatus: 'pending',
                serviceFee: calculatedFees.serviceFee,
                deliveryFee: calculatedFees.deliveryFee,
                deliveryAddress: deliveryAddress,
                customerNotes: customerNotes,
            });

            logger.info(`Created new order ${order.orderNumber} for shopping list ${shoppingListId}`);

            // Generate virtual account through ALATPay
            const response = await AlatPayService.generateVirtualAccount({
                amount: calculatedFees.total,
                orderId: order.id,
                description: `Payment for shopping list: ${shoppingList.name}`,
                user: req.user,
                currency: currency || 'NGN',
                orderNumber: order.orderNumber,
            });
            
            const transactionId = response.data.data?.transactionId;
            if (!transactionId) {
                logger.error('No transaction ID returned from ALATPay', { response: response.data });
                throw new BadRequestError('Failed to generate payment: No transaction ID returned');
            }

            // Update order with payment transaction ID
            await OrderService.updateOrderPaymentId(order.id, transactionId);
            
            logger.info(`Payment created for order ${order.orderNumber}`, {
                transactionId,
                orderId: order.id,
                amount: calculatedFees.total,
            });

            // Return payment details
            const responseData = response.data.data;
            res.status(200).json({
                status: 'success',
                message: 'Payment details generated successfully',
                data: {
                    transactionId,
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    orderStatus: order.status,
                    paymentStatus: order.paymentStatus,
                    amount: calculatedFees.total,
                    createdAt: responseData.createdAt || new Date().toISOString(),
                    bankName: 'Wema Bank',
                    accountName: 'Busy2Shop Limited',
                    bankCode: responseData.virtualBankCode || '035',
                    accountNumber: responseData.virtualBankAccountNumber || '8880164235',
                    fees: calculatedFees,
                    isExistingOrder: false,
                },
            });
        } catch (error) {
            logger.error('Error generating payment details:', error);
            throw error;
        }
    }

    // Removed: Complex order status endpoints - webhook handles all order updates
    // Only transaction status check endpoint remains for simple frontend polling
}
