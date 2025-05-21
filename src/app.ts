import 'express-async-errors';
import express, { Request, Response, NextFunction } from 'express';
import Middlewares from './middlewares/errorHandlers';
// import bodyParser from 'body-parser';
import cors from 'cors';
import expressWinston from 'express-winston';
import { logger } from './utils/logger';
import router from './routes';
import morgan from 'morgan';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import swaggerUi from 'swagger-ui-express';
import { updateSwaggerHost } from './swagger.config';
import passport from 'passport';
import { getServerHealth } from './views/serverHealthCheck';
import cookieParser from 'cookie-parser';
import cookieSession from 'cookie-session';
import { NODE_ENV, SESSION_SECRET } from './utils/constants';
import FederationLoginConfig from './clients/passport.config';
const app = express();

// Initialize Passport configuration
new FederationLoginConfig();

// Configure CORS
const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            process.env.FRONTEND_URL,
            // 'http://localhost:3000',
        ];

        if (!allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Cookie'],
    exposedHeaders: ['Set-Cookie'],
    maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));

// Security middleware
app.use(
    helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    }),
);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie middleware
app.use(cookieParser());
app.use(
    cookieSession({
        name: 'session',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        keys: [SESSION_SECRET],
        secure: NODE_ENV === 'production',
        sameSite: 'lax',
        httpOnly: true,
    }),
);

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Request logging middleware
app.use(
    expressWinston.logger({
        winstonInstance: logger,
        statusLevels: true,
    }),
);
expressWinston.requestWhitelist.push('body');
expressWinston.responseWhitelist.push('body');

// Additional middleware
app.use(mongoSanitize());
app.use(morgan('dev'));

// Serve static files from the public directory
app.use(express.static('src/public'));

// Request logger middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    logger.warn(
        `Incoming request: ${req.method} ${req.path} ${req.originalUrl} from ${req.ip} at ${new Date().toISOString()}`,
    );
    const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    console.log('Full Requested URL:', fullUrl);
    next();
});

// Swagger documentation route
app.use('/api-docs', swaggerUi.serve);
app.get('/api-docs', (req, res, next) => {
    try {
        // Update the Swagger specs with the current host
        const currentSpecs = updateSwaggerHost(req);

        // Debug in production
        if (NODE_ENV === 'production') {
            console.log('Swagger server URL:', currentSpecs.servers[0].url);
            console.log('Swagger paths count:', Object.keys(currentSpecs.paths || {}).length);
        }

        // Setup Swagger UI with the updated specs
        swaggerUi.setup(currentSpecs, {
            explorer: true,
            customCss: '.swagger-ui .topbar { display: none }',
            swaggerOptions: {
                docExpansion: 'list',
                filter: true,
                showRequestDuration: true,
            },
        })(req, res, next);
    } catch (error) {
        console.error('Error setting up Swagger UI:', error);
        res.status(500).send('Error setting up API documentation');
    }
});

// server health check
app.get('/serverhealth', getServerHealth);

app.use('/api/v0', router);

app.use(Middlewares.notFound);
app.use(Middlewares.errorHandler);
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Route not found',
    });
});

export default app;
