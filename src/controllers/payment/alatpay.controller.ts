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
import PaymentStatusSyncService from '../../services/paymentStatusSync.service';
import OrderTrailService from '../../services/orderTrail.service';
import { redisClient } from '../../utils/redis';

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
                } catch (verificationError: any) {
                    logger.warn(`Failed to verify payment with ALATPay for transaction ${transactionId}:`, verificationError);
                    
                    // Check if this is a timeout scenario (30+ minutes and 404 with confirmation message)
                    const isTimeoutError = verificationError?.statusCode === 400 && 
                        verificationError?.message && 
                        verificationError.message.includes('confirming your transaction') &&
                        verificationError.message.includes('30 minutes');
                    
                    if (isTimeoutError) {
                        // Check if order was created more than 30 minutes ago
                        const orderCreatedAt = new Date(order.createdAt);
                        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes in milliseconds
                        const minutesSinceCreation = Math.floor((Date.now() - orderCreatedAt.getTime()) / (60 * 1000));
                        
                        logger.info(`Timeout check for transaction ${transactionId}: created ${minutesSinceCreation} minutes ago (threshold: 30 minutes)`);
                        
                        if (orderCreatedAt < thirtyMinutesAgo) {
                            logger.warn(`Transaction ${transactionId} has exceeded 30 minutes timeout (${minutesSinceCreation} minutes old), marking as failed`);
                            
                            try {
                                // Update order payment status to failed
                                await OrderService.updateOrderPaymentStatus(order.id, 'failed');
                                
                                // Update actual status for response
                                actualPaymentStatus = 'failed';
                                
                                logger.info(`Successfully marked transaction ${transactionId} as failed due to timeout after ${minutesSinceCreation} minutes`);
                            } catch (updateError) {
                                logger.error(`Failed to update payment status to failed for transaction ${transactionId}:`, updateError);
                            }
                        } else {
                            logger.info(`Transaction ${transactionId} is still within 30-minute window (${minutesSinceCreation} minutes old), keeping as pending`);
                        }
                    }
                    
                    // Continue with local status if verification fails
                }
            }

            // Perform automatic sync if status mismatch detected
            if (shouldSync && alatPayStatus) {
                const syncLockKey = `payment_sync_lock:${transactionId}`;

                try {
                    // Check if sync is already in progress using Redis lock
                    const lockExists = await redisClient.get(syncLockKey);

                    if (lockExists) {
                        logger.info(`Sync already in progress for transaction ${transactionId}, skipping duplicate sync`);

                        // Return a response indicating sync is in progress
                        res.status(200).json({
                            status: 'success',
                            message: 'Payment sync in progress',
                            data: {
                                status: 'pending',
                                orderNumber: order.orderNumber,
                                orderId: order.id,
                                orderStatus: order.status,
                                amount: order.totalAmount,
                                createdAt: order.createdAt,
                                paymentProcessedAt: order.paymentProcessedAt,
                                agentId: order.agentId,
                                shoppingListId: order.shoppingListId,
                                syncInProgress: true,
                                alatPayStatus: alatPayStatus?.status,
                                agent: null,
                            },
                        });
                        return;
                    }

                    // Set sync lock with 60 second expiration
                    await redisClient.setex(syncLockKey, 60, 'locked');

                    logger.info(`Auto-syncing payment status for transaction ${transactionId}`);

                    // Prevent duplicate syncing by checking if order was already updated
                    const recentOrder = await OrderService.getOrder(order.id, false, false);
                    if (recentOrder.paymentStatus === 'completed') {
                        logger.info(`Order ${order.id} already completed, skipping auto-sync`);
                        actualPaymentStatus = 'completed';

                        // Release lock
                        await redisClient.del(syncLockKey);

                        res.status(200).json({
                            status: 'success',
                            message: 'Payment status retrieved (already completed)',
                            data: {
                                status: recentOrder.paymentStatus,
                                orderNumber: recentOrder.orderNumber,
                                orderId: recentOrder.id,
                                orderStatus: recentOrder.status,
                                amount: recentOrder.totalAmount,
                                createdAt: recentOrder.createdAt,
                                paymentProcessedAt: recentOrder.paymentProcessedAt,
                                agentId: recentOrder.agentId,
                                shoppingListId: recentOrder.shoppingListId,
                                autoSynced: false,
                                alatPayStatus: alatPayStatus?.status,
                                agent: recentOrder.agent ? {
                                    id: recentOrder.agent.id,
                                    firstName: recentOrder.agent.firstName,
                                    lastName: recentOrder.agent.lastName,
                                    phone: recentOrder.agent.phone,
                                    displayImage: recentOrder.agent.displayImage,
                                } : null,
                            },
                        });
                        return;
                    }

                    // Add timeout to prevent hanging
                    const syncTimeout = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Payment sync timeout after 30 seconds')), 30000)
                    );

                    const syncOperation = PaymentStatusSyncService.confirmPayment(
                        order.id,
                        transactionId,
                        'api_sync',
                        'system' // Auto-sync initiated by status check
                    );

                    const result = await Promise.race([syncOperation, syncTimeout]) as any;

                    // Release lock after sync completion
                    await redisClient.del(syncLockKey);

                    if (result.success) {
                        actualPaymentStatus = 'completed';
                        logger.info(`Auto-sync successful for transaction ${transactionId}`, {
                            assignedAgentId: result.assignedAgentId,
                        });

                        // Get the updated order with agent details
                        const updatedOrder = await OrderService.getOrder(order.id, true, false);

                        res.status(200).json({
                            status: 'success',
                            message: 'Payment status retrieved and synced',
                            data: {
                                status: 'completed',
                                orderNumber: order.orderNumber,
                                orderId: order.id,
                                orderStatus: updatedOrder.status,
                                amount: order.totalAmount,
                                createdAt: order.createdAt,
                                paymentProcessedAt: new Date(),
                                agentId: result.assignedAgentId,
                                shoppingListId: order.shoppingListId,
                                autoSynced: true,
                                alatPayStatus: alatPayStatus?.status,
                                agent: updatedOrder.agent ? {
                                    id: updatedOrder.agent.id,
                                    firstName: updatedOrder.agent.firstName,
                                    lastName: updatedOrder.agent.lastName,
                                    phone: updatedOrder.agent.phone,
                                    displayImage: updatedOrder.agent.displayImage,
                                } : null,
                            },
                        });
                        return;
                    } else {
                        logger.error(`Auto-sync failed for transaction ${transactionId}:`, result.error);
                    }
                } catch (syncError: any) {
                    logger.error(`Failed to auto-sync payment for transaction ${transactionId}:`, syncError);

                    // Always release lock on error
                    try {
                        await redisClient.del(syncLockKey);
                    } catch (lockReleaseError) {
                        logger.error(`Failed to release sync lock for transaction ${transactionId}:`, lockReleaseError);
                    }

                    // If it's a timeout error, return immediately
                    if (syncError.message && syncError.message.includes('timeout')) {
                        res.status(200).json({
                            status: 'success',
                            message: 'Payment sync timed out, will retry automatically',
                            data: {
                                status: 'pending',
                                orderNumber: order.orderNumber,
                                orderId: order.id,
                                orderStatus: order.status,
                                amount: order.totalAmount,
                                createdAt: order.createdAt,
                                paymentProcessedAt: order.paymentProcessedAt,
                                agentId: order.agentId,
                                shoppingListId: order.shoppingListId,
                                syncTimeout: true,
                                alatPayStatus: alatPayStatus?.status,
                                agent: null,
                            },
                        });
                        return;
                    }

                    // Continue with original status for other errors
                }
            }

            // Get order with agent info if needed (with timeout)
            let orderWithAgent: any = order;
            try {
                const orderTimeout = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Order fetch timeout')), 5000)
                );
                const orderOperation = OrderService.getOrder(order.id, true, false);
                orderWithAgent = await Promise.race([orderOperation, orderTimeout]);
            } catch (fetchError) {
                logger.warn(`Failed to fetch order details for ${order.id}:`, fetchError);
                // Continue with basic order data
            }

            // Determine appropriate message based on payment status
            let responseMessage = 'Payment status retrieved';
            if (actualPaymentStatus === 'failed') {
                responseMessage = 'Payment has failed - transaction exceeded timeout period';
            }

            // Return current order status (with potential ALATPay verification info)
            res.status(200).json({
                status: 'success',
                message: responseMessage,
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
                    timeoutExpired: actualPaymentStatus === 'failed',
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
            const alatpayLogoUrl = 'https://res.cloudinary.com/drc6omjqc/image/upload/v1758889965/Base/wema_logo_bffoct.png';
            
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
                            alatpayLogoUrl,
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
                                        alatpayLogoUrl,
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
                                alatpayLogoUrl,
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
                    alatpayLogoUrl,
                },
            });
        } catch (error) {
            logger.error('Error generating payment details:', error);
            throw error;
        }
    }

    /**
     * Test endpoint for confirming payment - NO AUTH REQUIRED (for testing only)
     */
    static async testConfirmPayment(req: Request, res: Response) {
            const { orderId, transactionId, source, performedBy } = req.body;

            // Validate required fields
            if (!orderId) {
                return res.status(400).json({
                    status: 'error',
                    message: 'orderId is required',
                });
            }

            if (!transactionId) {
                return res.status(400).json({
                    status: 'error',
                    message: 'transactionId is required',
                });
            }

            // Set defaults for optional fields
            const confirmationSource = source || 'api_sync';
            const performedByUser = performedBy || 'test-user';

            logger.info('TEST: Confirming payment manually', {
                orderId,
                transactionId,
                source: confirmationSource,
                performedBy: performedByUser,
            });

            // Import and call the payment confirmation service
            const result = await PaymentStatusSyncService.confirmPayment(
                orderId,
                transactionId,
                confirmationSource,
                performedByUser
            );

            logger.info('TEST: Payment confirmation successful', {
                orderId,
                transactionId,
                result,
            });

            res.status(200).json({
                status: 'success',
                message: 'Payment confirmed successfully',
                data: {
                    orderId,
                    transactionId,
                    assignedAgentId: result.assignedAgentId,
                    source: confirmationSource,
                    performedBy: performedByUser,
                    fullDetails: result,
                },
            });


    }

    /**
     * Cancel a pending payment
     */
    static async cancelPayment(req: AuthenticatedRequest, res: Response) {
        const { transactionId } = req.params;

        if (!transactionId) {
            throw new BadRequestError('Transaction ID is required');
        }

        try {
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

            // Verify user authorization
            if (order.customerId !== req.user.id) {
                throw new BadRequestError('Not authorized to cancel this payment');
            }

            // Check if payment is already failed or order already cancelled
            if (order.paymentStatus === 'failed' || order.status === 'cancelled') {
                // Return success if already cancelled/failed instead of throwing error
                res.status(200).json({
                    status: 'success',
                    message: 'Payment already cancelled',
                    data: {
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        transactionId,
                        status: 'cancelled',
                    },
                });
                return;
            }

            // Only allow canceling pending payments
            if (order.paymentStatus !== 'pending') {
                throw new BadRequestError(`Cannot cancel payment with status: ${order.paymentStatus}`);
            }

            // Update order payment status to failed (cancelled by user)
            await OrderService.updateOrderPaymentStatus(order.id, 'failed');

            // Try to update order status to cancelled, handle gracefully if already cancelled
            try {
                await OrderService.updateOrderStatus(order.id, req.user.id, 'cancelled');
            } catch (statusError: any) {
                // If the error is about status transition, it's likely already cancelled - that's fine
                if (statusError.message && statusError.message.includes('Cannot change status from cancelled to cancelled')) {
                    // Order already cancelled by another process, continue normally
                } else {
                    // Re-throw if it's a different error
                    throw statusError;
                }
            }

            // Log the cancellation
            await OrderTrailService.logOrderEvent(order.id, {
                action: 'payment_cancelled',
                description: 'Payment cancelled by customer',
                performedBy: req.user.id,
                metadata: {
                    transactionId,
                    cancelledAt: new Date().toISOString(),
                },
            });

            logger.info(`Payment cancelled for order ${order.orderNumber}`, {
                orderId: order.id,
                transactionId,
                userId: req.user.id,
            });

            res.status(200).json({
                status: 'success',
                message: 'Payment cancelled successfully',
                data: {
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    transactionId,
                    status: 'cancelled',
                },
            });

        } catch (error) {
            logger.error('Error cancelling payment:', error);
            throw error;
        }
    }

    // Removed: Complex order status endpoints - webhook handles all order updates
    // Only transaction status check endpoint remains for simple frontend polling
}
