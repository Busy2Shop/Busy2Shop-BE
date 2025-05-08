// src/queues/payment.queue.ts
import { Queue, Worker } from 'bullmq';
import { connection } from './connection';
import { logger } from '../utils/logger';
import AlatPayService from '../services/payment/alatpay.service';
import NotificationService from '../services/notification.service';
import { NotificationTypes } from '../utils/interface';
import { emailService } from '../utils/Email';

// Queue names
export const PAYMENT_PROCESSING_QUEUE = 'payment-processing';
export const PAYMENT_WEBHOOK_QUEUE = 'payment-webhook';
export const PAYMENT_EXPIRY_CHECK_QUEUE = 'payment-expiry-check';

// Create queues
export const paymentProcessingQueue = new Queue(PAYMENT_PROCESSING_QUEUE, { connection });
export const paymentWebhookQueue = new Queue(PAYMENT_WEBHOOK_QUEUE, { connection });
export const paymentExpiryCheckQueue = new Queue(PAYMENT_EXPIRY_CHECK_QUEUE, { connection });

// Worker for processing payments
const paymentProcessingWorker = new Worker(
    PAYMENT_PROCESSING_QUEUE,
    async (job) => {
        const { paymentId, transactionId } = job.data;
        logger.info(`Processing payment job for transaction ${transactionId}`);

        try {
            // Check the payment status from AlatPay
            const result = await AlatPayService.checkTransactionStatus(transactionId);

            // Update our payment record based on the AlatPay status
            await AlatPayService.updatePaymentStatus({
                transactionId,
                status: result.data.status,
                response: result.data,
            });

            // If payment is completed, process the order/shopping list
            if (result.data.status === 'completed') {
                await AlatPayService.processCompletedPayment(paymentId);

                // Get the payment details to notify the customer
                const payment = await AlatPayService.getPaymentById(paymentId);

                if (payment) {
                    // Send notification
                    await NotificationService.addNotification({
                        userId: payment.userId,
                        title: NotificationTypes.PAYMENT_SUCCESSFUL,
                        heading: 'Payment Successful',
                        message: `Your payment of ${payment.currency} ${payment.amount} has been processed successfully.`,
                        resource: payment.orderId || payment.shoppingListId,
                        read: false,
                        id: '', // Empty string as placeholder, will be set by the service
                    });

                    // Queue an email notification
                    if (payment.userId) {
                        const user = await AlatPayService.getUserById(payment.userId);
                        if (user && user.email) {
                            await emailService.send({
                                email: user.email,
                                subject: 'Payment Successful',
                                from: 'support',
                                message: `Your payment of ${payment.currency} ${payment.amount} has been processed successfully.`,
                                postmarkInfo: [{
                                    postMarkTemplateData: {
                                        name: user.firstName || 'Valued Customer',
                                        amount: payment.amount,
                                        date: new Date().toLocaleDateString(),
                                    },
                                    recipientEmail: user.email,
                                }],
                            });
                        }
                    }
                }
            }

            logger.info(`Payment processing completed for transaction ${transactionId}`);
            return { success: true };
        } catch (error) {
            logger.error(`Error processing payment ${transactionId}:`, error);
            throw error;
        }
    },
    {
        connection,
        limiter: {
            max: 50,
            duration: 1000 * 60, // 1 minute
        },
    }
);

// Worker for processing webhooks
const paymentWebhookWorker = new Worker(
    PAYMENT_WEBHOOK_QUEUE,
    async (job) => {
        const { payload } = job.data;
        logger.info('Processing AlatPay webhook');

        try {
            // Process the webhook asynchronously
            await AlatPayService.processWebhook({ payload });
            logger.info('Webhook processed successfully');
            return { success: true };
        } catch (error) {
            logger.error('Error processing webhook:', error);
            throw error;
        }
    },
    { connection }
);

// Worker for checking expired payments
const paymentExpiryCheckWorker = new Worker(
    PAYMENT_EXPIRY_CHECK_QUEUE,
    async (_job) => {
        logger.info('Checking for expired payments');

        try {
            const results = await AlatPayService.checkExpiredTransactions();
            logger.info(`Processed ${results.processed} expired payments`);
            return results;
        } catch (error) {
            logger.error('Error checking expired payments:', error);
            throw error;
        }
    },
    { connection }
);

// Error handling for all workers
[paymentProcessingWorker, paymentWebhookWorker, paymentExpiryCheckWorker].forEach(worker => {
    worker.on('failed', (job, error) => {
        if (job) {
            logger.error(`${job.queueName} job ${job.id} failed:`, error);
        }
    });

    worker.on('error', (error) => {
        logger.error('Worker error:', error);
    });
});

// Initialize recurring jobs
export const initializePaymentJobs = async () => {
    try {
        // Schedule a job to check for expired payments every hour
        await paymentExpiryCheckQueue.add(
            'check-expired-payments',
            {},
            {
                repeat: {
                    pattern: '0 * * * *', // Every hour
                },
                jobId: 'scheduled-expiry-check',
            }
        );

        logger.info('Payment recurring jobs initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize payment recurring jobs:', error);
        throw error;
    }
};

export default {
    queues: {
        paymentProcessingQueue,
        paymentWebhookQueue,
        paymentExpiryCheckQueue,
    },
    workers: {
        paymentProcessingWorker,
        paymentWebhookWorker,
        paymentExpiryCheckWorker,
    },
    initializePaymentJobs,
};