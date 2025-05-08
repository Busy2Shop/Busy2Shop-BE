import swaggerJsdoc from 'swagger-jsdoc';
import * as path from 'node:path';
import { PORT, NODE_ENV } from './utils/constants';
import { Request } from 'express';
import fs from 'fs';

// Determine the API patterns to include based on the environment
const getApiPatterns = () => {
    // In production, compiled JS files are used
    if (NODE_ENV === 'production') {
        return [
            // For YAML files - create this directory if it doesn't exist
            path.join(__dirname, './docs/*.yaml'),
            // For JavaScript files in production - focus on .js only
            path.join(__dirname, './routes/*.js'),
        ];
    }

    // Default patterns for development - TypeScript files
    return [path.join(__dirname, './docs/*.yaml'), path.join(__dirname, './routes/*.ts')];
};

// Initial swagger options
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

// Check if files exist at these paths and log their content structure
options.apis.forEach(pattern => {
    try {
        const dir = path.dirname(pattern);
        const filePattern = path.basename(pattern);

        if (fs.existsSync(dir)) {
            const files = fs
                .readdirSync(dir)
                .filter(file => new RegExp(filePattern.replace('*', '.*')).test(file));
            console.log(`Files matching ${pattern}:`, files);

            // For each JavaScript file, check if it contains JSDoc comments
            if (filePattern.endsWith('.js') && files.length > 0) {
                const sampleFile = path.join(dir, files[0]);
                if (fs.existsSync(sampleFile)) {
                    const content = fs.readFileSync(sampleFile, 'utf8');
                    const hasJsDocComments =
                        (content.includes('/**') && content.includes('@swagger')) ||
                        content.includes('@openapi');
                    console.log(
                        `Sample file ${files[0]} contains JSDoc swagger comments: ${hasJsDocComments}`,
                    );
                }
            }
        } else {
            console.log(`Directory does not exist: ${dir}`);
        }
    } catch (error) {
        console.error(`Error checking path ${pattern}:`, error);
    }
});

// Generate the Swagger spec
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

    // Debug output
    console.log('Routes defined in spec:', Object.keys(updatedSpecs.paths || {}).length);
    if (Object.keys(updatedSpecs.paths || {}).length === 0) {
        console.warn('WARNING: No API routes found in the Swagger specification!');
        console.warn(
            'Check that your route files contain proper JSDoc annotations with @swagger or @openapi tags.',
        );
    }

    return updatedSpecs;
};
