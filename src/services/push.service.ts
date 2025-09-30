import { logger } from '../utils/logger';
import {
    ONESIGNAL_APP_ID,
    ONESIGNAL_REST_API_KEY,
    ONESIGNAL_USER_AUTH_KEY
} from '../utils/constants';
import * as OneSignal from '@onesignal/node-onesignal';
import PushSubscription from '../models/pushSubscription.model';
import { INotification } from '../models/notification.model';

interface PushNotificationData {
    userId: string;
    title: string;
    message: string;
    data?: Record<string, any>;
    url?: string;
}

interface SubscriptionData {
    playerId: string;
    deviceType: 'web' | 'mobile';
    userAgent?: string;
    ipAddress?: string;
}

class PushService {
    private client: OneSignal.DefaultApi;
    private appId: string;

    constructor() {
        if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
            logger.warn('OneSignal credentials not configured. Push notifications will be disabled.');
            return;
        }

        this.appId = ONESIGNAL_APP_ID;
        this.client = new OneSignal.DefaultApi(
            OneSignal.createConfiguration({
                restApiKey: ONESIGNAL_REST_API_KEY,
                userAuthKey: ONESIGNAL_USER_AUTH_KEY,
            })
        );

        logger.info('🔔 PushService: OneSignal client initialized');
    }

    /**
     * Send push notification to a specific user
     */
    async sendPushNotification(params: PushNotificationData): Promise<{
        success: boolean;
        sentCount: number;
        failedCount: number;
        details?: any;
    }> {
        try {
            if (!this.client) {
                logger.warn('OneSignal not configured. Skipping push notification.');
                return { success: false, sentCount: 0, failedCount: 1 };
            }

            // Get user's active push subscriptions
            const subscriptions = await PushSubscription.findActiveByUserId(params.userId);

            if (subscriptions.length === 0) {
                logger.info(`No active push subscriptions found for user ${params.userId}`);
                return { success: true, sentCount: 0, failedCount: 0 };
            }

            const playerIds = subscriptions.map(sub => sub.playerId);

            logger.info('📧 PushService: Sending push notification', {
                userId: params.userId,
                title: params.title,
                playerIds: playerIds.length,
                subscriptions: subscriptions.length,
            });

            // Create OneSignal notification
            const notification = new OneSignal.Notification();
            notification.app_id = this.appId;
            notification.include_subscription_ids = playerIds;
            notification.headings = { en: params.title };
            notification.contents = { en: params.message };

            // Add custom data for navigation
            if (params.data || params.url) {
                notification.data = {
                    ...params.data,
                    url: params.url,
                };
            }

            // Set target channel to push (not email)
            notification.target_channel = 'push';

            // Send notification
            const response = await this.client.createNotification(notification);

            // Update subscription usage
            await Promise.all(subscriptions.map(sub => sub.markAsUsed()));

            logger.info('📧 PushService: Push notification sent successfully', {
                userId: params.userId,
                notificationId: response.id,
                recipients: playerIds.length,
            });

            return {
                success: true,
                sentCount: playerIds.length,
                failedCount: 0,
                details: {
                    id: response.id,
                    recipients: playerIds.length,
                },
            };

        } catch (error: any) {
            logger.error('📧 PushService: Failed to send push notification:', {
                error: error.message,
                stack: error.stack,
                userId: params.userId,
                title: params.title,
            });

            return {
                success: false,
                sentCount: 0,
                failedCount: 1,
                details: { error: error.message },
            };
        }
    }

    /**
     * Subscribe user to push notifications
     */
    async subscribeUser(
        userId: string,
        subscriptionData: SubscriptionData
    ): Promise<{ success: boolean; message: string; subscription?: PushSubscription }> {
        try {
            logger.info('📧 PushService: Subscribing user to push notifications', {
                userId,
                playerId: subscriptionData.playerId,
                deviceType: subscriptionData.deviceType,
            });

            // Check if subscription already exists
            let subscription = await PushSubscription.findOne({
                where: {
                    userId,
                    playerId: subscriptionData.playerId,
                },
            });

            if (subscription) {
                // Reactivate existing subscription
                if (!subscription.isActive) {
                    await subscription.reactivate();
                    logger.info('📧 PushService: Reactivated existing subscription', {
                        userId,
                        subscriptionId: subscription.id,
                    });

                    return {
                        success: true,
                        message: 'Push notifications reactivated successfully',
                        subscription,
                    };
                } else {
                    // Update last used
                    await subscription.markAsUsed();

                    return {
                        success: true,
                        message: 'Already subscribed to push notifications',
                        subscription,
                    };
                }
            }

            // Create new subscription
            subscription = await PushSubscription.create({
                userId,
                playerId: subscriptionData.playerId,
                deviceType: subscriptionData.deviceType,
                userAgent: subscriptionData.userAgent,
                ipAddress: subscriptionData.ipAddress,
                isActive: true,
                lastUsed: new Date(),
            } as any);

            logger.info('📧 PushService: Created new push subscription', {
                userId,
                subscriptionId: subscription.id,
                playerId: subscriptionData.playerId,
            });

            return {
                success: true,
                message: 'Successfully subscribed to push notifications',
                subscription,
            };

        } catch (error: any) {
            logger.error('📧 PushService: Failed to subscribe user:', {
                error: error.message,
                stack: error.stack,
                userId,
                playerId: subscriptionData.playerId,
            });

            return {
                success: false,
                message: 'Failed to subscribe to push notifications',
            };
        }
    }

    /**
     * Unsubscribe user from push notifications
     */
    async unsubscribeUser(
        userId: string,
        playerId?: string
    ): Promise<{ success: boolean; message: string }> {
        try {
            logger.info('📧 PushService: Unsubscribing user from push notifications', {
                userId,
                playerId: playerId || 'all',
            });

            const whereClause: any = { userId };
            if (playerId) {
                whereClause.playerId = playerId;
            }

            // Deactivate subscriptions
            const [affectedCount] = await PushSubscription.update(
                { isActive: false },
                { where: whereClause }
            );

            logger.info('📧 PushService: Deactivated push subscriptions', {
                userId,
                affectedCount,
            });

            return {
                success: true,
                message: `Successfully unsubscribed ${affectedCount} subscription(s)`,
            };

        } catch (error: any) {
            logger.error('📧 PushService: Failed to unsubscribe user:', {
                error: error.message,
                stack: error.stack,
                userId,
                playerId,
            });

            return {
                success: false,
                message: 'Failed to unsubscribe from push notifications',
            };
        }
    }

    /**
     * Get user's push subscription status
     */
    async getUserSubscriptionStatus(userId: string): Promise<{
        hasActiveSubscriptions: boolean;
        subscriptions: PushSubscription[];
        totalCount: number;
        activeCount: number;
    }> {
        try {
            const subscriptions = await PushSubscription.findAll({
                where: { userId },
                order: [['lastUsed', 'DESC']],
            });

            const activeSubscriptions = subscriptions.filter(sub => sub.isActive);

            return {
                hasActiveSubscriptions: activeSubscriptions.length > 0,
                subscriptions: activeSubscriptions,
                totalCount: subscriptions.length,
                activeCount: activeSubscriptions.length,
            };

        } catch (error: any) {
            logger.error('📧 PushService: Failed to get subscription status:', {
                error: error.message,
                userId,
            });

            return {
                hasActiveSubscriptions: false,
                subscriptions: [],
                totalCount: 0,
                activeCount: 0,
            };
        }
    }

    /**
     * Send test notification to user
     */
    async sendTestNotification(userId: string): Promise<{
        success: boolean;
        message: string;
        details?: any;
    }> {
        try {
            const subscriptionStatus = await this.getUserSubscriptionStatus(userId);

            if (!subscriptionStatus.hasActiveSubscriptions) {
                return {
                    success: false,
                    message: 'No active push subscriptions found for this user',
                };
            }

            const result = await this.sendPushNotification({
                userId,
                title: '🧪 Test Notification',
                message: 'This is a test push notification from Busy2Shop!',
                data: {
                    type: 'test',
                    timestamp: new Date().toISOString(),
                },
            });

            return {
                success: result.success,
                message: result.success
                    ? `Test notification sent to ${result.sentCount} device(s)`
                    : 'Failed to send test notification',
                details: result.details,
            };

        } catch (error: any) {
            logger.error('📧 PushService: Failed to send test notification:', {
                error: error.message,
                userId,
            });

            return {
                success: false,
                message: 'Failed to send test notification',
                details: { error: error.message },
            };
        }
    }

    /**
     * Clean up old inactive subscriptions
     */
    async cleanupOldSubscriptions(): Promise<number> {
        try {
            const deactivatedCount = await PushSubscription.deactivateOldSubscriptions();

            if (deactivatedCount > 0) {
                logger.info('📧 PushService: Cleaned up old subscriptions', {
                    deactivatedCount,
                });
            }

            return deactivatedCount;

        } catch (error: any) {
            logger.error('📧 PushService: Failed to cleanup old subscriptions:', {
                error: error.message,
            });
            return 0;
        }
    }

    /**
     * Get push notification statistics
     */
    async getStatistics(): Promise<{
        subscriptions: {
            total: number;
            active: number;
            web: number;
            mobile: number;
            recent: number;
        };
        isConfigured: boolean;
    }> {
        try {
            const subscriptionStats = await PushSubscription.getSubscriptionStats();

            return {
                subscriptions: subscriptionStats,
                isConfigured: !!this.client,
            };

        } catch (error: any) {
            logger.error('📧 PushService: Failed to get statistics:', {
                error: error.message,
            });

            return {
                subscriptions: {
                    total: 0,
                    active: 0,
                    web: 0,
                    mobile: 0,
                    recent: 0,
                },
                isConfigured: !!this.client,
            };
        }
    }

    /**
     * Send bulk notifications to multiple users
     */
    async sendBulkNotifications(
        userIds: string[],
        notification: Omit<PushNotificationData, 'userId'>
    ): Promise<{
        success: boolean;
        totalSent: number;
        totalFailed: number;
        results: Array<{ userId: string; success: boolean; details?: any }>;
    }> {
        try {
            logger.info('📧 PushService: Sending bulk notifications', {
                userCount: userIds.length,
                title: notification.title,
            });

            const results = await Promise.allSettled(
                userIds.map(userId =>
                    this.sendPushNotification({ ...notification, userId })
                )
            );

            const processedResults = results.map((result, index) => {
                const userId = userIds[index];

                if (result.status === 'fulfilled') {
                    return {
                        userId,
                        success: result.value.success,
                        details: result.value.details,
                    };
                } else {
                    return {
                        userId,
                        success: false,
                        details: { error: result.reason.message },
                    };
                }
            });

            const successCount = processedResults.filter(r => r.success).length;
            const failureCount = processedResults.length - successCount;

            logger.info('📧 PushService: Bulk notifications completed', {
                total: userIds.length,
                successful: successCount,
                failed: failureCount,
            });

            return {
                success: successCount > 0,
                totalSent: successCount,
                totalFailed: failureCount,
                results: processedResults,
            };

        } catch (error: any) {
            logger.error('📧 PushService: Failed to send bulk notifications:', {
                error: error.message,
                userCount: userIds.length,
            });

            return {
                success: false,
                totalSent: 0,
                totalFailed: userIds.length,
                results: userIds.map(userId => ({
                    userId,
                    success: false,
                    details: { error: error.message },
                })),
            };
        }
    }
}

// Export singleton instance
const pushService = new PushService();
export default pushService;
export { PushService, PushNotificationData, SubscriptionData };