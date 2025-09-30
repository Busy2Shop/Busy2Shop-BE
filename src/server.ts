import app from './app';
import { initiateDB } from './models';
import { logger } from './utils/logger';
// import { redisClient, redisPubClient, redisSubClient, testRedisConnection, getRedisStatus, redisHealthCheck } from './utils/redis';
import { redisClient, redisPubClient, redisSubClient } from './utils/redis';
import http from 'http';
import SocketConfig from './clients/socket/index.config';
import { NODE_ENV, PORT } from './utils/constants';
import queues, { gracefulShutdown as shutdownQueues } from './queues';
import UserPresenceService from './services/user-presence.service';
import SmartNotificationDispatcher from './services/smart-notification.dispatcher';

// Create the HTTP server
const server = http.createServer(app);

// Configure server timeout
server.timeout = 60000; // 60 seconds

// Asynchronous function to start the server
async function startServer(): Promise<void> {
    try {
        // Initiate a connection to the database
        await initiateDB();

        // // Test Redis connection before proceeding
        // logger.info('🔍 Testing Redis connection...');
        // const redisConnected = await testRedisConnection();
        
        // if (!redisConnected) {
        //     logger.warn('⚠️ Redis connection failed - server will continue but some features may be limited');
        //     // Log Redis status for debugging
        //     const status = getRedisStatus();
        //     logger.warn('Redis Status:', JSON.stringify(status, null, 2));
        // } else {
        //     logger.info('✅ Redis connection verified successfully');
        //     // Log a health check for good measure
        //     const health = await redisHealthCheck();
        //     logger.info('📊 Redis Health Check:', JSON.stringify(health, null, 2));
        // }

        // Initialize Socket.IO
        new SocketConfig(server);
        logger.info('Chat Client initialized');

        // Initialize smart notification services
        UserPresenceService.initialize();
        SmartNotificationDispatcher.initialize();
        logger.info('📧 Smart notification system initialized');

        // Initialize queue system and recurring jobs
        queues.initializeRecurringJobs(app);

        // Start the server and listen on the configured port
        const port = PORT || 8090;
        server.listen(port, () => {
            const address = server.address();
            const host =
                typeof address === 'string' ? 'localhost' : (address?.address ?? 'localhost');
            const protocol = NODE_ENV === 'production' ? 'https' : 'http';
            const hostname = host === '::' ? 'localhost' : host;

            logger.info(
                `Swagger documentation available at: ${protocol}://${hostname}:${port}/api-docs`,
            );
            logger.info(`Server is running on Port ${port} -- ${NODE_ENV} mode `);
        });

        // Handle server errors
        server.on('error', (error: { code?: string; message: string }) => {
            logger.error('Server error:', error);
            if (error.code === 'EADDRINUSE') {
                logger.error(`Port ${port} is already in use`);
                process.exit(1);
            }
        });

        // Handle process termination
        process.on('SIGTERM', async () => {
            logger.info('SIGTERM received. Shutting down gracefully');

            // First, close the HTTP server to stop accepting new connections
            server.close(async () => {
                try {
                    // Shut down smart notification services
                    UserPresenceService.shutdown();
                    SmartNotificationDispatcher.shutdown();
                    logger.info('📧 Smart notification system shut down successfully');

                    // Then shut down queues gracefully
                    await shutdownQueues();
                    logger.info('Queue system shut down successfully');

                    // Finally close Redis connections
                    await Promise.all([
                        redisClient.quit(),
                        redisPubClient.quit(),
                        redisSubClient.quit(),
                    ]);
                    logger.info('Redis connections closed successfully');

                    logger.info('Process terminated gracefully');
                    process.exit(0);
                } catch (error) {
                    logger.error('Error during graceful shutdown:', error);
                    process.exit(1);
                }
            });

            // Safety timeout - force exit after 10 seconds if graceful shutdown fails
            setTimeout(() => {
                logger.error('Graceful shutdown timed out after 10s, forcing exit');
                process.exit(1);
            }, 10000);
        });

        // Also handle SIGINT (Ctrl+C)
        process.on('SIGINT', async () => {
            logger.info('SIGINT received. Shutting down gracefully');
            server.close(async () => {
                try {
                    await shutdownQueues();
                    await Promise.all([
                        redisClient.quit(),
                        redisPubClient.quit(),
                        redisSubClient.quit(),
                    ]);
                    logger.info('Process terminated');
                    process.exit(0);
                } catch (error) {
                    logger.error('Error during shutdown:', error);
                    process.exit(1);
                }
            });

            setTimeout(() => {
                logger.error('Graceful shutdown timed out, forcing exit');
                process.exit(1);
            }, 10000);
        });
    } catch (err) {
        logger.error('Server startup error:', err);

        // Clean up Redis connections
        const closeRedis = async () => {
            try {
                await Promise.all([
                    redisClient.quit(),
                    redisPubClient.quit(),
                    redisSubClient.quit(),
                ]);
                logger.info('All Redis instances have been stopped');
            } catch (redisErr) {
                logger.error('Error closing Redis connections:', redisErr);
            }
        };

        await closeRedis();
        await shutdownQueues().catch(queueErr => {
            logger.error('Error closing queue connections:', queueErr);
        });

        process.exit(1);
    }
}

// Call the function to start the server
(async () => {
    await startServer();
})();
