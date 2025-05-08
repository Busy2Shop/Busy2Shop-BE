// src/queues/index.ts
import { Express } from 'express';
import { bullBoard } from './bullboard';
import { logger } from '../utils/logger';
import {
    paymentWebhookQueue,
    paymentExpiryCheckQueue,
} from './payment.queue';

// Export all queues for use throughout the application
export const queues = {
    payment: {
        paymentWebhookQueue,
        paymentExpiryCheckQueue,
    },
};

// Initialize all recurring jobs
export const initializeRecurringJobs = async (app: Express) => {
    try {
        // Initialize Bull Board with all queues
        bullBoard.initialize({
            // Payment queues
            paymentWebhookQueue,
            paymentExpiryCheckQueue,

            // Add other queues here as needed
        });

        // Mount Bull Board routes
        bullBoard.mount(app);

        logger.info('✅ All recurring jobs and Bull Board initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize recurring jobs and Bull Board:', error);
        throw error;
    }
};

// Graceful shutdown function for queues
export const gracefulShutdown = async () => {
    try {
        logger.info('Closing queue connections...');

        // Close all queue connections
        const closePromises = [
            // Payment queues
            paymentWebhookQueue.close(),
            paymentExpiryCheckQueue.close(),

            // Add other queues here
        ];

        await Promise.all(closePromises);
        logger.info('All queue connections closed successfully');
    } catch (error) {
        logger.error('Error closing queue connections:', error);
        throw error;
    }
};

export { paymentWebhookQueue, paymentExpiryCheckQueue };

export default {
    queues,
    initializeRecurringJobs,
    gracefulShutdown,
};
