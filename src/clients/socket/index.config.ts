import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisPubClient, redisSubClient } from '../../utils/redis';
import EnhancedChatService from '../../services/chat-enhanced.service';
import CallService from '../../services/call.service';
import { AuthUtil, TokenCacheUtil } from '../../utils/token';
import { logger } from '../../utils/logger';
import UserPresenceService from '../../services/user-presence.service';
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
import { callRateLimiter } from '../../middleware/rate-limiter.middleware';
import { validateSDP, sanitizeSDP } from '../../utils/sdp-validator';
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
                logger.info('🔗 Socket connection attempt from:', {
                    socketId: socket.id,
                    userAgent: socket.handshake.headers['user-agent'],
                    origin: socket.handshake.headers.origin,
                    authProvided: !!socket.handshake.auth.token
                });

                const authHeader = socket.handshake.auth.token;
                if (!authHeader?.startsWith('Bearer')) {
                    logger.error('🚫 Socket auth failed - Invalid authorization token format:', {
                        authHeader: authHeader ? 'Provided but invalid format' : 'Not provided',
                        socketId: socket.id
                    });
                    return next(new Error('Invalid authorization token'));
                }

                const jwtToken = authHeader.split(' ')[1];
                const isAdmin = socket.handshake.auth['x-iadmin-access'] === 'true';

                logger.info('🔐 Socket auth token received:', {
                    tokenLength: jwtToken?.length || 0,
                    isAdmin,
                    socketId: socket.id
                });

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
                        profileImage: (user as any).profileImage || (user as any).displayImage,
                    };
                    socket.data.token = jwtToken;
                }

                logger.authorized('✅ Socket user authorized successfully:', {
                    userId: socket.data.user.id,
                    userType: socket.data.user.type,
                    userName: socket.data.user.name,
                    profileImage: (socket.data.user as any).profileImage,
                    socketId: socket.id
                });
                next();
            } catch (error) {
                logger.error('🚫 Socket authentication error:', {
                    error: error instanceof Error ? error.message : String(error),
                    socketId: socket.id,
                    stack: error instanceof Error ? error.stack : undefined
                });
                next(new Error('Authentication error'));
            }
        });

        // Handle connections
        this.io.on('connection', (socket: CustomSocket) => {
            logger.info('🎉 Socket connection established:', {
                userId: socket.data.user.id,
                userType: socket.data.user.type,
                userName: socket.data.user.name,
                socketId: socket.id,
                totalConnections: this.io.engine.clientsCount
            });

            // Join user's personal room for reliable message delivery
            socket.join(`user:${socket.data.user.id}`);
            logger.info(`🚪 User ${socket.data.user.id} joined personal room: user:${socket.data.user.id}`);

            // Update user presence when they connect
            UserPresenceService.updateUserPresence(
                socket.data.user.id,
                'web',
                socket.handshake.headers['user-agent'],
                socket.id
            );

            // Emit connection success to client
            socket.emit('connection-status', {
                status: 'connected',
                userId: socket.data.user.id,
                userType: socket.data.user.type
            });

            // Join order chat room
            socket.on('join-order-chat', async orderId => {
                try {
                    const user = socket.data.user;
                    const roomName = `order:${orderId}`;

                    logger.info('🚪 User attempting to join order chat:', {
                        userId: user.id,
                        userType: user.type,
                        orderId,
                        roomName,
                        socketId: socket.id
                    });

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

                    logger.info('✅ User successfully joined order chat:', {
                        userId: user.id,
                        userType: user.type,
                        orderId,
                        messagesCount: messages.length,
                        socketId: socket.id
                    });
                } catch (error) {
                    logger.error('❌ Error joining order chat:', {
                        error: error instanceof Error ? error.message : String(error),
                        userId: socket.data.user.id,
                        orderId,
                        socketId: socket.id
                    });
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

            // ==========================================
            // CALL EVENT HANDLERS
            // ==========================================

            // Check if recipient is available for a call
            socket.on('call:check-availability', async (data) => {
                try {
                    const { recipientId, orderId } = data;
                    const user = socket.data.user;

                    logger.info('📞 [HANDLER] Received call:check-availability event', {
                        callerId: user.id,
                        callerName: user.name,
                        recipientId,
                        orderId,
                        socketId: socket.id,
                        hasCallService: !!CallService
                    });

                    // Check if user is already in a call
                    const callerInCall = await CallService.isUserInCall(user.id);
                    logger.info('📞 [HANDLER] Caller in-call check:', {
                        userId: user.id,
                        isInCall: callerInCall
                    });
                    if (callerInCall) {
                        logger.warn('📞 [HANDLER] Caller is already in a call, rejecting', {
                            userId: user.id
                        });
                        socket.emit('call:availability-response', {
                            available: false,
                            reason: 'You are already in a call'
                        });
                        return;
                    }

                    // Check if recipient is online
                    const isOnline = await UserPresenceService.isUserOnline(recipientId);
                    if (!isOnline) {
                        const lastSeen = await UserPresenceService.getTimeSinceLastSeen(recipientId);
                        socket.emit('call:availability-response', {
                            available: false,
                            reason: `Recipient is offline. Last seen ${lastSeen} minutes ago.`
                        });
                        return;
                    }

                    // Check if recipient is already in a call
                    const recipientInCall = await CallService.isUserInCall(recipientId);
                    if (recipientInCall) {
                        socket.emit('call:availability-response', {
                            available: false,
                            reason: 'Recipient is already in another call'
                        });
                        return;
                    }

                    socket.emit('call:availability-response', {
                        available: true,
                        recipientId,
                        orderId
                    });

                    logger.info('📞 Call availability check passed:', {
                        callerId: user.id,
                        recipientId,
                        orderId
                    });
                } catch (error) {
                    logger.error('📞 Error checking call availability:', error);
                    socket.emit('call:error', { message: 'Failed to check availability' });
                }
            });

            // Initiate a call
            socket.on('call:initiate', async (data) => {
                try {
                    const { orderId, recipientId, recipientType } = data;
                    const user = socket.data.user;

                    const callerProfileImage = (user as any).profileImage || (user as any).displayImage;

                    logger.info('📞 Initiating call:', {
                        callerId: user.id,
                        callerType: user.type,
                        callerName: user.name,
                        callerProfileImage,
                        recipientId,
                        recipientType,
                        orderId,
                        socketId: socket.id
                    });

                    // Rate limiting check - prevent spam/abuse
                    const allowed = await callRateLimiter.checkLimit(user.id);
                    if (!allowed) {
                        const resetTime = await callRateLimiter.getTimeUntilReset(user.id);
                        const resetSeconds = Math.ceil(resetTime / 1000);
                        socket.emit('call:error', {
                            message: `Too many call attempts. Please wait ${resetSeconds} seconds before trying again.`,
                        });
                        logger.warn('📞 Rate limit exceeded for call initiation:', {
                            userId: user.id,
                            resetSeconds,
                        });
                        return;
                    }

                    const result = await CallService.initiateCall(
                        orderId,
                        user.id,
                        user.type as 'agent' | 'customer',
                        user.name,
                        (user as any).profileImage || (user as any).displayImage,
                        socket.id,
                        recipientId,
                        recipientType
                    );

                    if (result.success) {
                        socket.emit('call:initiated', {
                            callId: result.callId,
                            orderId,
                            recipientId
                        });
                        logger.info('📞 Call initiated successfully:', {
                            callId: result.callId,
                            callerId: user.id,
                            recipientId
                        });
                    } else {
                        socket.emit('call:error', { message: result.error });
                        logger.warn('📞 Call initiation failed:', {
                            error: result.error,
                            callerId: user.id,
                            recipientId
                        });
                    }
                } catch (error) {
                    logger.error('📞 Error initiating call:', error);
                    socket.emit('call:error', { message: 'Failed to initiate call' });
                }
            });

            // Accept an incoming call
            socket.on('call:accept', async (data) => {
                try {
                    const { callId } = data;
                    const user = socket.data.user;

                    logger.info('📞 Accepting call:', {
                        callId,
                        acceptedBy: user.id,
                        socketId: socket.id
                    });

                    const result = await CallService.acceptCall(callId, user.id);

                    if (!result.success) {
                        socket.emit('call:error', { message: result.error });
                        logger.warn('📞 Call acceptance failed:', {
                            callId,
                            error: result.error
                        });
                    }
                } catch (error) {
                    logger.error('📞 Error accepting call:', error);
                    socket.emit('call:error', { message: 'Failed to accept call' });
                }
            });

            // Reject an incoming call
            socket.on('call:reject', async (data) => {
                try {
                    const { callId, reason } = data;
                    const user = socket.data.user;

                    logger.info('📞 Rejecting call:', {
                        callId,
                        rejectedBy: user.id,
                        reason,
                        socketId: socket.id
                    });

                    const result = await CallService.rejectCall(
                        callId,
                        user.id,
                        (reason as 'user-declined' | 'busy') || 'user-declined'
                    );

                    if (!result.success) {
                        socket.emit('call:error', { message: result.error });
                        logger.warn('📞 Call rejection failed:', {
                            callId,
                            error: result.error
                        });
                    }
                } catch (error) {
                    logger.error('📞 Error rejecting call:', error);
                    socket.emit('call:error', { message: 'Failed to reject call' });
                }
            });

            // WebRTC signaling: Forward SDP offer
            socket.on('call:offer', async (data) => {
                try {
                    const { callId, recipientId, sdp } = data;
                    const user = socket.data.user;

                    // Validate SDP before forwarding
                    const validation = validateSDP(sdp);
                    if (!validation.valid) {
                        logger.warn('📞 [WEBRTC] Invalid SDP in offer:', {
                            callId,
                            from: user.id,
                            error: validation.error,
                            message: validation.message,
                        });
                        socket.emit('call:error', {
                            message: validation.message || 'Invalid SDP format'
                        });
                        return;
                    }

                    // Sanitize SDP (remove unexpected fields)
                    const sanitizedSDP = sanitizeSDP(sdp);

                    logger.info('📞 [WEBRTC] Forwarding WebRTC offer:', {
                        callId,
                        from: user.id,
                        fromName: user.name,
                        toUserId: recipientId
                    });

                    // Forward the offer to the recipient's user room
                    this.io.to(`user:${recipientId}`).emit('call:offer', {
                        callId,
                        sdp: sanitizedSDP,
                        from: user.id,
                        fromName: user.name
                    });

                    logger.info('📞 [WEBRTC] Offer forwarded to user room:', `user:${recipientId}`);
                } catch (error) {
                    logger.error('📞 [WEBRTC] Error forwarding call offer:', error);
                    socket.emit('call:error', { message: 'Failed to send offer' });
                }
            });

            // WebRTC signaling: Forward SDP answer
            socket.on('call:answer', async (data) => {
                try {
                    const { callId, callerId, sdp } = data;
                    const user = socket.data.user;

                    // Validate SDP before forwarding
                    const validation = validateSDP(sdp);
                    if (!validation.valid) {
                        logger.warn('📞 [WEBRTC] Invalid SDP in answer:', {
                            callId,
                            from: user.id,
                            error: validation.error,
                            message: validation.message,
                        });
                        socket.emit('call:error', {
                            message: validation.message || 'Invalid SDP format'
                        });
                        return;
                    }

                    // Sanitize SDP (remove unexpected fields)
                    const sanitizedSDP = sanitizeSDP(sdp);

                    logger.info('📞 [WEBRTC] Forwarding WebRTC answer:', {
                        callId,
                        from: user.id,
                        fromName: user.name,
                        toUserId: callerId
                    });

                    // Forward the answer to the caller's user room
                    this.io.to(`user:${callerId}`).emit('call:answer', {
                        callId,
                        sdp: sanitizedSDP,
                        from: user.id
                    });

                    logger.info('📞 [WEBRTC] Answer forwarded to user room:', `user:${callerId}`);
                } catch (error) {
                    logger.error('📞 [WEBRTC] Error forwarding call answer:', error);
                    socket.emit('call:error', { message: 'Failed to send answer' });
                }
            });

            // WebRTC signaling: Forward ICE candidate
            socket.on('call:ice-candidate', async (data) => {
                try {
                    const { callId, recipientId, candidate } = data;
                    const user = socket.data.user;

                    logger.info('📞 [WEBRTC] Forwarding ICE candidate:', {
                        callId,
                        from: user.id,
                        toUserId: recipientId
                    });

                    // Forward the ICE candidate to the recipient's user room
                    this.io.to(`user:${recipientId}`).emit('call:ice-candidate', {
                        callId,
                        candidate,
                        from: user.id
                    });

                    logger.info('📞 [WEBRTC] ICE candidate forwarded to user room:', `user:${recipientId}`);
                } catch (error) {
                    logger.error('📞 [WEBRTC] Error forwarding ICE candidate:', error);
                }
            });

            // Handle call reconnection (when user reconnects during an active call)
            socket.on('call:reconnect', async (data) => {
                try {
                    const { callId, userId } = data;
                    const user = socket.data.user;

                    logger.info('📞 Call reconnection attempt:', {
                        callId,
                        userId,
                        socketId: socket.id,
                        currentUserId: user.id
                    });

                    // Verify the user owns this call
                    if (userId !== user.id) {
                        socket.emit('call:error', { message: 'Unauthorized reconnection attempt' });
                        return;
                    }

                    // Check if call session still exists
                    const result = await CallService.getCallSession(callId);
                    if (result.success && result.session) {
                        // Call is still active, notify user they can resume
                        socket.emit('call:reconnected', {
                            callId,
                            session: result.session,
                            message: 'Reconnected to active call'
                        });
                        logger.info('📞 User reconnected to active call:', {
                            callId,
                            userId: user.id
                        });
                    } else {
                        // Call no longer exists
                        socket.emit('call:ended', {
                            callId,
                            endedBy: 'system',
                            reason: 'Call session expired',
                            duration: 0,
                            endedAt: Date.now()
                        });
                        logger.info('📞 Call session not found during reconnection:', {
                            callId,
                            userId: user.id
                        });
                    }
                } catch (error) {
                    logger.error('📞 Error handling call reconnection:', error);
                    socket.emit('call:error', { message: 'Failed to reconnect to call' });
                }
            });

            // End an active call
            socket.on('call:end', async (data) => {
                try {
                    const { callId, duration, reason } = data;
                    const user = socket.data.user;

                    logger.info('📞 Ending call:', {
                        callId,
                        endedBy: user.id,
                        duration,
                        reason,
                        socketId: socket.id
                    });

                    const result = await CallService.endCall(
                        callId,
                        user.id,
                        duration || 0,
                        (reason as 'user-hangup' | 'connection-error') || 'user-hangup'
                    );

                    if (!result.success) {
                        socket.emit('call:error', { message: result.error });
                        logger.warn('📞 Call end failed:', {
                            callId,
                            error: result.error
                        });
                    }
                } catch (error) {
                    logger.error('📞 Error ending call:', error);
                    socket.emit('call:error', { message: 'Failed to end call' });
                }
            });

            // Handle disconnection
            socket.on('disconnect', async (reason) => {
                logger.info('👋 Socket disconnected:', {
                    userId: socket.data.user.id,
                    userType: socket.data.user.type,
                    reason,
                    socketId: socket.id,
                    totalConnections: this.io.engine.clientsCount - 1
                });

                // Clean up call state on disconnect
                try {
                    await CallService.handleUserDisconnect(socket.data.user.id);
                } catch (error) {
                    logger.error('📞 Error cleaning up call state on disconnect:', error);
                }

                // Mark user as offline when they disconnect
                UserPresenceService.markUserOffline(socket.data.user.id);
            });

            // Handle heartbeat for presence tracking
            socket.on('heartbeat', () => {
                UserPresenceService.heartbeat(socket.data.user.id, 'web');
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
