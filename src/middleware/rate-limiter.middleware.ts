import { redisClient } from '../utils/redis';
import { logger } from '../utils/logger';

export interface RateLimitConfig {
    windowMs: number; // Time window in milliseconds
    max: number; // Maximum number of requests in window
    message?: string; // Custom error message
}

/**
 * Rate Limiter using Redis Sorted Sets
 * More efficient than scanning keys - O(log N) instead of O(N)
 */
export class RateLimiter {
    private config: RateLimitConfig;
    private keyPrefix: string;

    constructor(keyPrefix: string, config: RateLimitConfig) {
        this.keyPrefix = keyPrefix;
        this.config = {
            message: 'Rate limit exceeded. Please try again later.',
            ...config,
        };
    }

    /**
     * Check if user is within rate limit
     * @param userId - User ID to check
     * @returns true if allowed, false if rate limited
     */
    async checkLimit(userId: string): Promise<boolean> {
        const key = `rate-limit:${this.keyPrefix}:${userId}`;
        const now = Date.now();
        const windowStart = now - this.config.windowMs;

        try {
            // Remove old entries outside the current time window
            await redisClient.zremrangebyscore(key, 0, windowStart);

            // Count current entries in window
            const count = await redisClient.zcard(key);

            if (count >= this.config.max) {
                logger.warn(`Rate limit exceeded for user ${userId} on ${this.keyPrefix}`, {
                    count,
                    max: this.config.max,
                    window: this.config.windowMs,
                });
                return false; // Rate limit exceeded
            }

            // Add current request timestamp
            const score = now;
            const member = `${now}-${Math.random().toString(36).substring(7)}`;
            await redisClient.zadd(key, score, member);

            // Set expiration (cleanup old keys)
            const ttl = Math.ceil(this.config.windowMs / 1000) + 10; // +10s buffer
            await redisClient.expire(key, ttl);

            return true; // Request allowed
        } catch (error) {
            logger.error('Rate limiter error (failing open):', error);
            // Fail open - allow request on Redis error (better UX than blocking all users)
            return true;
        }
    }

    /**
     * Get current count for a user
     * @param userId - User ID to check
     * @returns Number of requests in current window
     */
    async getCurrentCount(userId: string): Promise<number> {
        const key = `rate-limit:${this.keyPrefix}:${userId}`;
        const now = Date.now();
        const windowStart = now - this.config.windowMs;

        try {
            await redisClient.zremrangebyscore(key, 0, windowStart);
            return await redisClient.zcard(key);
        } catch (error) {
            logger.error('Error getting rate limit count:', error);
            return 0;
        }
    }

    /**
     * Reset rate limit for a user (admin use)
     * @param userId - User ID to reset
     */
    async reset(userId: string): Promise<void> {
        const key = `rate-limit:${this.keyPrefix}:${userId}`;
        try {
            await redisClient.del(key);
            logger.info(`Rate limit reset for user ${userId} on ${this.keyPrefix}`);
        } catch (error) {
            logger.error('Error resetting rate limit:', error);
        }
    }

    /**
     * Get time until rate limit resets (in milliseconds)
     * @param userId - User ID to check
     * @returns Milliseconds until reset, or 0 if not rate limited
     */
    async getTimeUntilReset(userId: string): Promise<number> {
        const key = `rate-limit:${this.keyPrefix}:${userId}`;
        const now = Date.now();

        try {
            // Get oldest entry in window
            const oldest = await redisClient.zrange(key, 0, 0, 'WITHSCORES');
            if (oldest.length === 0) {
                return 0; // No entries
            }

            const oldestTimestamp = parseInt(oldest[1], 10);
            const resetTime = oldestTimestamp + this.config.windowMs;
            return Math.max(0, resetTime - now);
        } catch (error) {
            logger.error('Error getting reset time:', error);
            return 0;
        }
    }
}

// Pre-configured rate limiters for common use cases
export const callRateLimiter = new RateLimiter('call-initiate', {
    windowMs: 60000, // 1 minute
    max: 10, // 10 calls per minute per user
    message: 'Too many call attempts. Please wait before trying again.',
});

export const messageRateLimiter = new RateLimiter('message-send', {
    windowMs: 60000, // 1 minute
    max: 60, // 60 messages per minute
    message: 'You are sending messages too quickly. Please slow down.',
});

export const authRateLimiter = new RateLimiter('auth-attempt', {
    windowMs: 300000, // 5 minutes
    max: 5, // 5 auth attempts per 5 minutes
    message: 'Too many authentication attempts. Please wait 5 minutes.',
});
