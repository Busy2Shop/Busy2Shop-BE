import Redis from 'ioredis';
import { logger } from './logger';
import { REDIS_CONNECTION_URL } from './constants';

// Redis configuration with proper retry and connection options
const redisConfig = {
    connectTimeout: 60000, // 60 seconds
    lazyConnect: true,
    maxRetriesPerRequest: 5,
    enableReadyCheck: true,
    retryDelayOnError: (times: number) => Math.min(times * 50, 2000),
    // Family: 0 means to use both IPv6 and IPv4
    family: 4,
    keepAlive: 30000,
    // Enable offline queue to handle commands while connecting
    enableOfflineQueue: true,
    // Command timeout
    commandTimeout: 5000,
    // DB selection
    db: 0,
};

// Create Redis clients with proper error handling
let redisClient: Redis;
let redisPubClient: Redis;
let redisSubClient: Redis;

// Connection status tracking
const connectionStatus = {
    main: false,
    pub: false,
    sub: false,
    lastConnected: null as Date | null,
    reconnectAttempts: 0,
};

// Initialize Redis clients with error handling
function initializeRedisClients() {
    try {
        if (!REDIS_CONNECTION_URL) {
            logger.error('REDIS_CONNECTION_URL is not configured');
            return false;
        }

        // Log the sanitized connection URL (without password)
        const sanitizedUrl = REDIS_CONNECTION_URL.replace(/:([^@]+)@/, ':****@');
        logger.info(`Attempting to connect to Redis: ${sanitizedUrl}`);

        redisClient = new Redis(REDIS_CONNECTION_URL, redisConfig);

        redisPubClient = new Redis(REDIS_CONNECTION_URL, redisConfig);

        redisSubClient = new Redis(REDIS_CONNECTION_URL, redisConfig);

        setupEventListeners();
        return true;
    } catch (error) {
        logger.error('Failed to initialize Redis clients:', error);
        return false;
    }
}

// Setup event listeners for all Redis clients
function setupEventListeners() {
    // Main Redis client events
    redisClient.on('connect', () => {
        connectionStatus.main = true;
        connectionStatus.lastConnected = new Date();
        connectionStatus.reconnectAttempts = 0;
        logger.info('Redis main client connected successfully');
        checkAllConnected();
    });

    redisClient.on('ready', () => {
        logger.info('Redis main client ready to receive commands');
    });

    redisClient.on('error', (error) => {
        connectionStatus.main = false;
        logger.error('Redis main client error:', error.message);
        handleRedisError('main', error);
    });

    redisClient.on('close', () => {
        connectionStatus.main = false;
        logger.warn('Redis main client connection closed');
    });

    redisClient.on('reconnecting', (times: number) => {
        connectionStatus.reconnectAttempts = times;
        logger.info(`Redis main client reconnecting... (attempt ${times})`);
    });

    // Pub client events
    redisPubClient.on('connect', () => {
        connectionStatus.pub = true;
        logger.info('Redis pub client connected successfully');
        checkAllConnected();
    });

    redisPubClient.on('error', (error) => {
        connectionStatus.pub = false;
        logger.error('Redis pub client error:', error.message);
        handleRedisError('pub', error);
    });

    redisPubClient.on('close', () => {
        connectionStatus.pub = false;
        logger.warn('Redis pub client connection closed');
    });

    // Sub client events
    redisSubClient.on('connect', () => {
        connectionStatus.sub = true;
        logger.info('Redis sub client connected successfully');
        checkAllConnected();
    });

    redisSubClient.on('error', (error) => {
        connectionStatus.sub = false;
        logger.error('Redis sub client error:', error.message);
        handleRedisError('sub', error);
    });

    redisSubClient.on('close', () => {
        connectionStatus.sub = false;
        logger.warn('Redis sub client connection closed');
    });
}

// Function to check if all clients are connected
function checkAllConnected() {
    if (connectionStatus.main && connectionStatus.pub && connectionStatus.sub) {
        logger.info('🔗 All Redis connections established successfully');
        return true;
    }
    return false;
}

// Enhanced error handling
function handleRedisError(clientType: string, error: any) {
    const errorCode = error.code;
    const errorMessage = error.message;

    switch (errorCode) {
        case 'ENOTFOUND':
            logger.error(`Redis ${clientType}: DNS resolution failed - ${errorMessage}`);
            break;
        case 'ECONNREFUSED':
            logger.error(`Redis ${clientType}: Connection refused - ${errorMessage}`);
            break;
        case 'ETIMEDOUT':
            logger.error(`Redis ${clientType}: Connection timeout - ${errorMessage}`);
            break;
        case 'ENOENT':
            logger.error(`Redis ${clientType}: Invalid connection string format - ${errorMessage}`);
            break;
        case 'NOAUTH':
            logger.error(`Redis ${clientType}: Authentication failed - ${errorMessage}`);
            break;
        default:
            logger.error(`Redis ${clientType}: Unexpected error (${errorCode}) - ${errorMessage}`);
    }
}

// Function to test Redis connection
async function testRedisConnection(): Promise<boolean> {
    try {
        if (!redisClient) {
            logger.error('Redis client not initialized');
            return false;
        }

        // Connect if not already connected
        if (redisClient.status !== 'ready') {
            await redisClient.connect();
        }

        // Test with a simple ping
        const result = await redisClient.ping();
        if (result === 'PONG') {
            logger.info('✅ Redis connection test successful');
            return true;
        } else {
            logger.error('❌ Redis connection test failed - unexpected response:', result);
            return false;
        }
    } catch (error) {
        logger.error('❌ Redis connection test failed:', error);
        return false;
    }
}

// Function to get Redis connection status
function getRedisStatus() {
    return {
        isConnected: connectionStatus.main && connectionStatus.pub && connectionStatus.sub,
        clients: {
            main: connectionStatus.main,
            pub: connectionStatus.pub,
            sub: connectionStatus.sub,
        },
        lastConnected: connectionStatus.lastConnected,
        reconnectAttempts: connectionStatus.reconnectAttempts,
        clientStatus: redisClient ? redisClient.status : 'not_initialized',
    };
}

// Function to gracefully disconnect all Redis clients
async function disconnectRedis(): Promise<void> {
    try {
        logger.info('Disconnecting Redis clients...');
        
        if (redisClient) {
            await redisClient.quit();
            logger.info('Redis main client disconnected');
        }
        
        if (redisPubClient) {
            await redisPubClient.quit();
            logger.info('Redis pub client disconnected');
        }
        
        if (redisSubClient) {
            await redisSubClient.quit();
            logger.info('Redis sub client disconnected');
        }

        // Reset connection status
        connectionStatus.main = false;
        connectionStatus.pub = false;
        connectionStatus.sub = false;
        
        logger.info('All Redis clients disconnected gracefully');
    } catch (error) {
        logger.error('Error during Redis disconnection:', error);
    }
}

// Function to reconnect all Redis clients
async function reconnectRedis(): Promise<boolean> {
    try {
        logger.info('Attempting to reconnect Redis clients...');
        
        // Disconnect first
        await disconnectRedis();
        
        // Wait a bit before reconnecting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Reinitialize clients
        const initialized = initializeRedisClients();
        if (!initialized) {
            logger.error('Failed to reinitialize Redis clients');
            return false;
        }

        // Test the connection
        const connected = await testRedisConnection();
        if (connected) {
            logger.info('✅ Redis reconnection successful');
            return true;
        } else {
            logger.error('❌ Redis reconnection failed');
            return false;
        }
    } catch (error) {
        logger.error('Error during Redis reconnection:', error);
        return false;
    }
}

// Initialize clients on module load
const initialized = initializeRedisClients();
if (!initialized) {
    logger.error('Failed to initialize Redis clients on startup');
}

// Health check function that can be used by monitoring systems
async function redisHealthCheck(): Promise<{ status: string; details: any }> {
    try {
        const status = getRedisStatus();
        const connectionTest = await testRedisConnection();
        
        return {
            status: connectionTest && status.isConnected ? 'healthy' : 'unhealthy',
            details: {
                ...status,
                connectionTest,
                timestamp: new Date().toISOString(),
            },
        };
    } catch (error: any) {
        return {
            status: 'unhealthy',
            details: {
                error: error?.message || 'Unknown error',
                timestamp: new Date().toISOString(),
            },
        };
    }
}

// Export clients and utility functions
export { 
    redisClient, 
    redisPubClient, 
    redisSubClient,
    testRedisConnection,
    getRedisStatus,
    disconnectRedis,
    reconnectRedis,
    redisHealthCheck,
};

// Export connection status for external monitoring
export { connectionStatus };