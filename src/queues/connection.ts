import { ConnectionOptions } from 'bullmq';
import { REDIS_CONNECTION_URL } from '../utils/constants';
// BullMQ specific Redis configuration
export const connection: ConnectionOptions = {
    url: REDIS_CONNECTION_URL,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
    keyPrefix: 'busy2shop',
};
