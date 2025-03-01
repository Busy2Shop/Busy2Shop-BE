import Redis from 'ioredis';
import { logger } from './logger';
import { REDIS_CONNECTION_URL } from './constants';

// Create Redis clients
const redisClient = new Redis(REDIS_CONNECTION_URL);
const redisPubClient = new Redis(REDIS_CONNECTION_URL);
const redisSubClient = new Redis(REDIS_CONNECTION_URL);

// Track connection status
const connectionStatus = {
    main: false,
    pub: false,
    sub: false,
};

// Function to check if all clients are connected
function checkAllConnected() {
    if (connectionStatus.main && connectionStatus.pub && connectionStatus.sub) {
        logger.info('All Redis connections established successfully');
    }
}

// Handle connection errors
redisClient.on('error', (error) => {
    connectionStatus.main = false;
    logger.error('Redis client error:', error);
});

redisPubClient.on('error', (error) => {
    connectionStatus.pub = false;
    logger.error('Redis pub client error:', error);
});

redisSubClient.on('error', (error) => {
    connectionStatus.sub = false;
    logger.error('Redis sub client error:', error);
});

// Handle successful connections
redisClient.on('connect', () => {
    connectionStatus.main = true;
    checkAllConnected();
});

redisPubClient.on('connect', () => {
    connectionStatus.pub = true;
    checkAllConnected();
});

redisSubClient.on('connect', () => {
    connectionStatus.sub = true;
    checkAllConnected();
});

export { redisClient, redisPubClient, redisSubClient };