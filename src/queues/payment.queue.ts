// src/queues/payment.queue.ts
import Bull from 'bull';
import { logger } from '../utils/logger';
import AlatPayService from '../services/payment/alatpay.service';
import { NotificationTypes } from '../models/notification.model';
import NotificationService from '../services/notification.service';
import { ITransaction } from '../models/transaction.model';

// Create a Bull queue for payment processing
export const paymentProcessingQueue = new Bull('payment-processing', {
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
    },
});

// Process completed payments
paymentProcessingQueue.process('process-completed-payment', async (job) => {
    try {
        const { transactionId, providerTransactionId } = job.data;

        // Process the payment
        await AlatPayService.processCompletedPayment(transactionId);

        // Get transaction details for notification
        const transaction = await AlatPayService.getTransactionById(transactionId);
        if (!transaction) {
            throw new Error(`Transaction not found: ${transactionId}`);
        }

        // Create notification for successful payment
        await NotificationService.addNotification({
            userId: transaction.userId,
            title: NotificationTypes.PAYMENT_SUCCESSFUL,
            message: `Your payment of ${transaction.currency} ${transaction.amount} has been processed successfully.`,
            type: NotificationTypes.PAYMENT_SUCCESSFUL,
            read: false,
            id: '',
            metadata: {
                transactionId: transaction.id,
                amount: transaction.amount,
                currency: transaction.currency,
                orderId: transaction.orderId,
                shoppingListId: transaction.shoppingListId,
            },
        });

        logger.info(`Payment processing completed for transaction ${transactionId}`);
    } catch (error) {
        logger.error('Error processing payment:', error);
        throw error;
    }
});

// Handle failed jobs
paymentProcessingQueue.on('failed', (job, error) => {
    logger.error(`Job ${job.id} failed:`, error);
});

// Handle completed jobs
paymentProcessingQueue.on('completed', (job) => {
    logger.info(`Job ${job.id} completed successfully`);
});

export default paymentProcessingQueue;