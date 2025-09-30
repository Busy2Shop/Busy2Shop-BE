import { logger } from '../utils/logger';
import { INotification } from '../models/notification.model';
import UserPresenceService from './user-presence.service';
import { NotificationTypes } from '../utils/interface';
import { v4 as uuidv4 } from 'uuid';
import {
    queueEmailNotification,
    queuePushNotification,
} from '../queues/notification.queue';
import pushService from './push.service';

interface SmartNotificationOptions {
    priority: 'low' | 'normal' | 'high' | 'urgent';
    requiresEmail?: boolean;
    emailDelayMinutes?: number;
    skipPushNotification?: boolean;
    skipEmailNotification?: boolean;
}

/**
 * Smart Notification Dispatcher
 * Intelligently routes notifications based on user presence:
 * 1. Always try push notifications first (cheap and real-time)
 * 2. Only send emails if user is offline for 5+ minutes (cost optimization)
 * 3. Handle different priority levels with appropriate fallback strategies
 */
export class SmartNotificationDispatcher {
    private static readonly DEFAULT_EMAIL_DELAY = 5; // 5 minutes

    /**
     * Initialize the smart notification dispatcher
     */
    static initialize(): void {
        logger.info('📧 SmartNotificationDispatcher: Initialized with BullMQ integration');
    }

    /**
     * Dispatch notification using smart routing
     */
    static async dispatchNotification(
        notification: INotification,
        options: SmartNotificationOptions = { priority: 'normal' }
    ): Promise<{ pushSent: boolean; emailScheduled: boolean; emailSent: boolean }> {
        const result = {
            pushSent: false,
            emailScheduled: false,
            emailSent: false,
        };

        try {
            logger.info('📧 SmartNotificationDispatcher: Processing notification', {
                userId: notification.userId,
                type: notification.title,
                priority: options.priority,
            });

            // Step 1: Check user presence
            const isUserOnline = await UserPresenceService.isUserOnline(notification.userId);
            const timeSinceLastSeen = await UserPresenceService.getTimeSinceLastSeen(notification.userId);

            logger.info('📧 SmartNotificationDispatcher: User presence check', {
                userId: notification.userId,
                isOnline: isUserOnline,
                timeSinceLastSeen: timeSinceLastSeen ? `${timeSinceLastSeen} minutes` : 'unknown',
            });

            // Step 2: Send push notification (always try first, unless explicitly skipped)
            if (!options.skipPushNotification) {
                try {
                    // Use our professional push service for database-backed OneSignal integration
                    const pushResult = await pushService.sendPushNotification({
                        userId: notification.userId,
                        title: notification.title || notification.heading || 'Notification',
                        message: notification.message,
                        data: {
                            type: notification.title,
                            notificationId: notification.id,
                            priority: options.priority,
                            resource: notification.resource,
                            actorId: notification.actorId,
                        },
                    });

                    result.pushSent = pushResult.success;

                    if (pushResult.success) {
                        logger.info('📧 SmartNotificationDispatcher: Push notification sent successfully', {
                            userId: notification.userId,
                            type: notification.title,
                            priority: options.priority,
                            sentCount: pushResult.sentCount,
                        });
                    } else {
                        logger.warn('📧 SmartNotificationDispatcher: Push notification failed', {
                            userId: notification.userId,
                            type: notification.title,
                            details: pushResult.details,
                        });
                    }
                } catch (pushError) {
                    logger.error('📧 SmartNotificationDispatcher: Push notification error:', pushError);
                    result.pushSent = false;
                }
            }

            // Step 3: Determine email strategy based on priority and user presence
            if (!options.skipEmailNotification && this.shouldSendEmail(notification, options, isUserOnline, timeSinceLastSeen)) {
                const emailDelay = this.calculateEmailDelay(options, isUserOnline, timeSinceLastSeen);

                if (emailDelay === 0) {
                    // Send email immediately (urgent notifications or user offline for long time)
                    result.emailSent = await this.sendEmailImmediatelyViaBullMQ(notification, options.priority);
                } else {
                    // Schedule email for later (user might come back online)
                    result.emailScheduled = await this.scheduleEmailViaBullMQ(notification, emailDelay, options.priority);
                }
            }

            // Log the dispatch result
            logger.info('📧 SmartNotificationDispatcher: Notification dispatch completed', {
                userId: notification.userId,
                type: notification.title,
                pushSent: result.pushSent,
                emailScheduled: result.emailScheduled,
                emailSent: result.emailSent,
                isUserOnline,
                timeSinceLastSeen,
            });

            return result;

        } catch (error) {
            logger.error('📧 SmartNotificationDispatcher: Error dispatching notification:', error);
            return result;
        }
    }

    /**
     * Determine if email should be sent based on notification and user state
     */
    private static shouldSendEmail(
        notification: INotification,
        options: SmartNotificationOptions,
        isUserOnline: boolean,
        timeSinceLastSeen: number | null
    ): boolean {
        // Always send email for urgent notifications
        if (options.priority === 'urgent') {
            return true;
        }

        // Skip email for low priority notifications if user is online
        if (options.priority === 'low' && isUserOnline) {
            return false;
        }

        // Send email if explicitly required
        if (options.requiresEmail) {
            return true;
        }

        // NEVER send email for chat notifications - only push notifications
        const chatNotificationTypes = [
            NotificationTypes.CHAT_MESSAGE_RECEIVED,
            NotificationTypes.CHAT_ACTIVATED,
            NotificationTypes.USER_LEFT_CHAT,
        ];

        if (chatNotificationTypes.includes(notification.title as NotificationTypes)) {
            // Chat messages should only use push notifications, never email
            return false;
        }

        // For other notification types, use more lenient rules
        return !isUserOnline || (timeSinceLastSeen !== null && timeSinceLastSeen >= 2);
    }

    /**
     * Calculate email delay based on options and user state
     */
    private static calculateEmailDelay(
        options: SmartNotificationOptions,
        isUserOnline: boolean,
        timeSinceLastSeen: number | null
    ): number {
        // Send immediately for urgent notifications
        if (options.priority === 'urgent') {
            return 0;
        }

        // Use custom delay if specified
        if (options.emailDelayMinutes !== undefined) {
            return options.emailDelayMinutes;
        }

        // If user has been offline for a long time, send immediately
        if (timeSinceLastSeen !== null && timeSinceLastSeen >= 10) {
            return 0;
        }

        // If user is online or recently online, wait the default delay
        return this.DEFAULT_EMAIL_DELAY;
    }

    /**
     * Send email immediately via BullMQ
     */
    private static async sendEmailImmediatelyViaBullMQ(
        notification: INotification,
        priority: 'low' | 'normal' | 'high' | 'urgent'
    ): Promise<boolean> {
        try {
            const userPresence = await UserPresenceService.getUserPresence(notification.userId);

            const emailData = {
                id: uuidv4(),
                notification,
                scheduledAt: new Date(),
                userLastSeen: userPresence?.lastSeen || new Date(),
                emailDelayMinutes: 0,
                attempts: 0,
                maxAttempts: 3,
                priority,
            };

            await queueEmailNotification(emailData, 0, priority);

            logger.info('📧 SmartNotificationDispatcher: Email queued for immediate sending', {
                userId: notification.userId,
                type: notification.title,
                priority,
            });

            return true;
        } catch (error) {
            logger.error('📧 SmartNotificationDispatcher: Failed to queue immediate email:', error);
            return false;
        }
    }

    /**
     * Schedule email for later delivery via BullMQ
     */
    private static async scheduleEmailViaBullMQ(
        notification: INotification,
        delayMinutes: number,
        priority: 'low' | 'normal' | 'high' | 'urgent'
    ): Promise<boolean> {
        try {
            const scheduledAt = new Date(Date.now() + delayMinutes * 60000);
            const userPresence = await UserPresenceService.getUserPresence(notification.userId);

            const emailData = {
                id: uuidv4(),
                notification,
                scheduledAt,
                userLastSeen: userPresence?.lastSeen || new Date(),
                emailDelayMinutes: delayMinutes,
                attempts: 0,
                maxAttempts: 3,
                priority,
            };

            await queueEmailNotification(emailData, delayMinutes, priority);

            logger.info('📧 SmartNotificationDispatcher: Email scheduled via BullMQ', {
                userId: notification.userId,
                type: notification.title,
                delayMinutes,
                scheduledAt: scheduledAt.toISOString(),
                priority,
            });

            return true;
        } catch (error) {
            logger.error('📧 SmartNotificationDispatcher: Failed to schedule email via BullMQ:', error);
            return false;
        }
    }

    /**
     * BullMQ handles email queue processing now
     * This method is kept for backward compatibility but does nothing
     */
    private static async processEmailQueue(): Promise<void> {
        // BullMQ handles email queue processing automatically
        // This method is no longer needed
    }

    /**
     * BullMQ handles queue processing automatically
     * These methods are kept for backward compatibility
     */
    private static startEmailQueueProcessor(): void {
        // BullMQ handles queue processing automatically
        logger.info('📧 SmartNotificationDispatcher: Using BullMQ for email queue processing');
    }

    static stopEmailQueueProcessor(): void {
        // BullMQ handles queue processing automatically
        logger.info('📧 SmartNotificationDispatcher: BullMQ handles queue shutdown');
    }

    /**
     * Get queue statistics from BullMQ
     */
    static async getQueueStats(): Promise<{
        totalPending: number;
        overdueEmails: number;
        upcomingEmails: number;
    }> {
        try {
            // Import the email queue here to avoid circular dependencies
            const { emailNotificationQueue } = await import('../queues/notification.queue');

            // Get waiting and delayed jobs
            const waitingJobs = await emailNotificationQueue.getJobs(['waiting']);
            const delayedJobs = await emailNotificationQueue.getJobs(['delayed']);

            const now = Date.now();

            // Count overdue jobs (delayed jobs that should have been processed)
            const overdueEmails = delayedJobs.filter(job => {
                const scheduledTime = job.processedOn || job.timestamp + (job.delay || 0);
                return scheduledTime <= now;
            }).length;

            // Count upcoming jobs (delayed jobs scheduled for future)
            const upcomingEmails = delayedJobs.filter(job => {
                const scheduledTime = job.processedOn || job.timestamp + (job.delay || 0);
                return scheduledTime > now;
            }).length;

            return {
                totalPending: waitingJobs.length + delayedJobs.length,
                overdueEmails,
                upcomingEmails,
            };
        } catch (error) {
            logger.error('📧 SmartNotificationDispatcher: Error getting BullMQ queue stats:', error);
            return { totalPending: 0, overdueEmails: 0, upcomingEmails: 0 };
        }
    }

    /**
     * Clear the email queue (for testing/maintenance)
     */
    static async clearQueue(): Promise<number> {
        try {
            // Import the email queue here to avoid circular dependencies
            const { emailNotificationQueue } = await import('../queues/notification.queue');

            // Get all jobs in various states
            const waitingJobs = await emailNotificationQueue.getJobs(['waiting']);
            const delayedJobs = await emailNotificationQueue.getJobs(['delayed']);
            const activeJobs = await emailNotificationQueue.getJobs(['active']);

            const totalJobs = waitingJobs.length + delayedJobs.length + activeJobs.length;

            // Remove all jobs
            await Promise.all([
                ...waitingJobs.map(job => job.remove()),
                ...delayedJobs.map(job => job.remove()),
                // Note: Active jobs will be allowed to complete
            ]);

            logger.info(`📧 SmartNotificationDispatcher: Cleared ${totalJobs} emails from BullMQ queue`);
            return totalJobs;
        } catch (error) {
            logger.error('📧 SmartNotificationDispatcher: Error clearing BullMQ queue:', error);
            return 0;
        }
    }

    /**
     * Shutdown the dispatcher
     */
    static shutdown(): void {
        this.stopEmailQueueProcessor();
        logger.info('📧 SmartNotificationDispatcher: Shutdown complete - BullMQ handles worker cleanup');
    }
}

export default SmartNotificationDispatcher;