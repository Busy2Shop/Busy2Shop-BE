// Import necessary modules from Sequelize-typescript
import { Sequelize } from 'sequelize-typescript';
import { logger } from '../utils/logger';
import { DB_CONFIG, NODE_ENV } from '../utils/constants';

// Function to create the Sequelize instance with IAM auth token for production
async function createSequelizeInstance(): Promise<Sequelize> {
    if (NODE_ENV === 'production') {
        return new Sequelize(DB_CONFIG.URL, {
            logging: false,
            dialect: 'postgres',
            pool: {
                max: 5,
                min: 1,
                idle: 10000,
                acquire: 60000,
            },
            retry: {
                max: 5, // Add retry logic
            },
            dialectOptions: {
                ssl: {
                    require: true,
                    rejectUnauthorized: false,
                },
                keepAlive: true,
            },
        });
    } else {
        return new Sequelize(DB_CONFIG.URL, {
            logging: false,
            dialect: 'postgres',
            pool: {
                max: 5,
                min: 1,
                idle: 10000,
            },
        });
    }
}

let Database: Sequelize;

// Asynchronous function to initiate the database connection
async function initiateDB(): Promise<void> {
    try {
        Database = await createSequelizeInstance();

        // Attempt to authenticate the database connection
        await Database.authenticate();

        // add a hook to sort all queries by UpdatedAt to return the latest first
        // Database.addHook('beforeFind', (options) => {
        //     options.order = [['updatedAt', 'DESC']];
        // });

        // add hook to remove whitespaces from all string attributes
        Database.addHook('beforeValidate', instance => {
            if (instance?.dataValues) {
                Object.keys(instance.dataValues).forEach(key => {
                    if (typeof instance.dataValues[key] === 'string') {
                        instance.dataValues[key] = instance.dataValues[key].trim();
                    }
                });
            }
        });

        // Add all Sequelize models in the specified directory for ts files
        Database.addModels([__dirname + '/**/*.model.ts']);

        // Add all Sequelize models in the specified directory for js files
        Database.addModels([__dirname + '/**/*.model.js']);

        // Log a success message when the connection is established
        logger.info(`Postgres Connection has been established successfully -- ${NODE_ENV}`);

        // Synchronize the database (you may want to add options like force: true to reset the database)
        // await Database.sync({ alter: true });
        await Database.sync();
        logger.info('Database Sync Completed');
    } catch (error) {
        // console.log(error);
        // Handle errors if unable to connect to the database
        logger.error('Unable to connect to the database:', error);
    }
}

export { Sequelize, Database, initiateDB };
