import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { logger } from '../utils/logger';
import { AuthUtil } from '../utils/token';
import UserService from '../services/user.service';
import { ChatService } from '../services/chat.service';

export default class SocketConfig {
    private io: SocketIOServer;
    private userSocketMap: Map<string, string> = new Map(); // userId -> socketId

    constructor(server: HttpServer) {
        this.io = new SocketIOServer(server, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST'],
            },
        });
        this.initialize();
    }

    private initialize() {
        this.io.use(async (socket, next) => {
            try {
                const token = socket.handshake.auth.token;
                if (!token) {
                    return next(new Error('Authentication error: Token not provided'));
                }

                // Verify the token
                const decoded = await AuthUtil.verifyToken(token, 'access');
                if (!decoded || !decoded.user) {
                    return next(new Error('Authentication error: Invalid token'));
                }

                // Attach user data to socket
                socket.data.user = decoded.user;
                next();
            } catch (error) {
                logger.error('Socket authentication error:', error);
                next(new Error('Authentication error'));
            }
        });

        this.io.on('connection', (socket) => {
            logger.info(`User connected: ${socket.data.user.id}`);
            
            // Store user's socket id
            this.userSocketMap.set(socket.data.user.id, socket.id);

            // Join user to their personal room
            socket.join(socket.data.user.id);

            // Handle joining order-specific chat room
            socket.on('join-order-chat', async (orderId: string) => {
                try {
                    // Join the order-specific room
                    socket.join(`order-${orderId}`);
                    logger.info(`User ${socket.data.user.id} joined order chat: ${orderId}`);

                    // Fetch previous messages for this order
                    const messages = await ChatService.getMessagesByOrderId(orderId);
                    
                    // Send previous messages to the user
                    socket.emit('previous-messages', messages);
                    
                    // Notify others in the room that user has joined
                    socket.to(`order-${orderId}`).emit('user-joined', {
                        userId: socket.data.user.id,
                        name: `${socket.data.user.firstName} ${socket.data.user.lastName}`,
                        timestamp: new Date(),
                    });
                } catch (error) {
                    logger.error(`Error joining order chat: ${error}`);
                    socket.emit('error', { message: 'Failed to join order chat' });
                }
            });

            // Handle new message
            socket.on('send-message', async (data: { orderId: string; message: string }) => {
                try {
                    const { orderId, message } = data;
                    const userId = socket.data.user.id;
                    const userType = socket.data.user.status.userType;

                    // Save message to database
                    const savedMessage = await ChatService.saveMessage({
                        orderId,
                        senderId: userId,
                        senderType: userType,
                        message,
                    });

                    // Broadcast message to the order room
                    this.io.to(`order-${orderId}`).emit('new-message', savedMessage);
                } catch (error) {
                    logger.error(`Error sending message: ${error}`);
                    socket.emit('error', { message: 'Failed to send message' });
                }
            });

            // Handle typing indicator
            socket.on('typing', (data: { orderId: string; isTyping: boolean }) => {
                const { orderId, isTyping } = data;
                const user = {
                    id: socket.data.user.id,
                    name: `${socket.data.user.firstName} ${socket.data.user.lastName}`,
                };
                
                // Broadcast typing status to the order room (except sender)
                socket.to(`order-${orderId}`).emit('user-typing', {
                    user,
                    isTyping,
                });
            });

            // Handle leave chat
            socket.on('leave-order-chat', (orderId: string) => {
                socket.leave(`order-${orderId}`);
                logger.info(`User ${socket.data.user.id} left order chat: ${orderId}`);
                
                // Notify others that user has left
                socket.to(`order-${orderId}`).emit('user-left', {
                    userId: socket.data.user.id,
                    name: `${socket.data.user.firstName} ${socket.data.user.lastName}`,
                    timestamp: new Date(),
                });
            });

            // Handle disconnect
            socket.on('disconnect', () => {
                logger.info(`User disconnected: ${socket.data.user.id}`);
                this.userSocketMap.delete(socket.data.user.id);
            });
        });
    }

    // Method to send notification to a specific user
    public sendToUser(userId: string, event: string, data: any) {
        const socketId = this.userSocketMap.get(userId);
        if (socketId) {
            this.io.to(socketId).emit(event, data);
            return true;
        }
        return false;
    }

    // Method to send notification to all users in an order chat
    public sendToOrderChat(orderId: string, event: string, data: any) {
        this.io.to(`order-${orderId}`).emit(event, data);
    }
}
