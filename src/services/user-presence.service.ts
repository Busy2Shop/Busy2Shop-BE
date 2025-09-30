import { redisClient } from '../utils/redis';
import { logger } from '../utils/logger';

interface UserPresence {
    userId: string;
    lastSeen: Date;
    isOnline: boolean;
    deviceType: 'web' | 'mobile' | 'desktop';
    userAgent?: string;
    socketId?: string;
}

interface PresenceStats {
    totalOnline: number;
    recentlyOffline: number;
    totalTracked: number;
}

/**
 * User Presence Service
 * Tracks user online/offline status to optimize notification delivery
 * Uses Redis for real-time presence tracking with TTL
 */
export class UserPresenceService {
    private static readonly PRESENCE_TTL = 300; // 5 minutes
    private static readonly OFFLINE_THRESHOLD = 300000; // 5 minutes in milliseconds
    private static readonly CLEANUP_INTERVAL = 60000; // 1 minute cleanup interval

    private static cleanupTimer: NodeJS.Timeout | null = null;

    /**
     * Initialize the presence service
     */
    static initialize(): void {
        // Start periodic cleanup
        this.startCleanupTimer();
        logger.info('👥 UserPresenceService: Initialized with periodic cleanup');
    }

    /**
     * Update user presence (mark as online)
     */
    static async updateUserPresence(
        userId: string,
        deviceType: 'web' | 'mobile' | 'desktop' = 'web',
        userAgent?: string,
        socketId?: string
    ): Promise<void> {
        try {
            const presenceKey = `presence:${userId}`;
            const presence: UserPresence = {
                userId,
                lastSeen: new Date(),
                isOnline: true,
                deviceType,
                userAgent,
                socketId
            };

            // Store in Redis with TTL
            await redisClient.setex(
                presenceKey,
                this.PRESENCE_TTL,
                JSON.stringify(presence)
            );

            logger.info(`👥 UserPresenceService: Updated presence for user ${userId}`, {
                deviceType,
                hasSocketId: !!socketId
            });
        } catch (error) {
            logger.error('👥 UserPresenceService: Error updating user presence:', error);
        }
    }

    /**
     * Mark user as offline
     */
    static async markUserOffline(userId: string): Promise<void> {
        try {
            const presenceKey = `presence:${userId}`;
            const existingData = await redisClient.get(presenceKey);

            if (existingData) {
                const presence: UserPresence = JSON.parse(existingData);
                presence.isOnline = false;
                presence.lastSeen = new Date();

                // Update with shorter TTL for offline users
                await redisClient.setex(
                    presenceKey,
                    60, // 1 minute TTL for offline status
                    JSON.stringify(presence)
                );

                logger.info(`👥 UserPresenceService: Marked user ${userId} as offline`);
            }
        } catch (error) {
            logger.error('👥 UserPresenceService: Error marking user offline:', error);
        }
    }

    /**
     * Check if user is currently online
     */
    static async isUserOnline(userId: string): Promise<boolean> {
        try {
            const presenceKey = `presence:${userId}`;
            const presenceData = await redisClient.get(presenceKey);

            if (!presenceData) {
                return false;
            }

            const presence: UserPresence = JSON.parse(presenceData);
            const now = new Date().getTime();
            const lastSeen = new Date(presence.lastSeen).getTime();

            // Consider user offline if last seen > 5 minutes ago
            const isRecent = (now - lastSeen) < this.OFFLINE_THRESHOLD;

            return presence.isOnline && isRecent;
        } catch (error) {
            logger.error('👥 UserPresenceService: Error checking user online status:', error);
            return false;
        }
    }

    /**
     * Check if user was recently online (within last 5 minutes)
     */
    static async wasUserRecentlyOnline(userId: string): Promise<boolean> {
        try {
            const presenceKey = `presence:${userId}`;
            const presenceData = await redisClient.get(presenceKey);

            if (!presenceData) {
                return false;
            }

            const presence: UserPresence = JSON.parse(presenceData);
            const now = new Date().getTime();
            const lastSeen = new Date(presence.lastSeen).getTime();

            return (now - lastSeen) < this.OFFLINE_THRESHOLD;
        } catch (error) {
            logger.error('👥 UserPresenceService: Error checking recent user activity:', error);
            return false;
        }
    }

    /**
     * Get user presence information
     */
    static async getUserPresence(userId: string): Promise<UserPresence | null> {
        try {
            const presenceKey = `presence:${userId}`;
            const presenceData = await redisClient.get(presenceKey);

            if (!presenceData) {
                return null;
            }

            const presence: UserPresence = JSON.parse(presenceData);
            const now = new Date().getTime();
            const lastSeen = new Date(presence.lastSeen).getTime();

            // Update isOnline based on time threshold
            presence.isOnline = presence.isOnline && (now - lastSeen) < this.OFFLINE_THRESHOLD;

            return presence;
        } catch (error) {
            logger.error('👥 UserPresenceService: Error getting user presence:', error);
            return null;
        }
    }

    /**
     * Check online status for multiple users
     */
    static async getUsersOnlineStatus(userIds: string[]): Promise<Record<string, boolean>> {
        const status: Record<string, boolean> = {};

        try {
            // Use pipeline for better performance
            const pipeline = redisClient.pipeline();
            userIds.forEach(userId => {
                pipeline.get(`presence:${userId}`);
            });

            const results = await pipeline.exec();

            userIds.forEach((userId, index) => {
                const result = results?.[index];
                if (result && result[1]) {
                    try {
                        const presence: UserPresence = JSON.parse(result[1] as string);
                        const now = new Date().getTime();
                        const lastSeen = new Date(presence.lastSeen).getTime();
                        status[userId] = presence.isOnline && (now - lastSeen) < this.OFFLINE_THRESHOLD;
                    } catch (parseError) {
                        status[userId] = false;
                    }
                } else {
                    status[userId] = false;
                }
            });
        } catch (error) {
            logger.error('👥 UserPresenceService: Error checking multiple users status:', error);
            // Set all to false on error
            userIds.forEach(userId => {
                status[userId] = false;
            });
        }

        return status;
    }

    /**
     * Get time since user was last seen (in minutes)
     */
    static async getTimeSinceLastSeen(userId: string): Promise<number | null> {
        try {
            const presence = await this.getUserPresence(userId);
            if (!presence) {
                return null;
            }

            const now = new Date().getTime();
            const lastSeen = new Date(presence.lastSeen).getTime();
            return Math.floor((now - lastSeen) / 60000); // Convert to minutes
        } catch (error) {
            logger.error('👥 UserPresenceService: Error getting time since last seen:', error);
            return null;
        }
    }

    /**
     * Heartbeat method for maintaining user presence
     * Should be called periodically by clients
     */
    static async heartbeat(userId: string, deviceType?: 'web' | 'mobile' | 'desktop'): Promise<void> {
        await this.updateUserPresence(userId, deviceType || 'web');
    }

    /**
     * Get presence statistics
     */
    static async getPresenceStats(): Promise<PresenceStats> {
        try {
            const keys = await redisClient.keys('presence:*');
            const stats: PresenceStats = {
                totalOnline: 0,
                recentlyOffline: 0,
                totalTracked: keys.length
            };

            if (keys.length === 0) {
                return stats;
            }

            const pipeline = redisClient.pipeline();
            keys.forEach(key => pipeline.get(key));
            const results = await pipeline.exec();

            const now = new Date().getTime();

            results?.forEach(result => {
                if (result && result[1]) {
                    try {
                        const presence: UserPresence = JSON.parse(result[1] as string);
                        const lastSeen = new Date(presence.lastSeen).getTime();
                        const timeDiff = now - lastSeen;

                        if (presence.isOnline && timeDiff < this.OFFLINE_THRESHOLD) {
                            stats.totalOnline++;
                        } else if (timeDiff < this.OFFLINE_THRESHOLD) {
                            stats.recentlyOffline++;
                        }
                    } catch (parseError) {
                        // Skip invalid entries
                    }
                }
            });

            return stats;
        } catch (error) {
            logger.error('👥 UserPresenceService: Error getting presence stats:', error);
            return { totalOnline: 0, recentlyOffline: 0, totalTracked: 0 };
        }
    }

    /**
     * Clean up expired presence data
     */
    private static async cleanupExpiredPresence(): Promise<number> {
        try {
            const keys = await redisClient.keys('presence:*');
            let cleanedCount = 0;

            if (keys.length === 0) {
                return 0;
            }

            const pipeline = redisClient.pipeline();
            keys.forEach(key => pipeline.get(key));
            const results = await pipeline.exec();

            const now = new Date().getTime();
            const expiredKeys: string[] = [];

            results?.forEach((result, index) => {
                if (result && result[1]) {
                    try {
                        const presence: UserPresence = JSON.parse(result[1] as string);
                        const lastSeen = new Date(presence.lastSeen).getTime();

                        // Remove if offline for more than 10 minutes
                        if (now - lastSeen > 600000) {
                            expiredKeys.push(keys[index]);
                        }
                    } catch (parseError) {
                        // Remove invalid entries
                        expiredKeys.push(keys[index]);
                    }
                }
            });

            if (expiredKeys.length > 0) {
                await redisClient.del(...expiredKeys);
                cleanedCount = expiredKeys.length;
                logger.info(`👥 UserPresenceService: Cleaned up ${cleanedCount} expired presence entries`);
            }

            return cleanedCount;
        } catch (error) {
            logger.error('👥 UserPresenceService: Error during cleanup:', error);
            return 0;
        }
    }

    /**
     * Start periodic cleanup timer
     */
    private static startCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        this.cleanupTimer = setInterval(async () => {
            await this.cleanupExpiredPresence();
        }, this.CLEANUP_INTERVAL);
    }

    /**
     * Stop cleanup timer (for shutdown)
     */
    static stopCleanupTimer(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
            logger.info('👥 UserPresenceService: Cleanup timer stopped');
        }
    }

    /**
     * Shutdown the service
     */
    static shutdown(): void {
        this.stopCleanupTimer();
        logger.info('👥 UserPresenceService: Shutdown complete');
    }
}

export default UserPresenceService;