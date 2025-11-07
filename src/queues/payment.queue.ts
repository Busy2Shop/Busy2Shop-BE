// src/queues/payment.queue.ts
import { Queue, Worker } from 'bullmq';
import { logger } from '../utils/logger';
import { connection } from './connection';


// Define job data interface
interface PaymentWebhookJobData {
    providerTransactionId: string;
    transactionId: string;
    userId: string;
    orderId?: string;
    orderNumber?: string;
    webhookStatus?: string;
}

interface PaymentExpiryCheckJobData {
    transactionId: string;
    userId: string;
}

// Create queues
export const paymentWebhookQueue = new Queue<PaymentWebhookJobData>('payment-webhook', { connection });

export const paymentExpiryCheckQueue = new Queue<PaymentExpiryCheckJobData>('payment-expiry-check', { connection });

// Process webhook jobs
const webhookWorker = new Worker<PaymentWebhookJobData>(
    'payment-webhook',
    async job => {
        if (job.name !== 'process-webhook') {
            throw new Error(`Unknown job name: ${job.name}`);
        }

        const { providerTransactionId, transactionId: _transactionId, userId: _userId, orderId, orderNumber, webhookStatus } = job.data;
        logger.info(`Processing payment webhook for transaction ${providerTransactionId}`, {
            orderId,
            orderNumber,
            webhookStatus,
        });

        try {
            // Import services here to avoid circular dependencies
            const AlatPayService = (await import('../services/payment/alatpay.service')).default;
            const OrderService = (await import('../services/order.service')).default;
            const ShoppingListService = (await import('../services/shoppingList.service')).default;
            const AgentService = (await import('../services/agent.service')).default;

            // Check if webhook status indicates completion
            const isWebhookCompleted = webhookStatus === 'completed' || webhookStatus === 'COMPLETED';

            // Get the latest transaction status from AlatPay for verification
            const transactionStatus = await AlatPayService.checkTransactionStatus(providerTransactionId);
            const isAlatPayCompleted = transactionStatus?.status === 'COMPLETED' || transactionStatus?.status === 'completed';

            // Process if either webhook status or AlatPay status indicates completion
            if (isWebhookCompleted || isAlatPayCompleted) {
                logger.info(`Payment completed for transaction ${providerTransactionId}`, {
                    webhookCompleted: isWebhookCompleted,
                    alatPayCompleted: isAlatPayCompleted,
                });

                // Find order by transaction ID using OrderService (properly handles model initialization)
                let order = await OrderService.getOrderByPaymentId(providerTransactionId);

                // Fallback: if no order found by paymentId, try by orderId from metadata
                if (!order && orderId) {
                    try {
                        order = await OrderService.getOrder(orderId);
                    } catch (error) {
                        logger.info(`Failed to find order by ID ${orderId}:`, error);
                    }
                }

                // Additional fallback: try by orderNumber from metadata
                if (!order && orderNumber) {
                    try {
                        order = await OrderService.getOrderByNumber(orderNumber);
                    } catch (error) {
                        logger.info(`Failed to find order by number ${orderNumber}:`, error);
                    }
                }

                if (order) {
                    // Use database transaction to ensure atomic operations
                    const Database = (await import('../models/index')).Database;

                    await Database.transaction(async (transaction) => {
                        logger.info(`Starting payment completion processing for order ${order!.orderNumber}`, {
                            orderId: order!.id,
                            currentPaymentStatus: order!.paymentStatus,
                            currentOrderStatus: order!.status,
                            shoppingListId: order!.shoppingListId,
                            customerId: order!.customerId,
                        });

                        // 1. Update order payment status and record payment processed time
                        logger.info(`Updating order ${order!.orderNumber} payment status to completed`);
                        await OrderService.updateOrderPaymentStatus(order!.id, 'completed', transaction);

                        // 2. Update shopping list status to accepted (payment confirmed)
                        if (order!.shoppingListId) {
                            logger.info(`Updating shopping list ${order!.shoppingListId} status to accepted`);
                            await ShoppingListService.updateListStatus(
                                order!.shoppingListId,
                                order!.customerId,
                                'accepted',
                                transaction
                            );

                            // 3. Sync shopping list items with order if needed (ensure alignment)
                            try {
                                logger.info(`Syncing shopping list ${order!.shoppingListId} with order totals`);
                                const shoppingList = await ShoppingListService.getShoppingList(order!.shoppingListId);

                                if (shoppingList) {
                                    // Update estimated total and payment status using service method
                                    const updateData = {
                                        estimatedTotal: order!.totalAmount - order!.serviceFee - order!.deliveryFee,
                                        paymentStatus: 'completed' as const,
                                        paymentProcessedAt: new Date(),
                                    };

                                    logger.info('Applying shopping list updates:', updateData);

                                    await ShoppingListService.updateShoppingList(
                                        order!.shoppingListId,
                                        order!.customerId,
                                        updateData,
                                        transaction
                                    );

                                    logger.info(`Shopping list ${order!.shoppingListId} synced with order totals`);
                                } else {
                                    logger.error(`Shopping list ${order!.shoppingListId} not found for sync`);
                                }
                            } catch (shoppingListError) {
                                logger.error(`Failed to sync shopping list ${order!.shoppingListId}:`, shoppingListError);
                                // Continue processing even if shopping list sync fails
                            }
                        }

                        // 4. Auto-assign agent to the completed order
                        let assignedAgentId = null;
                        try {
                            if (order!.shoppingListId) {
                                const availableAgents = await AgentService.getAvailableAgentsForOrder(order!.shoppingListId);
                                if (availableAgents.length > 0) {
                                    // Use the first available agent (could be enhanced with better logic)
                                    const selectedAgent = availableAgents[0];
                                    await AgentService.assignOrderToAgent(order!.id, selectedAgent.id);
                                    assignedAgentId = selectedAgent.id;
                                    logger.info(`Agent ${selectedAgent.id} automatically assigned to order ${order!.orderNumber}`);

                                    // 5. Update order status to in_progress now that agent is assigned
                                    await OrderService.updateOrderStatus(order!.id, order!.customerId, 'in_progress', transaction);
                                    logger.info(`Order ${order!.orderNumber} status updated to in_progress after agent assignment`);
                                } else {
                                    logger.warn(`No available agent found for order ${order!.orderNumber}`);
                                }
                            }
                        } catch (agentError) {
                            logger.error(`Failed to auto-assign agent for order ${order!.orderNumber}:`, agentError);
                            // Continue processing even if agent assignment fails
                        }

                        // 6. Create comprehensive order trail entry
                        const OrderTrailService = (await import('../services/orderTrail.service')).default;
                        await OrderTrailService.logOrderEvent(order!.id, {
                            action: 'payment_confirmed',
                            description: 'Payment confirmed via webhook - Order ready for shopping',
                            performedBy: 'system',
                            metadata: {
                                transactionId: providerTransactionId,
                                webhookStatus: webhookStatus,
                                alatPayStatus: transactionStatus?.status,
                                paymentAmount: order!.totalAmount,
                                assignedAgentId: assignedAgentId,
                                shoppingListId: order!.shoppingListId,
                                processedAt: new Date().toISOString(),
                            },
                        });

                        logger.info(`Order ${order!.orderNumber} webhook processing completed successfully`, {
                            orderId: order!.id,
                            shoppingListId: order!.shoppingListId,
                            assignedAgentId: assignedAgentId,
                            paymentAmount: order!.totalAmount,
                        });
                    });

                    // Verify updates outside transaction
                    try {
                        const finalOrder = await OrderService.getOrder(order!.id, false, false);
                        const finalShoppingList = await ShoppingListService.getShoppingList(order!.shoppingListId);

                        logger.info(`Final status verification for order ${order!.orderNumber}:`, {
                            orderPaymentStatus: finalOrder.paymentStatus,
                            orderStatus: finalOrder.status,
                            shoppingListStatus: finalShoppingList.status,
                            shoppingListPaymentStatus: finalShoppingList.paymentStatus,
                        });

                        if (finalOrder.paymentStatus !== 'completed') {
                            logger.error(`CRITICAL: Order ${order!.orderNumber} payment status not updated correctly!`, {
                                expected: 'completed',
                                actual: finalOrder.paymentStatus,
                            });
                        }

                        if (finalShoppingList.status !== 'accepted') {
                            logger.error(`CRITICAL: Shopping list ${order.shoppingListId} status not updated correctly!`, {
                                expected: 'accepted',
                                actual: finalShoppingList.status,
                            });
                        }
                    } catch (verificationError) {
                        logger.error('Failed to verify order status after webhook processing:', verificationError);
                    }
                } else {
                    logger.warn(`No order found for transaction ${providerTransactionId}`, {
                        searchedOrderId: orderId,
                        searchedOrderNumber: orderNumber,
                    });
                }
            } else {
                logger.info(`Payment not yet completed for transaction ${providerTransactionId}`, {
                    webhookStatus,
                    alatPayStatus: transactionStatus?.status,
                });
            }
        } catch (error) {
            logger.error(`Error processing webhook for transaction ${providerTransactionId}:`, error);
            throw error;
        }
    },
    {
        connection,
        // Add better job configuration for webhook worker too
        concurrency: 10, // Process up to 10 webhooks concurrently
        // Remove jobs after completion to prevent memory buildup
        removeOnComplete: { count: 50 }, // Keep more webhook completions for audit
        removeOnFail: { count: 100 }, // Keep more webhook failures for debugging
    },
);

// Process expiry check jobs with improved error handling
const expiryCheckWorker = new Worker<PaymentExpiryCheckJobData>(
    'payment-expiry-check',
    async job => {
        if (job.name !== 'check-expiry') {
            logger.error(`Unknown job name: ${job.name}, expected 'check-expiry'`);
            return; // Don't throw, just return to complete the job
        }

        const { transactionId, userId } = job.data;
        logger.info(`Starting payment expiry check for transaction ${transactionId}`, {
            jobId: job.id,
            userId,
            transactionId,
        });

        try {
            // Import services here to avoid circular dependencies
            const AlatPayService = (await import('../services/payment/alatpay.service')).default;
            const OrderService = (await import('../services/order.service')).default;
            const SystemSettingsService = (await import('../services/systemSettings.service')).default;
            const OrderTrailService = (await import('../services/orderTrail.service')).default;

            // Find order by transaction ID using OrderService (properly handles model initialization)
            const order = await OrderService.getOrderByPaymentId(transactionId);

            if (!order) {
                logger.warn(`No order found for transaction ${transactionId}`, {
                    jobId: job.id,
                    transactionId,
                });
                return; // Complete the job successfully since there's nothing to process
            }

            logger.info(`Found order ${order.orderNumber} for transaction ${transactionId}`, {
                jobId: job.id,
                orderId: order.id,
                orderNumber: order.orderNumber,
                currentStatus: order.status,
                paymentStatus: order.paymentStatus,
            });

            // If order is no longer pending payment, job is no longer needed
            if (order.paymentStatus !== 'pending') {
                logger.info(`Order ${order.orderNumber} payment status is ${order.paymentStatus}, expiry check not needed`, {
                    jobId: job.id,
                    orderId: order.id,
                });

                // Job completed successfully - no further action needed
                logger.info(`Payment expiry check job ${job.id} completed - order already processed`);
                return; // Complete the job successfully
            }

            // Check how long ago the order was created
            const paymentTimeoutMinutes = await SystemSettingsService.getPaymentTimeout();
            const paymentTimeoutMs = paymentTimeoutMinutes * 60 * 1000;
            const orderCreatedTime = new Date(order.createdAt).getTime();
            const currentTime = new Date().getTime();
            const timeSinceCreation = currentTime - orderCreatedTime;

            // If order hasn't actually expired yet based on creation time, skip API call
            if (timeSinceCreation < paymentTimeoutMs) {
                logger.info(`Order ${order.orderNumber} hasn't expired yet (${Math.round(timeSinceCreation / (1000 * 60))}/${paymentTimeoutMinutes} minutes)`, {
                    jobId: job.id,
                    orderId: order.id,
                    timeRemainingMs: paymentTimeoutMs - timeSinceCreation,
                });

                // Schedule a new check for when it actually expires
                const remainingTime = paymentTimeoutMs - timeSinceCreation;
                await paymentExpiryCheckQueue.add('check-expiry', {
                    transactionId,
                    userId,
                }, {
                    delay: remainingTime,
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 5000,
                    },
                });

                logger.info(`Rescheduled expiry check for order ${order.orderNumber} in ${Math.round(remainingTime / (1000 * 60))} minutes`);
                return; // Complete the current job
            }

            // Order has expired based on time, now check with payment provider
            let transactionStatus = null;
            let apiCallFailed = false;

            try {
                logger.info(`Checking payment provider status for transaction ${transactionId}`, {
                    jobId: job.id,
                    orderId: order.id,
                });
                transactionStatus = await AlatPayService.checkTransactionStatus(transactionId);
                logger.info(`Payment provider response for transaction ${transactionId}:`, {
                    jobId: job.id,
                    status: transactionStatus?.status,
                    orderNumber: transactionStatus?.orderNumber,
                });
            } catch (apiError: any) {
                apiCallFailed = true;
                logger.warn(`Payment provider API call failed for transaction ${transactionId}:`, {
                    jobId: job.id,
                    error: apiError.message,
                    statusCode: apiError.statusCode,
                    orderId: order.id,
                    fallbackAction: 'will expire order locally',
                });

                // For 404 or other API errors, we'll handle it as expired locally
                // This is better than crashing the queue
            }

            // Process based on API response or fallback to local expiry
            if (!apiCallFailed && transactionStatus) {
                if (transactionStatus.status === 'COMPLETED' || transactionStatus.status === 'completed') {
                    // Payment was completed, update order
                    logger.info(`Late payment confirmation detected for order ${order.orderNumber}`, {
                        jobId: job.id,
                        orderId: order.id,
                    });

                    await OrderService.updateOrderPaymentStatus(order.id, 'completed');

                    await OrderTrailService.logOrderEvent(order.id, {
                        action: 'payment_confirmed_late',
                        description: 'Payment confirmed after expiry check',
                        performedBy: 'system',
                        metadata: {
                            transactionId: transactionId,
                            detectedVia: 'expiry_check',
                        },
                    });

                    logger.info(`Order ${order.orderNumber} payment confirmed successfully`, {
                        jobId: job.id,
                        orderId: order.id,
                    });
                } else if (transactionStatus.status === 'EXPIRED' || transactionStatus.status === 'expired' || transactionStatus.status === 'FAILED') {
                    // Payment confirmed as expired/failed by provider
                    logger.info(`Payment provider confirmed expiry/failure for order ${order.orderNumber}`, {
                        jobId: job.id,
                        orderId: order.id,
                        providerStatus: transactionStatus.status,
                    });

                    await OrderService.updateOrderPaymentStatus(order.id, 'expired');

                    await OrderTrailService.logOrderEvent(order.id, {
                        action: 'payment_expired',
                        description: `Payment expired - confirmed by provider after ${paymentTimeoutMinutes} minutes`,
                        performedBy: 'system',
                        metadata: {
                            transactionId: transactionId,
                            timeoutMinutes: paymentTimeoutMinutes,
                            providerStatus: transactionStatus.status,
                            detectedVia: 'expiry_check',
                        },
                    });

                    logger.info(`Order ${order.orderNumber} marked as expired (provider confirmed)`, {
                        jobId: job.id,
                        orderId: order.id,
                    });
                } else {
                    // Still pending according to provider, but locally expired - expire it
                    logger.info(`Payment still pending with provider but locally expired for order ${order.orderNumber}`, {
                        jobId: job.id,
                        orderId: order.id,
                        providerStatus: transactionStatus.status,
                        action: 'expiring_locally',
                    });

                    await OrderService.updateOrderPaymentStatus(order.id, 'expired');

                    await OrderTrailService.logOrderEvent(order.id, {
                        action: 'payment_expired',
                        description: `Payment expired - local timeout after ${paymentTimeoutMinutes} minutes`,
                        performedBy: 'system',
                        metadata: {
                            transactionId: transactionId,
                            timeoutMinutes: paymentTimeoutMinutes,
                            providerStatus: transactionStatus.status,
                            reason: 'local_timeout',
                            detectedVia: 'expiry_check',
                        },
                    });

                    logger.info(`Order ${order.orderNumber} marked as expired (local timeout)`, {
                        jobId: job.id,
                        orderId: order.id,
                    });
                }
            } else {
                // API failed, expire order locally based on time
                logger.info(`Expiring order ${order.orderNumber} locally due to API unavailability`, {
                    jobId: job.id,
                    orderId: order.id,
                    timeElapsedMinutes: Math.round(timeSinceCreation / (1000 * 60)),
                });

                await OrderService.updateOrderPaymentStatus(order.id, 'expired');

                await OrderTrailService.logOrderEvent(order.id, {
                    action: 'payment_expired',
                    description: `Payment expired - API unavailable, expired based on local timeout after ${paymentTimeoutMinutes} minutes`,
                    performedBy: 'system',
                    metadata: {
                        transactionId: transactionId,
                        timeoutMinutes: paymentTimeoutMinutes,
                        reason: 'api_unavailable_local_timeout',
                        detectedVia: 'expiry_check',
                        timeElapsedMinutes: Math.round(timeSinceCreation / (1000 * 60)),
                    },
                });

                logger.info(`Order ${order.orderNumber} marked as expired (API unavailable fallback)`, {
                    jobId: job.id,
                    orderId: order.id,
                });
            }

            logger.info(`Payment expiry check completed for transaction ${transactionId}`, {
                jobId: job.id,
                orderId: order.id,
                finalStatus: 'completed',
            });

        } catch (error: any) {
            logger.error(`Critical error in payment expiry check for transaction ${transactionId}:`, {
                jobId: job.id,
                error: error.message,
                stack: error.stack,
                transactionId,
                userId,
            });

            // For job queue errors, we need to handle them properly
            if (error.message && error.message.includes('Missing key for job')) {
                logger.warn(`BullMQ job state error for job ${job.id} - job likely already processed`);
                return; // Complete successfully to avoid retry loop
            }

            // Don't throw the error - this prevents job from going to failed queue
            // Instead, log the error and complete the job so it doesn't get retried indefinitely
            return;
        }
    },
    {
        connection,
        // Add better job configuration
        concurrency: 5, // Process up to 5 expiry checks concurrently
        // Remove jobs after completion to prevent memory buildup
        removeOnComplete: { count: 10 }, // Keep last 10 completed jobs for debugging
        removeOnFail: { count: 20 }, // Keep last 20 failed jobs for debugging
    },
);

// Enhanced error handling for webhook worker
webhookWorker.on('error', (error: Error) => {
    logger.error('Payment webhook worker system error:', {
        error: error.message,
        stack: error.stack,
        workerType: 'webhook',
    });
});

webhookWorker.on('failed', (job: any, error: Error) => {
    logger.error('Payment webhook job failed:', {
        jobId: job?.id,
        jobName: job?.name,
        jobData: job?.data,
        error: error.message,
        stack: error.stack,
        attemptsMade: job?.attemptsMade,
        workerType: 'webhook',
    });
});

webhookWorker.on('completed', (job: any) => {
    logger.info('Payment webhook job completed:', {
        jobId: job.id,
        jobName: job.name,
        duration: Date.now() - job.timestamp,
        workerType: 'webhook',
    });
});

// Enhanced error handling for expiry check worker  
expiryCheckWorker.on('error', (error: Error) => {
    logger.error('Payment expiry check worker system error:', {
        error: error.message,
        stack: error.stack,
        workerType: 'expiry-check',
    });
});

expiryCheckWorker.on('failed', (job: any, error: Error) => {
    logger.error('Payment expiry check job failed:', {
        jobId: job?.id,
        jobName: job?.name,
        jobData: job?.data,
        error: error.message,
        stack: error.stack,
        attemptsMade: job?.attemptsMade,
        workerType: 'expiry-check',
    });
});

expiryCheckWorker.on('completed', (job: any) => {
    logger.info('Payment expiry check job completed:', {
        jobId: job.id,
        jobName: job.name,
        duration: Date.now() - job.timestamp,
        workerType: 'expiry-check',
    });
});

expiryCheckWorker.on('stalled', (jobId: string) => {
    logger.warn('Payment expiry check job stalled:', {
        jobId,
        workerType: 'expiry-check',
        action: 'will be retried',
    });
});

webhookWorker.on('stalled', (jobId: string) => {
    logger.warn('Payment webhook job stalled:', {
        jobId,
        workerType: 'webhook',
        action: 'will be retried',
    });
});

// Add cleanup on process termination
process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, closing payment queue workers...');
    await Promise.all([
        webhookWorker.close(),
        expiryCheckWorker.close(),
    ]);
    logger.info('Payment queue workers closed');
});

process.on('SIGINT', async () => {
    logger.info('Received SIGINT, closing payment queue workers...');
    await Promise.all([
        webhookWorker.close(),
        expiryCheckWorker.close(),
    ]);
    logger.info('Payment queue workers closed');
});
