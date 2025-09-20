import { Op, Transaction } from 'sequelize';
import { Database } from '../models';
import ChatMessage, { SenderType } from '../models/chatMessage.model';
import User from '../models/user.model';
import Order from '../models/order.model';
import { redisClient } from '../utils/redis';
import { ChatMessageType, ChatActivationType } from '../clients/socket/types';
import NotificationService from './notification.service';
import { NotificationTypes } from '../utils/interface';
import { v4 as uuidv4 } from 'uuid';
import { Server } from 'socket.io';
import { logger } from '../utils/logger';
import { BadRequestError, NotFoundError } from '../utils/customErrors';

interface IMessageData {
    orderId: string;
    senderId: string;
    senderType: SenderType;
    message: string;
    imageUrl?: string;
}

interface OrderWithRelations {
    id: string;
    customer?: {
        id: string;
        firstName?: string;
        lastName?: string;
    };
    agent?: {
        id: string;
        firstName?: string;
        lastName?: string;
    };
}

/**
 * Enhanced Chat Service with centralized socket management
 * Handles all chat-related business logic, socket events, and persistence
 */
export class EnhancedChatService {
    private static instance: EnhancedChatService;
    private io: Server | null = null;

    private constructor() {}

    public static getInstance(): EnhancedChatService {
        if (!EnhancedChatService.instance) {
            EnhancedChatService.instance = new EnhancedChatService();
        }
        return EnhancedChatService.instance;
    }

    /**
     * Set the Socket.IO server instance for the chat service
     */
    public setSocketServer(io: Server): void {
        this.io = io;
        logger.info('Socket server set in EnhancedChatService');
    }

    /**
     * Get the Socket.IO server instance
     */
    public getSocketServer(): Server | null {
        return this.io;
    }

    /**
     * Emit an event to a specific room
     */
    private emitToRoom(room: string, event: string, data: any): void {
        if (this.io) {
            this.io.to(room).emit(event, data);
        } else {
            logger.warn('Socket server not initialized when trying to emit event:', event);
        }
    }

    /**
     * Validate order data at runtime
     */
    private validateOrderWithRelations(data: unknown): OrderWithRelations {
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid order data: not an object');
        }

        const order = data as any;
        if (typeof order.id !== 'string') {
            throw new Error('Invalid order data: missing or invalid id');
        }

        const result: OrderWithRelations = { id: order.id };

        if (order.customer) {
            result.customer = {
                id: order.customer.id,
                firstName: order.customer.firstName,
                lastName: order.customer.lastName,
            };
        }

        if (order.agent) {
            result.agent = {
                id: order.agent.id,
                firstName: order.agent.firstName,
                lastName: order.agent.lastName,
            };
        }

        return result;
    }

    /**
     * Save a message to the database and emit to socket room
     */
    async saveMessage(messageData: IMessageData): Promise<ChatMessageType> {
        const { orderId, senderId, senderType, message, imageUrl } = messageData;

        // Check if chat is active
        const isActive = await this.isChatActive(orderId);
        if (!isActive) {
            throw new BadRequestError('Chat is not active for this order');
        }

        return await Database.transaction(async (transaction: Transaction) => {
            // Create message
            const newMessage = await ChatMessage.create(
                {
                    orderId,
                    senderId,
                    senderType,
                    message,
                    imageUrl: imageUrl ?? null,
                    isRead: false,
                } as ChatMessage,
                { transaction }
            );

            // Get sender info
            const sender = await User.findByPk(senderId, {
                attributes: ['id', 'firstName', 'lastName', 'displayImage'],
                transaction,
            });

            // Format message for response
            const formattedMessage: ChatMessageType = {
                id: newMessage.id,
                orderId: newMessage.orderId,
                senderId: newMessage.senderId,
                senderType: newMessage.senderType,
                message: newMessage.message,
                imageUrl: newMessage.imageUrl ?? undefined,
                isRead: newMessage.isRead,
                createdAt: newMessage.createdAt,
                updatedAt: newMessage.updatedAt,
            };

            // Emit to socket room (real-time delivery)
            const roomName = `order:${orderId}`;
            this.emitToRoom(roomName, 'new-message', formattedMessage);

            // Create notifications for recipients
            await this.createMessageNotifications(orderId, senderId, sender, message, transaction);

            return formattedMessage;
        });
    }

    /**
     * Get messages by order ID
     */
    async getMessagesByOrderId(orderId: string): Promise<ChatMessageType[]> {
        const messages = await ChatMessage.findAll({
            where: { orderId },
            include: [
                {
                    model: User,
                    as: 'sender',
                    attributes: ['id', 'firstName', 'lastName', 'displayImage'],
                },
            ],
            order: [['createdAt', 'ASC']],
        });

        return messages.map(message => ({
            id: message.id,
            orderId: message.orderId,
            senderId: message.senderId,
            senderType: message.senderType,
            message: message.message,
            imageUrl: message.imageUrl ?? undefined,
            isRead: message.isRead,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
        }));
    }

    /**
     * Mark messages as read
     */
    async markMessagesAsRead(orderId: string, userId: string): Promise<number> {
        const [updatedCount] = await ChatMessage.update(
            { isRead: true },
            {
                where: {
                    orderId,
                    senderId: { [Op.ne]: userId },
                    isRead: false,
                },
            }
        );

        // Mark related notifications as read if messages were updated
        if (updatedCount > 0) {
            await this.markNotificationsAsRead(orderId, userId);
        }

        // Emit read receipt to room
        const roomName = `order:${orderId}`;
        this.emitToRoom(roomName, 'messages-read', { orderId, userId });

        return updatedCount;
    }

    /**
     * Get unread message count
     */
    async getUnreadMessageCount(
        userId: string,
        orderId?: string
    ): Promise<{ total: number; byOrder?: Record<string, number> }> {
        if (orderId) {
            const count = await ChatMessage.count({
                where: {
                    senderId: { [Op.ne]: userId },
                    orderId,
                    isRead: false,
                },
            });
            return { total: count };
        }

        // Get counts grouped by orderId
        const unreadMessages = await ChatMessage.findAll({
            where: {
                senderId: { [Op.ne]: userId },
                isRead: false,
            },
            attributes: ['orderId', [Database.fn('COUNT', Database.col('id')), 'count']],
            group: ['orderId'],
            raw: true,
        }) as unknown as Array<{ orderId: string; count: string | number }>;

        const byOrder: Record<string, number> = {};
        let total = 0;

        unreadMessages.forEach(message => {
            const count = typeof message.count === 'string'
                ? parseInt(message.count, 10)
                : message.count;
            byOrder[message.orderId] = count;
            total += count;
        });

        return { total, byOrder };
    }

    /**
     * Activate chat for an order
     */
    async activateChat(data: ChatActivationType): Promise<boolean> {
        try {
            const { orderId, activatedBy } = data;
            logger.info('Activating chat with data:', data);

            // Store in Redis
            const chatKey = `chat:active:${orderId}`;
            await redisClient.set(
                chatKey,
                JSON.stringify({
                    activatedAt: new Date().toISOString(),
                    activatedBy,
                })
            );

            // Set expiration (24 hours)
            await redisClient.expire(chatKey, 86400);

            // Emit activation event to room
            const roomName = `order:${orderId}`;
            this.emitToRoom(roomName, 'chat-activated', data);

            // Create activation notifications
            await this.createActivationNotifications(orderId, activatedBy);

            return true;
        } catch (error) {
            logger.error('Error activating chat:', error);
            return false;
        }
    }

    /**
     * Get chat activation data
     */
    async getChatActivationData(orderId: string): Promise<ChatActivationType | null> {
        try {
            const chatKey = `chat:active:${orderId}`;
            const chatData = await redisClient.get(chatKey);

            if (!chatData) {
                return null;
            }

            const parsedData = JSON.parse(chatData);
            return {
                orderId,
                activatedBy: parsedData.activatedBy,
            };
        } catch (error) {
            logger.error('Error getting chat activation data:', error);
            return null;
        }
    }

    /**
     * Check if chat is active
     */
    async isChatActive(orderId: string): Promise<boolean> {
        try {
            const chatKey = `chat:active:${orderId}`;
            const chatData = await redisClient.get(chatKey);
            return !!chatData;
        } catch (error) {
            logger.error('Error checking if chat is active:', error);
            return false;
        }
    }

    /**
     * Handle user joining chat room
     */
    async handleUserJoinChat(orderId: string, userId: string, userType: SenderType, userName: string): Promise<void> {
        // Check if chat is active
        const isActive = await this.isChatActive(orderId);

        // Auto-activate if not active
        if (!isActive) {
            await this.activateChat({
                orderId,
                activatedBy: {
                    id: userId,
                    type: userType,
                    name: userName,
                },
            });
        }

        // Emit user joined event
        const roomName = `order:${orderId}`;
        this.emitToRoom(roomName, 'user-joined', {
            id: userId,
            name: userName,
            type: userType,
        });

        logger.info(`User ${userId} joined chat for order ${orderId}`);
    }

    /**
     * Handle user leaving chat room
     */
    async handleUserLeaveChat(orderId: string, userId: string, userType: SenderType, userName: string): Promise<void> {
        const roomName = `order:${orderId}`;
        this.emitToRoom(roomName, 'user-left', {
            id: userId,
            name: userName,
            type: userType,
        });

        // Optionally create notification
        await this.notifyUserLeftChat(orderId, { id: userId, type: userType, name: userName });

        logger.info(`User ${userId} left chat for order ${orderId}`);
    }

    /**
     * Handle typing indicator
     */
    async handleTypingIndicator(orderId: string, userId: string, userName: string, isTyping: boolean): Promise<void> {
        const roomName = `order:${orderId}`;
        this.emitToRoom(roomName, 'user-typing', {
            orderId,
            isTyping,
            user: {
                id: userId,
                name: userName,
            },
        });
    }

    /**
     * Send a message (for API endpoints)
     */
    async sendMessage(
        userId: string,
        userType: SenderType,
        orderId: string,
        message: string,
        imageUrl?: string
    ): Promise<ChatMessageType> {
        // Verify user has access to this order
        const hasAccess = await this.verifyOrderAccess(orderId, userId, userType);
        if (!hasAccess) {
            throw new BadRequestError('You do not have access to this order chat');
        }

        return await this.saveMessage({
            orderId,
            senderId: userId,
            senderType: userType,
            message,
            imageUrl,
        });
    }

    /**
     * Verify if a user has access to an order's chat
     */
    async verifyOrderAccess(orderId: string, userId: string, userType: SenderType): Promise<boolean> {
        const order = await Order.findByPk(orderId, {
            attributes: ['id', 'customerId', 'agentId'],
        });

        if (!order) {
            throw new NotFoundError('Order not found');
        }

        if (userType === 'admin') {
            return true; // Admins have access to all chats
        }

        if (userType === 'customer' && order.customerId === userId) {
            return true;
        }

        if (userType === 'agent' && order.agentId === userId) {
            return true;
        }

        return false;
    }

    /**
     * Create notifications for new messages
     */
    private async createMessageNotifications(
        orderId: string,
        senderId: string,
        sender: any,
        message: string,
        transaction: Transaction
    ): Promise<void> {
        try {
            const recipients = await this.getOrderParticipantsExcept(orderId, senderId, transaction);

            if (recipients.length > 0) {
                const senderName = sender
                    ? `${sender.firstName} ${sender.lastName}`.trim()
                    : 'User';

                // Get order details for better notification
                const order = await Order.findByPk(orderId, {
                    attributes: ['id', 'orderNumber', 'customerId', 'agentId'],
                    transaction,
                });

                if (!order) {
                    logger.error(`Order ${orderId} not found for notification`);
                    return;
                }

                // Create enhanced notifications with proper metadata
                const notifications = recipients.map(recipient => ({
                    id: uuidv4(),
                    title: NotificationTypes.CHAT_MESSAGE_RECEIVED,
                    message: message.length > 50 ? `${message.substring(0, 47)}...` : message,
                    heading: `New message from ${senderName}`,
                    read: false,
                    resource: orderId,
                    userId: recipient.id,
                    actorId: senderId,
                    // Additional metadata for enhanced notifications
                    metadata: {
                        orderNumber: order.orderNumber,
                        recipientType: recipient.type,
                        senderName,
                        messagePreview: message.length > 50 ? `${message.substring(0, 47)}...` : message,
                        timestamp: new Date().toISOString(),
                    },
                }));

                // Use rate-limited notification service
                await NotificationService.addNotifications(notifications, transaction);
            }
        } catch (error) {
            logger.error('Error creating chat message notifications:', error);
        }
    }

    /**
     * Create notifications for chat activation
     */
    private async createActivationNotifications(
        orderId: string,
        activatedBy: { id: string; type: SenderType; name: string }
    ): Promise<void> {
        try {
            const participants = await this.getOrderParticipantsExcept(orderId, activatedBy.id);

            if (participants.length > 0) {
                const notifications = participants.map(participant => ({
                    id: uuidv4(),
                    title: NotificationTypes.CHAT_ACTIVATED,
                    message: `Chat for order ${orderId} has been activated by ${activatedBy.name}`,
                    heading: 'Chat Activated',
                    read: false,
                    resource: orderId,
                    userId: participant.id,
                    actorId: activatedBy.id,
                }));

                await NotificationService.addNotifications(notifications);
            }
        } catch (error) {
            logger.error('Error creating chat activation notifications:', error);
        }
    }

    /**
     * Mark notifications as read
     */
    private async markNotificationsAsRead(orderId: string, userId: string): Promise<void> {
        try {
            const notifications = await Database.models.Notification.findAll({
                where: {
                    userId,
                    title: NotificationTypes.CHAT_MESSAGE_RECEIVED,
                    resource: orderId,
                    read: false,
                },
                raw: true,
            });

            for (const notification of notifications) {
                const notificationId = (notification as any).id;
                await NotificationService.updateSingleNotification(notificationId, {
                    read: true,
                });
            }
        } catch (error) {
            logger.error('Error updating chat notification status:', error);
        }
    }

    /**
     * Notify when user leaves chat
     */
    private async notifyUserLeftChat(
        orderId: string,
        user: { id: string; type: SenderType; name: string }
    ): Promise<boolean> {
        try {
            const participants = await this.getOrderParticipantsExcept(orderId, user.id);

            if (participants.length > 0) {
                const notifications = participants.map(participant => ({
                    id: uuidv4(),
                    title: NotificationTypes.USER_LEFT_CHAT,
                    message: `${user.name} (${user.type}) has left the chat for order ${orderId}`,
                    heading: 'User Left Chat',
                    read: false,
                    resource: orderId,
                    userId: participant.id,
                    actorId: user.id,
                }));

                await NotificationService.addNotifications(notifications);
                return true;
            }

            return false;
        } catch (error) {
            logger.error('Error creating user left chat notifications:', error);
            return false;
        }
    }

    /**
     * Get all participants in an order chat except the specified user
     */
    private async getOrderParticipantsExcept(
        orderId: string,
        excludeUserId: string,
        transaction?: Transaction
    ): Promise<{ id: string; type: string }[]> {
        try {
            const orderData = await Order.findByPk(orderId, {
                include: [
                    { model: User, as: 'customer' },
                    { model: User, as: 'agent' },
                ],
                transaction,
                raw: true,
                nest: true,
            });

            const order = this.validateOrderWithRelations(orderData);
            const participants = [];

            if (order.customer && order.customer.id !== excludeUserId) {
                participants.push({
                    id: order.customer.id,
                    type: 'customer',
                });
            }

            if (order.agent && order.agent.id !== excludeUserId) {
                participants.push({
                    id: order.agent.id,
                    type: 'agent',
                });
            }

            return participants;
        } catch (error) {
            logger.error('Error getting order participants:', error);
            return [];
        }
    }
}

// Export singleton instance
export default EnhancedChatService.getInstance();