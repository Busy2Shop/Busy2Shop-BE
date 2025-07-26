// src/queues/payment.queue.ts
import { Queue, Worker } from 'bullmq';
import { logger } from '../utils/logger';
import NotificationService from '../services/notification.service';
import { INotification } from '../models/notification.model';
import TransactionService from '../services/transaction.service';
import AlatPayService from '../services/payment/alatpay.service';
import { TransactionStatus } from '../models/transaction.model';
import { connection } from './connection';
import ShoppingListService from '../services/shoppingList.service';
import OrderService from '../services/order.service';
import AgentService from '../services/agent.service';

// Define job data interface
interface PaymentWebhookJobData {
    providerTransactionId: string;
    transactionId: string;
    userId: string;
}

interface PaymentExpiryCheckJobData {
    transactionId: string;
    userId: string;
}

// Create queues
export const paymentWebhookQueue = new Queue<PaymentWebhookJobData>('payment-webhook', {
    connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
    },
});

export const paymentExpiryCheckQueue = new Queue<PaymentExpiryCheckJobData>(
    'payment-expiry-check',
    { connection },
);

// Process webhook jobs
const webhookWorker = new Worker<PaymentWebhookJobData>(
    'payment-webhook',
    async job => {
        if (job.name !== 'process-webhook') {
            throw new Error(`Unknown job name: ${job.name}`);
        }

        const { providerTransactionId, transactionId } = job.data;
        logger.info(`Processing payment webhook for transaction ${transactionId}`);

        try {
            // Get transaction status from AlatPay
            const { data: transactionStatus } =
                await AlatPayService.checkTransactionStatus(providerTransactionId);

            // Map AlatPay status to our TransactionStatus enum
            const mappedStatus = AlatPayService.mapAlatPayStatusToLocal(transactionStatus.status);

            // Update transaction status
            const transaction = await TransactionService.updateTransactionStatus(transactionId, mappedStatus);

            // If payment is successful and it's for a shopping list, update the shopping list and order
            if (mappedStatus === TransactionStatus.COMPLETED && transaction.type === 'shopping_list') {
                try {
                    // Update shopping list status to 'accepted'
                    await ShoppingListService.updateListStatus(
                        transaction.referenceId,
                        transaction.userId,
                        'accepted'
                    );
                    
                    logger.info(`Shopping list ${transaction.referenceId} status updated to accepted`);
                    
                    // Find the existing order for this shopping list
                    const existingOrder = await OrderService.findOrderByShoppingListId(
                        transaction.referenceId,
                        transaction.userId
                    );

                    if (existingOrder) {
                        // Update existing order payment status
                        await existingOrder.update({
                            paymentStatus: 'completed',
                            paymentProcessedAt: new Date(),
                        });

                        logger.info(`Order ${existingOrder.id} payment status updated to completed`);

                        // Now assign an agent to the order
                        try {
                            // Get the shopping list with market information
                            const shoppingList = await ShoppingListService.getShoppingList(transaction.referenceId);
                            
                            // Find available agents for the order
                            const availableAgents = await AgentService.getAvailableAgentsForOrder(
                                shoppingList.id
                            );

                            let assignedAgent = availableAgents[0];
                            
                            // If no agents at market, find the nearest available agent
                            if (!assignedAgent && shoppingList.market?.location) {
                                const nearestAgent = await AgentService.findNearestAgent(
                                    shoppingList.market.location.latitude,
                                    shoppingList.market.location.longitude
                                );
                                if (nearestAgent) {
                                    assignedAgent = nearestAgent;
                                }
                            }

                            if (assignedAgent) {
                                // Update order with agent and change status to accepted
                                await existingOrder.update({
                                    agentId: assignedAgent.id,
                                    status: 'accepted',
                                    acceptedAt: new Date()
                                });

                                // Update agent status to busy
                                await AgentService.setAgentBusy(assignedAgent.id, existingOrder.id);

                                // Update shopping list with agent
                                await shoppingList.update({
                                    agentId: assignedAgent.id,
                                    status: 'processing'
                                });

                                logger.info(`Agent ${assignedAgent.id} assigned to order ${existingOrder.id}`);
                            } else {
                                logger.warn(`No available agents found for order ${existingOrder.id}`);
                            }
                        } catch (agentError) {
                            logger.error('Error assigning agent to order:', agentError);
                            // Don't fail the payment processing due to agent assignment issues
                        }
                    } else {
                        // This is a fallback - order should already exist from payment generation
                        logger.warn(`No existing order found for shopping list ${transaction.referenceId}, creating new order`);
                        
                        // Get delivery address from transaction metadata
                        const deliveryAddress = transaction.metadata?.deliveryAddress || {
                            latitude: 0,
                            longitude: 0,
                            address: 'Address pending customer confirmation',
                            city: 'Lagos',
                            state: 'Lagos',
                            country: 'Nigeria',
                            additionalDirections: 'Customer must provide delivery address'
                        };

                        // Ensure required fields are populated
                        const finalDeliveryAddress = {
                            latitude: deliveryAddress.latitude,
                            longitude: deliveryAddress.longitude,
                            address: deliveryAddress.address,
                            city: deliveryAddress.city || 'Lagos',
                            state: deliveryAddress.state || 'Lagos',
                            country: deliveryAddress.country || 'Nigeria',
                            additionalDirections: deliveryAddress.additionalDirections
                        };

                        const customerNotes = transaction.metadata?.customerNotes || '';

                        const order = await OrderService.createOrder({
                            customerId: transaction.userId,
                            shoppingListId: transaction.referenceId,
                            totalAmount: transaction.amount,
                            status: 'pending',
                            paymentStatus: 'completed',
                            paymentId: transaction.id,
                            paymentProcessedAt: new Date(),
                            serviceFee: transaction.metadata?.serviceFee || Math.round(transaction.amount * 0.05),
                            deliveryFee: transaction.metadata?.deliveryFee || 500,
                            deliveryAddress: finalDeliveryAddress,
                            customerNotes: customerNotes
                        });
                        
                        logger.info(`Fallback: Order ${order.id} created for shopping list ${transaction.referenceId}`);
                    }
                } catch (error) {
                    logger.error('Error processing payment completion:', error);
                    // Don't throw here to avoid retrying the entire webhook
                }
            }

            // Send notification
            const notification: INotification = {
                id: '', // Will be generated by the database
                userId: job.data.userId,
                title: 'Payment Status Update',
                message: mappedStatus === TransactionStatus.COMPLETED 
                    ? 'Your payment has been confirmed successfully!'
                    : `Your payment has been ${mappedStatus}`,
                heading: 'Payment Update',
                read: false,
                resource: transactionId,
            };
            await NotificationService.addNotification(notification);

            return { success: true };
        } catch (error) {
            logger.error('Error processing payment webhook:', error);
            throw error;
        }
    },
    { connection },
);

// Process expiry check jobs
const expiryCheckWorker = new Worker<PaymentExpiryCheckJobData>(
    'payment-expiry-check',
    async job => {
        if (job.name !== 'check-expiry') {
            throw new Error(`Unknown job name: ${job.name}`);
        }

        const { transactionId } = job.data;
        logger.info(`Checking payment expiry for transaction ${transactionId}`);

        try {
            // Update transaction status to failed
            await TransactionService.updateTransactionStatus(transactionId, TransactionStatus.FAILED);

            // Send notification
            const notification: INotification = {
                id: '', // Will be generated by the database
                userId: job.data.userId,
                title: 'Payment Expired',
                message: 'Your payment has expired. Please try again.',
                heading: 'Payment Expired',
                read: false,
                resource: transactionId,
            };
            await NotificationService.addNotification(notification);

            return { success: true };
        } catch (error) {
            logger.error('Error checking payment expiry:', error);
            throw error;
        }
    },
    { connection },
);

// Error handling
webhookWorker.on('error', (error: Error) => {
    logger.error('Payment webhook worker error:', error);
});

webhookWorker.on('failed', (job: any, error: Error) => {
    logger.error(`Job ${job?.id} failed:`, error);
});

expiryCheckWorker.on('error', (error: Error) => {
    logger.error('Payment expiry check worker error:', error);
});

expiryCheckWorker.on('failed', (job: any, error: Error) => {
    logger.error(`Job ${job?.id} failed:`, error);
});
