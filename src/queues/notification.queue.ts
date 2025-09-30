// src/queues/notification.queue.ts
import { Queue, Worker } from 'bullmq';
import { logger } from '../utils/logger';
import { connection } from './connection';
import { INotification } from '../models/notification.model';

// Define job data interfaces
interface EmailNotificationJobData {
    id: string;
    notification: INotification;
    scheduledAt: Date;
    userLastSeen: Date;
    emailDelayMinutes: number;
    attempts: number;
    maxAttempts: number;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    metadata?: Record<string, any>;
}

interface PushNotificationJobData {
    notification: INotification;
    priority: 'low' | 'normal' | 'high' | 'urgent';
    retryCount?: number;
    metadata?: Record<string, any>;
}

interface BulkNotificationJobData {
    notifications: INotification[];
    priority: 'low' | 'normal' | 'high' | 'urgent';
    batchSize?: number;
    metadata?: Record<string, any>;
}

// Create notification queues
export const emailNotificationQueue = new Queue<EmailNotificationJobData>('email-notifications', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 30000, // Start with 30 seconds
        },
        removeOnComplete: { count: 50 }, // Keep last 50 completed jobs for audit
        removeOnFail: { count: 100 }, // Keep last 100 failed jobs for debugging
    },
});

export const pushNotificationQueue = new Queue<PushNotificationJobData>('push-notifications', {
    connection,
    defaultJobOptions: {
        attempts: 3, // Reduced attempts to prevent excessive retries
        backoff: {
            type: 'exponential',
            delay: 2000, // Reduced delay for faster recovery
        },
        removeOnComplete: { count: 20 }, // Reduced to prevent Redis bloat
        removeOnFail: { count: 30 }, // Reduced to prevent Redis bloat
    },
});

export const bulkNotificationQueue = new Queue<BulkNotificationJobData>('bulk-notifications', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 60000, // Start with 1 minute for bulk operations
        },
        removeOnComplete: { count: 10 }, // Keep last 10 completed bulk jobs
        removeOnFail: { count: 20 }, // Keep last 20 failed bulk jobs
    },
});

// Process email notification jobs
const emailNotificationWorker = new Worker<EmailNotificationJobData>(
    'email-notifications',
    async job => {
        if (job.name !== 'send-email') {
            throw new Error(`Unknown job name: ${job.name}`);
        }

        const { id, notification, priority, attempts, maxAttempts } = job.data;

        logger.info(`Processing email notification job ${id}`, {
            jobId: job.id,
            userId: notification.userId,
            type: notification.title,
            priority,
            attempt: attempts + 1,
            maxAttempts,
        });

        try {
            // Import services here to avoid circular dependencies
            const UserPresenceService = (await import('../services/user-presence.service')).default;
            const { emailService } = await import('../utils/Email');
            const User = (await import('../models/user.model')).default;
            const Order = (await import('../models/order.model')).default;

            // Check if user is still offline (smart email sending)
            const isUserOnline = await UserPresenceService.isUserOnline(notification.userId);
            const timeSinceLastSeen = await UserPresenceService.getTimeSinceLastSeen(notification.userId);

            logger.info(`Email notification context check`, {
                jobId: job.id,
                userId: notification.userId,
                isUserOnline,
                timeSinceLastSeen,
                priority,
            });

            // Skip email for chat notifications if user came back online (unless urgent)
            const chatNotificationTypes = [
                'CHAT_MESSAGE_RECEIVED',
                'CHAT_ACTIVATED',
                'USER_LEFT_CHAT',
            ];

            if (priority !== 'urgent' &&
                chatNotificationTypes.includes(notification.title) &&
                isUserOnline) {
                logger.info(`Skipping email notification - user came back online`, {
                    jobId: job.id,
                    userId: notification.userId,
                    type: notification.title,
                });
                return { success: true, skipped: true, reason: 'user_online' };
            }

            // Get user details
            const user = await User.findByPk(notification.userId);
            if (!user?.email) {
                logger.warn(`No email found for user ${notification.userId}, marking job as completed to prevent retries`);
                return {
                    success: false,
                    skipped: true,
                    reason: 'no_email',
                    userId: notification.userId
                };
            }

            // Get order details for better email content
            const order = await Order.findByPk(notification.resource, {
                attributes: ['id', 'orderNumber', 'customerId', 'agentId'],
            });

            // Get actor details
            let actorName = 'System';
            if (notification.actorId) {
                const actor = await User.findByPk(notification.actorId);
                if (actor) {
                    actorName = `${actor.firstName} ${actor.lastName}`.trim();
                }
            }

            // Determine recipient type
            const isCustomer = order?.customerId === notification.userId;
            const isAgent = order?.agentId === notification.userId;
            let recipientType = 'user';
            if (isCustomer) recipientType = 'customer';
            else if (isAgent) recipientType = 'agent';

            // Send email using existing email service
            await emailService.sendChatNotificationEmail(user.email, {
                recipientName: `${user.firstName} ${user.lastName}`.trim(),
                senderName: actorName,
                message: notification.message,
                notificationType: notification.title,
                resourceId: notification.resource ?? '',
                orderNumber: order?.orderNumber || notification.resource,
                recipientType,
                metadata: (notification as any).metadata || {},
            });

            logger.info(`Email notification sent successfully`, {
                jobId: job.id,
                userId: notification.userId,
                email: user.email,
                type: notification.title,
                actorName,
                recipientType,
            });

            return {
                success: true,
                emailSent: true,
                recipient: user.email,
                actorName,
                recipientType,
            };

        } catch (error) {
            logger.error(`Error sending email notification:`, {
                jobId: job.id,
                notificationId: id,
                userId: notification.userId,
                error: error instanceof Error ? error.message : error,
                attempt: attempts + 1,
                maxAttempts,
            });
            throw error; // This will trigger a retry
        }
    },
    {
        connection,
        concurrency: 3, // Reduced concurrency for email processing
        stalledInterval: 60000, // Check for stalled jobs every 60 seconds (emails are slower)
        maxStalledCount: 1, // Allow only 1 stall before considering job failed
    },
);

// Process push notification jobs
const pushNotificationWorker = new Worker<PushNotificationJobData>(
    'push-notifications',
    async job => {
        if (job.name !== 'send-push') {
            throw new Error(`Unknown job name: ${job.name}`);
        }

        const { notification, priority, retryCount = 0 } = job.data;

        logger.info(`Processing push notification job`, {
            jobId: job.id,
            userId: notification.userId,
            type: notification.title,
            priority,
            retryCount,
        });

        try {
            // Import services here to avoid circular dependencies
            const NotificationUtil = (await import('../clients/oneSignal.config')).default;

            console.log('push notification', notification);

            // Send push notification
            const result = await NotificationUtil.sendNotificationToUser(
                [notification.userId],
                notification
            );

            const success = result === 'success';

            if (success) {
                logger.info(`Push notification sent successfully`, {
                    jobId: job.id,
                    userId: notification.userId,
                    type: notification.title,
                    priority,
                });
            } else {
                logger.warn(`Push notification failed`, {
                    jobId: job.id,
                    userId: notification.userId,
                    type: notification.title,
                    result,
                });
            }

            // Ensure job completes properly to prevent stalling
            await job.updateProgress(100);

            return {
                success,
                result,
                userId: notification.userId,
                type: notification.title,
            };

        } catch (error) {
            logger.error(`Error sending push notification:`, {
                jobId: job.id,
                userId: notification.userId,
                type: notification.title,
                error: error instanceof Error ? error.message : error,
                retryCount,
            });

            // Handle OneSignal API errors gracefully - don't fail the job for external API issues
            if (error instanceof Error && error.message.includes('FetchError')) {
                logger.warn(`OneSignal API temporarily unavailable, marking job as completed to prevent retries`, {
                    jobId: job.id,
                    userId: notification.userId,
                });

                // Ensure job completes properly
                await job.updateProgress(100);

                return {
                    success: false,
                    result: 'api_unavailable',
                    userId: notification.userId,
                    type: notification.title,
                    error: 'OneSignal API temporarily unavailable'
                };
            }

            throw error; // This will trigger a retry for non-API errors
        }
    },
    {
        connection,
        concurrency: 2, // Further reduced concurrency to prevent job conflicts
        stalledInterval: 60000, // Increased interval to 60 seconds
        maxStalledCount: 2, // Allow 2 stalls before failing
        removeOnComplete: { count: 10 }, // Clean up completed jobs more aggressively
        removeOnFail: { count: 20 }, // Clean up failed jobs more aggressively
    },
);

// Process bulk notification jobs
const bulkNotificationWorker = new Worker<BulkNotificationJobData>(
    'bulk-notifications',
    async job => {
        if (job.name !== 'send-bulk') {
            throw new Error(`Unknown job name: ${job.name}`);
        }

        const { notifications, priority, batchSize = 50 } = job.data;

        logger.info(`Processing bulk notification job`, {
            jobId: job.id,
            notificationCount: notifications.length,
            priority,
            batchSize,
        });

        try {
            // Import services here to avoid circular dependencies
            const NotificationUtil = (await import('../clients/oneSignal.config')).default;

            const results = [];

            // Process notifications in batches
            for (let i = 0; i < notifications.length; i += batchSize) {
                const batch = notifications.slice(i, i + batchSize);
                const userIds = batch.map(n => n.userId);

                logger.info(`Processing batch ${Math.floor(i / batchSize) + 1}`, {
                    jobId: job.id,
                    batchSize: batch.length,
                    userIds,
                });

                // For bulk notifications, we'll send the first notification as template
                // This assumes all notifications in bulk have similar content
                const templateNotification = batch[0];

                try {
                    const result = await NotificationUtil.sendNotificationToUser(
                        userIds,
                        templateNotification
                    );

                    results.push({
                        userIds,
                        result,
                        success: result === 'success',
                    });

                    logger.info(`Batch processed`, {
                        jobId: job.id,
                        batchNumber: Math.floor(i / batchSize) + 1,
                        userCount: userIds.length,
                        result,
                    });

                } catch (batchError) {
                    logger.error(`Batch processing failed`, {
                        jobId: job.id,
                        batchNumber: Math.floor(i / batchSize) + 1,
                        userIds,
                        error: batchError instanceof Error ? batchError.message : batchError,
                    });

                    results.push({
                        userIds,
                        result: 'error',
                        success: false,
                        error: batchError instanceof Error ? batchError.message : 'Unknown error',
                    });
                }

                // Add small delay between batches to avoid overwhelming the service
                if (i + batchSize < notifications.length) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }

            const successCount = results.filter(r => r.success).length;
            const failureCount = results.length - successCount;

            logger.info(`Bulk notification job completed`, {
                jobId: job.id,
                totalBatches: results.length,
                successCount,
                failureCount,
                totalNotifications: notifications.length,
            });

            return {
                success: failureCount === 0,
                results,
                successCount,
                failureCount,
                totalNotifications: notifications.length,
            };

        } catch (error) {
            logger.error(`Error in bulk notification job:`, {
                jobId: job.id,
                notificationCount: notifications.length,
                error: error instanceof Error ? error.message : error,
            });
            throw error; // This will trigger a retry
        }
    },
    {
        connection,
        concurrency: 2, // Process up to 2 bulk jobs concurrently
    },
);

// Enhanced error handling for email worker
emailNotificationWorker.on('error', (error: Error) => {
    logger.error('Email notification worker system error:', {
        error: error.message,
        stack: error.stack,
        workerType: 'email',
    });
});

emailNotificationWorker.on('failed', (job: any, error: Error) => {
    logger.error('Email notification job failed:', {
        jobId: job?.id,
        jobName: job?.name,
        notificationId: job?.data?.id,
        userId: job?.data?.notification?.userId,
        error: error.message,
        stack: error.stack,
        attemptsMade: job?.attemptsMade,
        workerType: 'email',
    });
});

emailNotificationWorker.on('completed', (job: any, result: any) => {
    logger.info('Email notification job completed:', {
        jobId: job.id,
        jobName: job.name,
        notificationId: job.data.id,
        userId: job.data.notification.userId,
        success: result.success,
        skipped: result.skipped,
        duration: Date.now() - job.timestamp,
        workerType: 'email',
    });
});

// Enhanced error handling for push worker
pushNotificationWorker.on('error', (error: Error) => {
    logger.error('Push notification worker system error:', {
        error: error.message,
        stack: error.stack,
        workerType: 'push',
    });
});

pushNotificationWorker.on('failed', (job: any, error: Error) => {
    logger.error('Push notification job failed:', {
        jobId: job?.id,
        jobName: job?.name,
        userId: job?.data?.notification?.userId,
        type: job?.data?.notification?.title,
        error: error.message,
        stack: error.stack,
        attemptsMade: job?.attemptsMade,
        workerType: 'push',
    });
});

pushNotificationWorker.on('completed', (job: any, result: any) => {
    logger.info('Push notification job completed:', {
        jobId: job.id,
        jobName: job.name,
        userId: job.data.notification.userId,
        type: job.data.notification.title,
        success: result.success,
        duration: Date.now() - job.timestamp,
        workerType: 'push',
    });
});

// Handle stalled jobs for push notifications
pushNotificationWorker.on('stalled', (jobId: string) => {
    logger.warn('Push notification job stalled:', {
        jobId,
        workerType: 'push',
        action: 'will be retried'
    });
});

// Enhanced error handling for bulk worker
bulkNotificationWorker.on('error', (error: Error) => {
    logger.error('Bulk notification worker system error:', {
        error: error.message,
        stack: error.stack,
        workerType: 'bulk',
    });
});

bulkNotificationWorker.on('failed', (job: any, error: Error) => {
    logger.error('Bulk notification job failed:', {
        jobId: job?.id,
        jobName: job?.name,
        notificationCount: job?.data?.notifications?.length,
        error: error.message,
        stack: error.stack,
        attemptsMade: job?.attemptsMade,
        workerType: 'bulk',
    });
});

bulkNotificationWorker.on('completed', (job: any, result: any) => {
    logger.info('Bulk notification job completed:', {
        jobId: job.id,
        jobName: job.name,
        notificationCount: job.data.notifications.length,
        successCount: result.successCount,
        failureCount: result.failureCount,
        duration: Date.now() - job.timestamp,
        workerType: 'bulk',
    });
});

// Stalled job handling
emailNotificationWorker.on('stalled', (jobId: string) => {
    logger.warn('Email notification job stalled:', {
        jobId,
        workerType: 'email',
        action: 'will be retried',
    });
});

pushNotificationWorker.on('stalled', (jobId: string) => {
    logger.warn('Push notification job stalled:', {
        jobId,
        workerType: 'push',
        action: 'will be retried',
    });
});

bulkNotificationWorker.on('stalled', (jobId: string) => {
    logger.warn('Bulk notification job stalled:', {
        jobId,
        workerType: 'bulk',
        action: 'will be retried',
    });
});

// Helper functions for queuing notifications
export async function queueEmailNotification(
    notificationData: EmailNotificationJobData,
    delayMinutes: number = 0,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
): Promise<void> {
    try {
        await emailNotificationQueue.add(
            'send-email',
            notificationData,
            {
                delay: delayMinutes * 60 * 1000,
                priority: priority === 'urgent' ? 10 : priority === 'high' ? 5 : priority === 'normal' ? 0 : -5,
                jobId: `email-${notificationData.id}`, // Prevent duplicates
            }
        );

        logger.info(`Queued email notification`, {
            notificationId: notificationData.id,
            userId: notificationData.notification.userId,
            delayMinutes,
            priority,
        });
    } catch (error) {
        logger.error(`Error queuing email notification:`, {
            notificationId: notificationData.id,
            error: error instanceof Error ? error.message : error,
        });
        throw error;
    }
}

export async function queuePushNotification(
    notification: INotification,
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal',
    delaySeconds: number = 0
): Promise<void> {
    try {
        const jobId = `push-${notification.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        await pushNotificationQueue.add(
            'send-push' as any,
            {
                notification,
                priority,
                retryCount: 0,
            },
            {
                delay: delaySeconds * 1000,
                priority: priority === 'urgent' ? 10 : priority === 'high' ? 5 : priority === 'normal' ? 0 : -5,
                jobId, // Generate truly unique job IDs
                removeOnComplete: { count: 10 }, // Remove completed jobs quickly to prevent bloat
                removeOnFail: { count: 5 }, // Remove failed jobs quickly for push notifications
            }
        );

        logger.info(`Queued push notification`, {
            userId: notification.userId,
            type: notification.title,
            priority,
            delaySeconds,
            jobId,
        });
    } catch (error) {
        logger.error(`Error queuing push notification:`, {
            userId: notification.userId,
            error: error instanceof Error ? error.message : error,
        });
        throw error;
    }
}

export async function queueBulkNotifications(
    notifications: INotification[],
    priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal',
    batchSize: number = 50
): Promise<void> {
    try {
        await bulkNotificationQueue.add(
            'send-bulk',
            {
                notifications,
                priority,
                batchSize,
            },
            {
                priority: priority === 'urgent' ? 10 : priority === 'high' ? 5 : priority === 'normal' ? 0 : -5,
                jobId: `bulk-${Date.now()}`, // Unique ID for bulk jobs
            }
        );

        logger.info(`Queued bulk notification`, {
            notificationCount: notifications.length,
            priority,
            batchSize,
        });
    } catch (error) {
        logger.error(`Error queuing bulk notification:`, {
            notificationCount: notifications.length,
            error: error instanceof Error ? error.message : error,
        });
        throw error;
    }
}

// Add cleanup on process termination
process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, closing notification queue workers...');
    await Promise.all([
        emailNotificationWorker.close(),
        pushNotificationWorker.close(),
        bulkNotificationWorker.close(),
    ]);
    logger.info('Notification queue workers closed');
});

process.on('SIGINT', async () => {
    logger.info('Received SIGINT, closing notification queue workers...');
    await Promise.all([
        emailNotificationWorker.close(),
        pushNotificationWorker.close(),
        bulkNotificationWorker.close(),
    ]);
    logger.info('Notification queue workers closed');
});

export { emailNotificationWorker, pushNotificationWorker, bulkNotificationWorker };