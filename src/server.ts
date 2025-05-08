import app from './app';
import { initiateDB } from './models';
import { logger } from './utils/logger';
import { redisClient, redisPubClient, redisSubClient } from './utils/redis';
import http from 'http';
import SocketConfig from './clients/socket/index.config';
import { NODE_ENV, PORT } from './utils/constants';
import queues from './queues';


// Create the HTTP server
const server = http.createServer(app);

// Configure server timeout
server.timeout = 60000; // 60 seconds

// Asynchronous function to start the server
async function startServer(): Promise<void> {
    try {
        // Initiate a connection to the database
        await initiateDB();

        // Initialize Socket.IO
        new SocketConfig(server);
        logger.info('Chat Client initialized');

        // Start the server and listen on the configured port
        const port = PORT || 8090;
        server.listen(port, () => {
            queues.initializeRecurringJobs(app);

            const address = server.address();
            const host = typeof address === 'string' ? 'localhost' : address?.address ?? 'localhost';
            const protocol = NODE_ENV === 'production' ? 'https' : 'http';
            const hostname = host === '::' ? 'localhost' : host;

            logger.info(`Server is running in ${NODE_ENV} mode`);
            logger.info(`Server is running on Port ${port}`);
            logger.info(`Server URL: ${protocol}://${hostname}:${port}`);
            logger.info(`Swagger documentation available at: ${protocol}://${hostname}:${port}/api-docs`);
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
        process.on('SIGTERM', () => {
            logger.info('SIGTERM received. Shutting down gracefully');
            server.close(() => {
                logger.info('Process terminated');
                process.exit(0);
            });
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
        process.exit(1);
    }
}

// Call the function to start the server
(async () => {
    await startServer();
})();