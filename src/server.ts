import app from './app';
import { initiateDB } from './models';
import { logger } from './utils/logger';
import { redisClient, redisPubClient, redisSubClient } from './utils/redis';
import http from 'http';
import SocketConfig from './clients/socket/index.config';

// Create the HTTP server
const server = http.createServer(app);

// Asynchronous function to start the server
async function startServer(): Promise<void> {
    try {
        // Initiate a connection to the database
        await initiateDB();

        // Initialize Socket.IO
        new SocketConfig(server);
        logger.info('Chat Client initialized');

        // Start the server and listen on port 8080
        server.listen(process.env.PORT ?? 8090, () => {
            logger.info(`Server is running on Port ${process.env.PORT ?? 8088}`);
        });
    } catch (err) {
        console.log(err);
        logger.error(err);

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

        // Exit the process with a non-zero status code to indicate an error
        process.exit(1);
    }
}

// Call the function to start the server
(async () => {
    await startServer();
})();