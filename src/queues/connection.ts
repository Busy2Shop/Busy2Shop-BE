import { ConnectionOptions } from 'bullmq';
import { REDIS_CONNECTION_URL } from '../utils/constants';

// BullMQ specific Redis configuration with improved stability
export const connection: ConnectionOptions = {
    url: REDIS_CONNECTION_URL,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => Math.min(times * 100, 5000), // More aggressive retry
    keyPrefix: 'bull:', // Use standard BullMQ prefix to avoid conflicts
    lazyConnect: true,
    keepAlive: 60000, // Longer keepalive
    connectTimeout: 120000, // 2 minutes timeout
    commandTimeout: 30000, // 30 seconds command timeout
    // Add Redis settings to prevent job cleanup issues
    db: 0,
    family: 4,
    // Enable features needed for BullMQ stability
    enableAutoPipelining: false,
    enableOfflineQueue: true, // Enable offline queue to handle connection issues
};
