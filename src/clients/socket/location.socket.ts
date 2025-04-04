import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisPubClient, redisSubClient } from '../../utils/redis';
import { AuthUtil, TokenCacheUtil } from '../../utils/token';
import { logger } from '../../utils/logger';
import UserService from '../../services/user.service';
import {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData,
    CustomSocket,
    LocationUpdateData,
    LocationSubscriptionData,
    LocationSubscriptionStatus,
} from './types';
import { AdminType } from '../../models/admin.model';
import { ADMIN_EMAIL } from '../../utils/constants';
import AdminService from '../../services/AdminServices/admin.service';
import { DecodedTokenData } from '../../utils/interface';
import http from 'http';
import LocationService from '../../services/location.service';

export default class LocationSocket {
    private readonly io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

    constructor(server: http.Server) {
        this.io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(server, {
            cors: {
                origin: '*',
                methods: ['*'],
                credentials: true,
                allowedHeaders: ['*'],
            },
            path: '/location-socket', // Use a different path to avoid conflicts with the chat socket
        });

        // Initialize Socket.IO configuration
        this.initialize();
    }

    private initialize() {
        // Set up Redis adapter
        this.io.adapter(createAdapter(redisPubClient, redisSubClient));

        // Middleware for authentication
        this.io.use(async (socket: CustomSocket, next) => {
            try {
                const authHeader = socket.handshake.auth.token;
                if (!authHeader?.startsWith('Bearer')) {
                    return next(new Error('Invalid authorization token'));
                }

                const jwtToken = authHeader.split(' ')[1];
                const isAdmin = socket.handshake.auth['x-iadmin-access'] === 'true';

                if (isAdmin) {
                    // Admin authentication flow
                    const payload = AuthUtil.verifyAdminToken(jwtToken, 'admin');
                    const tokenData = payload as unknown as Omit<DecodedTokenData, 'user'>;
                    logger.payload('Admin Socket Token data', tokenData);

                    if (tokenData.tokenType !== 'admin') {
                        return next(new Error('You are not authorized to perform this action'));
                    }

                    const key = `admin_token:${tokenData.authKey}`;
                    const cachedToken = await TokenCacheUtil.getTokenFromCache(key);

                    if (cachedToken !== jwtToken) {
                        return next(new Error('Invalid or expired token'));
                    }

                    let emailToUse = (tokenData.authKey as string).toLowerCase().trim();

                    if (!tokenData.authKey) {
                        return next(new Error('Invalid admin token'));
                    }

                    if (tokenData.authKey !== ADMIN_EMAIL) {
                        const admin = await AdminService.getAdminByEmail(tokenData.authKey);
                        emailToUse = admin.email;

                        socket.data.user = {
                            id: tokenData.authKey,
                            type: 'admin',
                            name: emailToUse,
                            adminType: admin.adminType,
                            supermarketId: admin.supermarketId || null,
                        };
                    } else {
                        // Default admin is SUPER_ADMIN
                        socket.data.user = {
                            id: tokenData.authKey,
                            type: 'admin',
                            name: emailToUse,
                            adminType: AdminType.SUPER_ADMIN,
                            supermarketId: null,
                        };
                    }
                    socket.data.token = jwtToken;

                } else {
                    // Regular user authentication flow
                    const payload = AuthUtil.verifyToken(jwtToken, 'access');
                    const tokenData = payload as unknown as DecodedTokenData;
                    logger.payload('Socket Token data', tokenData);
                    tokenData.token = jwtToken;

                    if (tokenData.tokenType !== 'access') {
                        return next(new Error('You are not authorized to perform this action'));
                    }

                    const key = `access_token:${tokenData.user.id}`;
                    const cachedToken = await TokenCacheUtil.getTokenFromCache(key);

                    if (cachedToken !== jwtToken) {
                        return next(new Error('Invalid or expired token'));
                    }

                    const user = await UserService.viewSingleUser(tokenData.user.id);

                    if (!user) {
                        return next(new Error('User not found'));
                    }

                    if (user.settings.isBlocked) {
                        return next(new Error('Your account has been blocked. Please contact support'));
                    }

                    if (user.settings.isDeactivated) {
                        return next(new Error('This account has been deactivated by the owner'));
                    }

                    // Set user data in socket
                    socket.data.user = {
                        id: user.id,
                        type: user.status.userType,
                        name: `${user.firstName} ${user.lastName}`.trim(),
                    };
                    socket.data.token = jwtToken;
                }

                logger.authorized('Socket user authorized');
                next();
            } catch (error) {
                logger.error('Socket authentication error:', error);
                next(new Error('Authentication error'));
            }
        });

        // Handle connections
        this.io.on('connection', (socket: CustomSocket) => {
            logger.info(`User connected to location socket: ${socket.data.user.id} (${socket.data.user.type})`);

            // Handle location updates from agents
            socket.on('update-location', async (data: LocationUpdateData) => {
                try {
                    const user = socket.data.user;

                    // Validate that the user is an agent
                    if (user.type !== 'agent') {
                        socket.emit('error', { message: 'Only agents can update location' });
                        return;
                    }

                    // Add agent ID if not provided
                    if (!data.agentId) {
                        data.agentId = user.id;
                    }

                    // Validate that the agent ID matches the user ID
                    if (data.agentId !== user.id) {
                        socket.emit('error', { message: 'Invalid agent ID' });
                        return;
                    }

                    // Add timestamp if not provided
                    if (!data.timestamp) {
                        data.timestamp = Date.now();
                    }

                    // Update agent location in the database
                    await LocationService.updateAgentLocation(data.agentId, {
                        latitude: data.latitude,
                        longitude: data.longitude,
                    });

                    // Store location data in Redis for fast retrieval
                    const locationKey = `location:agent:${data.agentId}`;
                    await redisPubClient.set(locationKey, JSON.stringify(data));

                    // Set expiration for the location data (e.g., 1 hour)
                    await redisPubClient.expire(locationKey, 3600);

                    // Broadcast to order room if orderId is provided
                    if (data.orderId) {
                        const orderRoomName = `location:order:${data.orderId}`;
                        this.io.to(orderRoomName).emit('location-update', data);
                    }

                    // Broadcast to region room if regionId is provided
                    if (data.regionId) {
                        const regionRoomName = `location:region:${data.regionId}`;
                        this.io.to(regionRoomName).emit('location-update', data);
                    }

                    // Broadcast to agent-specific room
                    const agentRoomName = `location:agent:${data.agentId}`;
                    this.io.to(agentRoomName).emit('location-update', data);

                    logger.info(`Location updated for agent ${data.agentId}`);
                } catch (error) {
                    logger.error('Error updating location:', error);
                    socket.emit('error', { message: 'Failed to update location' });
                }
            });

            // Handle location subscription
            socket.on('subscribe-to-location', async (data: LocationSubscriptionData) => {
                try {
                    const user = socket.data.user;
                    let roomName: string;
                    let roomType: 'order' | 'region' | 'agent';
                    let roomId: string;

                    // Determine which room to join based on the subscription data
                    if (data.orderId) {
                        roomName = `location:order:${data.orderId}`;
                        roomType = 'order';
                        roomId = data.orderId;
                    } else if (data.regionId) {
                        roomName = `location:region:${data.regionId}`;
                        roomType = 'region';
                        roomId = data.regionId;
                    } else if (data.agentId) {
                        roomName = `location:agent:${data.agentId}`;
                        roomType = 'agent';
                        roomId = data.agentId;
                    } else {
                        socket.emit('error', { message: 'Invalid subscription data' });
                        return;
                    }

                    // Join the room
                    socket.join(roomName);

                    // Create subscription status response
                    const subscriptionStatus: LocationSubscriptionStatus = {
                        success: true,
                        room: {
                            type: roomType,
                            id: roomId,
                        },
                    };

                    // Send subscription status to the client
                    socket.emit('location-subscription-status', subscriptionStatus);

                    // If subscribing to an agent's location, send the latest location data if available
                    if (data.agentId) {
                        const locationKey = `location:agent:${data.agentId}`;
                        const locationData = await redisPubClient.get(locationKey);

                        if (locationData) {
                            const parsedData = JSON.parse(locationData) as LocationUpdateData;
                            socket.emit('location-update', parsedData);
                        }
                    }

                    logger.info(`User ${user.id} subscribed to ${roomType} location updates for ${roomId}`);
                } catch (error) {
                    logger.error('Error subscribing to location:', error);
                    socket.emit('error', { message: 'Failed to subscribe to location updates' });
                }
            });

            // Handle location unsubscription
            socket.on('unsubscribe-from-location', (data: LocationSubscriptionData) => {
                try {
                    const user = socket.data.user;

                    // Determine which room to leave based on the subscription data
                    if (data.orderId) {
                        const roomName = `location:order:${data.orderId}`;
                        socket.leave(roomName);
                        logger.info(`User ${user.id} unsubscribed from order location updates for ${data.orderId}`);
                    }

                    if (data.regionId) {
                        const roomName = `location:region:${data.regionId}`;
                        socket.leave(roomName);
                        logger.info(`User ${user.id} unsubscribed from region location updates for ${data.regionId}`);
                    }

                    if (data.agentId) {
                        const roomName = `location:agent:${data.agentId}`;
                        socket.leave(roomName);
                        logger.info(`User ${user.id} unsubscribed from agent location updates for ${data.agentId}`);
                    }

                    if (!data.orderId && !data.regionId && !data.agentId) {
                        socket.emit('error', { message: 'Invalid unsubscription data' });
                    }
                } catch (error) {
                    logger.error('Error unsubscribing from location:', error);
                    socket.emit('error', { message: 'Failed to unsubscribe from location updates' });
                }
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                logger.info(`User disconnected from location socket: ${socket.data.user.id}`);
            });
        });
    }

    // Method to get the io instance (useful if needed elsewhere in the app)
    public getIO(): Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> {
        return this.io;
    }
}