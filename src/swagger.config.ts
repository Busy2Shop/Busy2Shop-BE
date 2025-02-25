import swaggerJsdoc from 'swagger-jsdoc';
import * as path from 'node:path';

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
                url: 'http://localhost:8000/api/v0',
                description: 'Development server',
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