import swaggerJsdoc from 'swagger-jsdoc';
import * as path from 'node:path';
import { PORT } from './utils/constants';
import { Request } from 'express';

// Initial swagger options with placeholder URL that will be dynamically updated
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
                url: '{protocol}://{host}/api/v0',
                description: 'Current environment',
                variables: {
                    protocol: {
                        default: 'http',
                    },
                    host: {
                        default: `localhost:${PORT}`,
                    },
                },
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

// Generate the base Swagger spec
export const specs = swaggerJsdoc(options);

// Function to update the Swagger host based on the current request
export const updateSwaggerHost = (req: Request) => {
    // Create a fresh copy of the specs to avoid modifying the original
    const updatedSpecs = JSON.parse(JSON.stringify(specs));

    if (req && updatedSpecs.servers && updatedSpecs.servers.length > 0) {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.headers['x-forwarded-host'] || req.headers.host;

        // Update server URL directly with the detected values
        updatedSpecs.servers[0].url = `${protocol}://${host}/api/v0`;

        // Update the variables too for completeness
        if (updatedSpecs.servers[0].variables) {
            updatedSpecs.servers[0].variables.protocol.default = protocol;
            updatedSpecs.servers[0].variables.host.default = host;
        }
    }

    return updatedSpecs;
};