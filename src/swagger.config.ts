import swaggerJsdoc from 'swagger-jsdoc';
import * as path from 'node:path';
import { PORT, NODE_ENV } from './utils/constants';

// Determine the base URL based on environment
const getBaseUrl = () => {
    if (NODE_ENV === 'production') {
        // For production, use the server's actual URL
        return process.env.WEBSITE_URL ?? 'https://busy2shop-production.up.railway.app';
    }
    // For development, use localhost with the configured port
    return `http://localhost:${PORT}`;
};

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Busy2Shop API Documentation',
            version: '1.0.0',
            description: 'API documentation for Busy2Shop e-commerce platform',
            contact: {
                name: 'API Support',
                email: 'support@busy2shop.com',
            },
        },
        servers: [
            {
                url: `${getBaseUrl()}/api/v0`,
                description: `${NODE_ENV.charAt(0).toUpperCase() + NODE_ENV.slice(1)} server`,
            },
        ],
        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
    },
    apis: [
        path.join(__dirname, './docs/*.yaml'),
        path.join(__dirname, './routes/**/*.ts'),
        path.join(__dirname, './routes/*.ts'),
    ],
};

export const specs = swaggerJsdoc(options);