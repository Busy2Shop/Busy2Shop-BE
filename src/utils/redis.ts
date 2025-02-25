import Redis from 'ioredis';
import { logger } from './logger';
import { REDIS_CONNECTION_URL } from './constants';

// const tlsOptions = {
//     rejectUnauthorized: true,
// };

// const redisClient = new Redis(REDIS_CONNECTION_URL, { tls: tlsOptions });
const redisClient = new Redis(REDIS_CONNECTION_URL);
redisClient.on('error', (error) => {
    logger.info('An error occurred while connecting to REDIS', error);
    process.exit(1);
});

export { redisClient };