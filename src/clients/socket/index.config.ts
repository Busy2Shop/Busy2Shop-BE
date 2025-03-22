import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisPubClient, redisSubClient } from '../../utils/redis';
import { ChatService } from '../../services/chat.service';
import { AuthUtil, TokenCacheUtil } from '../../utils/token';
import { logger } from '../../utils/logger';
import UserService from '../../services/user.service';
import {
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData,
    CustomSocket,
} from './types';
import { AdminType } from '../../models/admin.model';
import { ADMIN_EMAIL } from '../../utils/constants';
import AdminService from '../../services/AdminServices/admin.service';
import { DecodedTokenData } from '../../utils/interface';
import http from 'http';

export default class SocketConfig {
    private readonly io: Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

    constructor(server: http.Server) {
        this.io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(server, {
            cors: {
                origin: '*',
                methods: ['*'],
                credentials: true,
                allowedHeaders: ['*'],
            },
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
            logger.info(`User connected: ${socket.data.user.id} (${socket.data.user.type})`);

            // Join order chat room
            socket.on('join-order-chat', async (orderId) => {
                try {
                    const user = socket.data.user;
                    const roomName = `order:${orderId}`;

                    // Join the room
                    socket.join(roomName);

                    // Notify others in the room
                    socket.to(roomName).emit('user-joined', user);

                    // Send previous messages
                    const messages = await ChatService.getMessagesByOrderId(orderId);
                    socket.emit('previous-messages', messages);

                    // Mark messages as read
                    await ChatService.markMessagesAsRead(orderId, user.id);

                    logger.info(`User ${user.id} joined chat for order ${orderId}`);
                } catch (error) {
                    logger.error('Error joining order chat:', error);
                    socket.emit('error', { message: 'Failed to join chat' });
                }
            });

            // Leave order chat room
            socket.on('leave-order-chat', (orderId) => {
                const roomName = `order:${orderId}`;
                socket.leave(roomName);
                socket.to(roomName).emit('user-left', socket.data.user);
                logger.info(`User ${socket.data.user.id} left chat for order ${orderId}`);
            });

            // Handle the new message
            socket.on('send-message', async (data) => {
                try {
                    const { orderId, message, imageUrl } = data;
                    const user = socket.data.user;
                    const roomName = `order:${orderId}`;

                    // Check if the chat is active
                    const isChatActive = await ChatService.isChatActive(orderId);
                    if (!isChatActive) {
                        socket.emit('error', { message: 'Chat is not active for this order' });
                        return;
                    }

                    // Save message to the database
                    const savedMessage = await ChatService.saveMessage({
                        orderId,
                        senderId: user.id,
                        senderType: user.type,
                        message,
                        imageUrl,
                    });

                    // Broadcast to all in the room including sender
                    this.io.to(roomName).emit('new-message', savedMessage);

                    logger.info(`Message sent in order ${orderId} by ${user.id}`);
                } catch (error) {
                    logger.error('Error sending message:', error);
                    socket.emit('error', { message: 'Failed to send message' });
                }
            });

            // Handle typing indicator
            socket.on('typing', (data) => {
                const { orderId, isTyping } = data;
                const user = socket.data.user;
                const roomName = `order:${orderId}`;

                socket.to(roomName).emit('user-typing', {
                    user: {
                        id: user.id,
                        name: user.name,
                    },
                    isTyping,
                });
            });

            // Handle chat activation
            socket.on('activate-chat', async (orderId) => {
                try {
                    const user = socket.data.user;
                    const roomName = `order:${orderId}`;

                    // Activate chat
                    const activationData = {
                        orderId,
                        activatedBy: {
                            id: user.id,
                            type: user.type,
                            name: user.name,
                        },
                    };

                    const success = await ChatService.activateChat(activationData);

                    if (success) {
                        // Notify all users in the room
                        this.io.to(roomName).emit('chat-activated', activationData);
                        logger.info(`Chat activated for order ${orderId} by ${user.id}`);
                    } else {
                        socket.emit('error', { message: 'Failed to activate chat' });
                    }
                } catch (error) {
                    logger.error('Error activating chat:', error);
                    socket.emit('error', { message: 'Failed to activate chat' });
                }
            });

            // Handle mark messages as read
            socket.on('mark-messages-read', async (orderId) => {
                try {
                    const user = socket.data.user;
                    await ChatService.markMessagesAsRead(orderId, user.id);
                    logger.info(`Messages marked as read for order ${orderId} by ${user.id}`);
                } catch (error) {
                    logger.error('Error marking messages as read:', error);
                    socket.emit('error', { message: 'Failed to mark messages as read' });
                }
            });

            // Handle disconnection
            socket.on('disconnect', () => {
                logger.info(`User disconnected: ${socket.data.user.id}`);
            });
        });
    }

    // Method to get the io instance (useful if needed elsewhere in the app)
    public getIO(): Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData> {
        return this.io;
    }
}