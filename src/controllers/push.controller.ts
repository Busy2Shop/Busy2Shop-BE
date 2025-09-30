import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import pushService from '../services/push.service';
import { getClientIp } from '../utils/requestUtils';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

/**
 * Subscribe user to push notifications
 */
export const subscribeToPushNotifications = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const { playerId, deviceType = 'web' } = req.body;

        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated',
            });
            return;
        }

        if (!playerId) {
            res.status(400).json({
                success: false,
                message: 'Player ID is required',
            });
            return;
        }

        if (!['web', 'mobile'].includes(deviceType)) {
            res.status(400).json({
                success: false,
                message: 'Device type must be either "web" or "mobile"',
            });
            return;
        }

        logger.info('📧 PushController: Subscribe request received', {
            userId,
            playerId,
            deviceType,
        });

        const result = await pushService.subscribeUser(userId, {
            playerId,
            deviceType,
            userAgent: req.get('User-Agent'),
            ipAddress: getClientIp(req),
        });

        if (result.success) {
            res.status(200).json({
                success: true,
                message: result.message,
                data: {
                    subscriptionId: result.subscription?.id,
                    deviceType: result.subscription?.deviceType,
                    createdAt: result.subscription?.createdAt,
                },
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message,
            });
        }

    } catch (error: any) {
        logger.error('📧 PushController: Subscribe error:', {
            error: error.message,
            stack: error.stack,
        });

        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};

/**
 * Unsubscribe user from push notifications
 */
export const unsubscribeFromPushNotifications = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;
        const { playerId } = req.body;

        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated',
            });
            return;
        }

        logger.info('📧 PushController: Unsubscribe request received', {
            userId,
            playerId: playerId || 'all',
        });

        const result = await pushService.unsubscribeUser(userId, playerId);

        res.status(200).json({
            success: result.success,
            message: result.message,
        });

    } catch (error: any) {
        logger.error('📧 PushController: Unsubscribe error:', {
            error: error.message,
            stack: error.stack,
        });

        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};

/**
 * Get user's push notification subscription status
 */
export const getPushNotificationStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated',
            });
            return;
        }

        const status = await pushService.getUserSubscriptionStatus(userId);

        res.status(200).json({
            success: true,
            message: 'Subscription status retrieved successfully',
            data: {
                hasActiveSubscriptions: status.hasActiveSubscriptions,
                totalCount: status.totalCount,
                activeCount: status.activeCount,
                subscriptions: status.subscriptions.map(sub => ({
                    id: sub.id,
                    deviceType: sub.deviceType,
                    deviceInfo: sub.deviceInfo,
                    lastUsed: sub.lastUsed,
                    createdAt: sub.createdAt,
                })),
            },
        });

    } catch (error: any) {
        logger.error('📧 PushController: Status error:', {
            error: error.message,
            stack: error.stack,
        });

        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};

/**
 * Send test push notification to user
 */
export const sendTestPushNotification = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user?.id;

        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'User not authenticated',
            });
            return;
        }

        logger.info('📧 PushController: Test notification request received', {
            userId,
        });

        const result = await pushService.sendTestNotification(userId);

        if (result.success) {
            res.status(200).json({
                success: true,
                message: result.message,
                data: result.details,
            });
        } else {
            res.status(400).json({
                success: false,
                message: result.message,
                data: result.details,
            });
        }

    } catch (error: any) {
        logger.error('📧 PushController: Test notification error:', {
            error: error.message,
            stack: error.stack,
        });

        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};

/**
 * Get push notification statistics (admin only)
 */
export const getPushNotificationStatistics = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        // Check if user is admin (adjust this based on your auth system)
        // Note: Add proper admin check here when routes are enabled
        if (false) {
            res.status(403).json({
                success: false,
                message: 'Admin access required',
            });
            return;
        }

        const stats = await pushService.getStatistics();

        res.status(200).json({
            success: true,
            message: 'Statistics retrieved successfully',
            data: stats,
        });

    } catch (error: any) {
        logger.error('📧 PushController: Statistics error:', {
            error: error.message,
            stack: error.stack,
        });

        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};

/**
 * Clean up old inactive push subscriptions (admin only)
 */
export const cleanupOldSubscriptions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
        // Check if user is admin (adjust this based on your auth system)
        // Note: Add proper admin check here when routes are enabled
        if (false) {
            res.status(403).json({
                success: false,
                message: 'Admin access required',
            });
            return;
        }

        logger.info('📧 PushController: Cleanup request received');

        const deactivatedCount = await pushService.cleanupOldSubscriptions();

        res.status(200).json({
            success: true,
            message: `Cleaned up ${deactivatedCount} old subscription(s)`,
            data: {
                deactivatedCount,
            },
        });

    } catch (error: any) {
        logger.error('📧 PushController: Cleanup error:', {
            error: error.message,
            stack: error.stack,
        });

        res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};