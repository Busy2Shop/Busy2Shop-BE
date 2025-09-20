import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisPubClient, redisSubClient } from '../../utils/redis';
import { ChatService } from '../../services/chat.service';
import EnhancedChatService from '../../services/chat-enhanced.service';
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
import { ADMIN_EMAIL } from '../../utils/constants';
import AdminService from '../../services/AdminServices/admin.service';
import { DecodedTokenData } from '../../utils/interface';
import http from 'http';

export default class SocketConfig {
    private readonly io: Server<
        ClientToServerEvents,
        ServerToClientEvents,
        InterServerEvents,
        SocketData
    >;

    constructor(server: http.Server) {
        this.io = new Server<
            ClientToServerEvents,
            ServerToClientEvents,
            InterServerEvents,
            SocketData
        >(server, {
            cors: {
                origin: '*',
                methods: ['*'],
                credentials: true,
                allowedHeaders: ['*'],
            },
        });

        // Initialize Socket.IO configuration
        this.initialize();

        // Set the socket server instance in the enhanced chat service
        EnhancedChatService.setSocketServer(this.io);
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
                    let isSuperAdmin = false;

                    if (!tokenData.authKey) {
                        return next(new Error('Invalid admin token'));
                    }

                    if (tokenData.authKey !== ADMIN_EMAIL) {
                        const admin = await AdminService.getAdminByEmail(tokenData.authKey);
                        emailToUse = admin.email;
                        isSuperAdmin = admin.isSuperAdmin;
                    } else {
                        isSuperAdmin = true;
                    }

                    // Set admin user data in socket
                    socket.data.user = {
                        id: tokenData.authKey,
                        type: 'admin',
                        name: emailToUse,
                        isSuperAdmin,
                    };
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
                        return next(
                            new Error('Your account has been blocked. Please contact support'),
                        );
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
            socket.on('join-order-chat', async orderId => {
                try {
                    const user = socket.data.user;
                    const roomName = `order:${orderId}`;

                    // Join the room
                    socket.join(roomName);

                    // Handle user joining via enhanced chat service
                    await EnhancedChatService.handleUserJoinChat(
                        orderId,
                        user.id,
                        user.type,
                        user.name
                    );

                    // Send previous messages
                    const messages = await EnhancedChatService.getMessagesByOrderId(orderId);
                    socket.emit('previous-messages', messages);

                    // Mark messages as read
                    await EnhancedChatService.markMessagesAsRead(orderId, user.id);

                    logger.info(`User ${user.id} joined chat for order ${orderId}`);
                } catch (error) {
                    logger.error('Error joining order chat:', error);
                    socket.emit('error', { message: 'Failed to join chat' });
                }
            });

            // Leave order chat room
            socket.on('leave-order-chat', async orderId => {
                try {
                    const user = socket.data.user;
                    const roomName = `order:${orderId}`;

                    socket.leave(roomName);

                    // Handle user leaving via enhanced chat service
                    await EnhancedChatService.handleUserLeaveChat(
                        orderId,
                        user.id,
                        user.type,
                        user.name
                    );

                    logger.info(`User ${user.id} left chat for order ${orderId}`);
                } catch (error) {
                    logger.error('Error leaving order chat:', error);
                    socket.emit('error', { message: 'Failed to leave chat' });
                }
            });

            // Handle the new message
            socket.on('send-message', async data => {
                try {
                    const { orderId, message, imageUrl } = data;
                    const user = socket.data.user;

                    // Send message via enhanced chat service (handles all logic including socket broadcast)
                    await EnhancedChatService.sendMessage(
                        user.id,
                        user.type,
                        orderId,
                        message,
                        imageUrl
                    );

                    logger.info(`Message sent in order ${orderId} by ${user.id}`);
                } catch (error) {
                    logger.error('Error sending message:', error);
                    socket.emit('error', { message: 'Failed to send message' });
                }
            });

            // Handle typing indicator
            socket.on('typing', async data => {
                try {
                    const { orderId, isTyping } = data;
                    const user = socket.data.user;

                    // Handle typing via enhanced chat service
                    await EnhancedChatService.handleTypingIndicator(
                        orderId,
                        user.id,
                        user.name,
                        isTyping
                    );
                } catch (error) {
                    logger.error('Error handling typing indicator:', error);
                }
            });

            // Handle chat activation
            socket.on('activate-chat', async orderId => {
                try {
                    const user = socket.data.user;

                    // Activate chat via enhanced chat service (handles all logic including socket broadcast)
                    const activationData = {
                        orderId,
                        activatedBy: {
                            id: user.id,
                            type: user.type,
                            name: user.name,
                        },
                    };

                    const success = await EnhancedChatService.activateChat(activationData);

                    if (success) {
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
            socket.on('mark-messages-read', async orderId => {
                try {
                    const user = socket.data.user;
                    await EnhancedChatService.markMessagesAsRead(orderId, user.id);
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
    public getIO(): Server<
        ClientToServerEvents,
        ServerToClientEvents,
        InterServerEvents,
        SocketData
    > {
        return this.io;
    }
}
