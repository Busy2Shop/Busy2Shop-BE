import swaggerJsdoc from 'swagger-jsdoc';
import * as path from 'node:path';
import { PORT, NODE_ENV } from './utils/constants';
import { Request } from 'express';
import fs from 'fs';

// Determine the API patterns to include based on environment
const getApiPatterns = () => {
    // In production, the file paths may be different due to transpilation
    if (NODE_ENV === 'production') {
        return [
            // For JavaScript files in production
            path.join(__dirname, './docs/*.yaml'),
            path.join(__dirname, './routes/**/*.js'),
            path.join(__dirname, './routes/*.js'),
            // Include both JS and TS patterns to be safe
            path.join(__dirname, './routes/**/*.ts'),
            path.join(__dirname, './routes/*.ts'),
        ];
    }

    // Default patterns for development
    return [
        path.join(__dirname, './docs/*.yaml'),
        path.join(__dirname, './routes/**/*.ts'),
        path.join(__dirname, './routes/*.ts'),
    ];
};

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
    apis: getApiPatterns(),
};

// Debugging - log the paths being checked
if (NODE_ENV === 'production') {
    console.log('Swagger API patterns:', options.apis);

    // Check if files exist at these paths
    options.apis.forEach(pattern => {
        try {
            const dir = path.dirname(pattern);
            const filePattern = path.basename(pattern);
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir).filter(file =>
                    new RegExp(filePattern.replace('*', '.*')).test(file)
                );
                console.log(`Files matching ${pattern}:`, files);
            } else {
                console.log(`Directory does not exist: ${dir}`);
            }
        } catch (error) {
            console.error(`Error checking path ${pattern}:`, error);
        }
    });
}

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

    // Debug output in production
    if (NODE_ENV === 'production') {
        console.log('Routes defined in spec:', Object.keys(updatedSpecs.paths || {}).length);
    }

    return updatedSpecs;
};