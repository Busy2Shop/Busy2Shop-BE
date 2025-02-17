import app from './app';
import { initiateDB } from './models';
import { logger } from './utils/logger';
import { redisClient } from './utils/redis';

// Asynchronous function to start the server
async function startServer(): Promise<void> {
    try {      
        await redisClient.on('connect', () => {
            logger.info('Connection to REDIS database successful');
        });
        // Initiate a connection to the database
        await initiateDB();

        // Start the server and listen on port 8080
        app.listen(process.env.PORT || 8090, () => {
            logger.info(`Server is running on Port ${process.env.PORT || 8088}`);
        });
    } catch (err) {
        console.log(err);
        logger.error(err);
        // exit redis client
        redisClient.quit((err, result) => {
            if (err) {
                console.error('Error quitting Redis:', err);
            } else {
                console.log('Redis instance has been stopped:', result);
            }
        });
        // Exit the process with a non-zero status code to indicate an error
        process.exit(1);
    }
}

// Call the function to start the server
startServer();