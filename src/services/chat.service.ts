import { Op, Transaction } from 'sequelize';
import { Database } from '../models';
import ChatMessage, { SenderType } from '../models/chatMessage.model';
import User from '../models/user.model';
import { redisClient } from '../utils/redis';
import { ChatMessageType } from 'clients/socket/types';
import NotificationService from './notification.service';
import { NotificationTypes } from '../utils/interface';
import Order from '../models/order.model';
import { v4 as uuidv4 } from 'uuid';

export interface ChatActivationType {
    orderId: string;
    activatedBy: {
        id: string;
        type: SenderType;
        name: string;
    };
}

interface IMessageData {
    orderId: string;
    senderId: string;
    senderType: SenderType;
    message: string;
    imageUrl?: string;
}

// Instead of extending Order, define an interface for the result of findByPk
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

// Function to validate order data at runtime
function validateOrderWithRelations(data: unknown): OrderWithRelations {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid order data: not an object');
    }

    // Use type assertion after basic validation
    const order = data as {
        id?: unknown;
        customer?: unknown;
        agent?: unknown;
    };

    if (typeof order.id !== 'string') {
        throw new Error('Invalid order data: missing or invalid id');
    }

    // Create the result object that we'll build up
    const result: OrderWithRelations = {
        id: order.id,
    };

    if (order.customer !== undefined) {
        if (typeof order.customer !== 'object' || order.customer === null) {
            throw new Error('Invalid order data: customer is not an object');
        }

        // Type assertion for customer
        const customer = order.customer as {
            id?: unknown;
            firstName?: unknown;
            lastName?: unknown;
        };

        if (typeof customer.id !== 'string') {
            throw new Error('Invalid order data: customer.id is missing or not a string');
        }

        // Add validated customer to result
        result.customer = {
            id: customer.id,
        };

        // Optional fields with validation
        if (customer.firstName !== undefined) {
            if (typeof customer.firstName !== 'string') {
                throw new Error('Invalid order data: customer.firstName is not a string');
            }
            result.customer.firstName = customer.firstName;
        }

        if (customer.lastName !== undefined) {
            if (typeof customer.lastName !== 'string') {
                throw new Error('Invalid order data: customer.lastName is not a string');
            }
            result.customer.lastName = customer.lastName;
        }
    }

    if (order.agent !== undefined) {
        if (typeof order.agent !== 'object' || order.agent === null) {
            throw new Error('Invalid order data: agent is not an object');
        }

        // Type assertion for agent
        const agent = order.agent as {
            id?: unknown;
            firstName?: unknown;
            lastName?: unknown;
        };

        if (typeof agent.id !== 'string') {
            throw new Error('Invalid order data: agent.id is missing or not a string');
        }

        // Add validated agent to result
        result.agent = {
            id: agent.id,
        };

        // Optional fields with validation
        if (agent.firstName !== undefined) {
            if (typeof agent.firstName !== 'string') {
                throw new Error('Invalid order data: agent.firstName is not a string');
            }
            result.agent.firstName = agent.firstName;
        }

        if (agent.lastName !== undefined) {
            if (typeof agent.lastName !== 'string') {
                throw new Error('Invalid order data: agent.lastName is not a string');
            }
            result.agent.lastName = agent.lastName;
        }
    }

    return result;
}

export class ChatService {
    static async saveMessage(messageData: IMessageData): Promise<ChatMessageType> {
        const { orderId, senderId, senderType, message, imageUrl } = messageData;

        return await Database.transaction(async (transaction: Transaction) => {
            // Create a message
            const newMessage = await ChatMessage.create(
                {
                    orderId,
                    senderId,
                    senderType,
                    message,
                    imageUrl: imageUrl ?? null,
                    isRead: false,
                } as ChatMessage,
                { transaction },
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

            // Create a notification for the recipients (anyone associated with the order except the sender)
            try {
                // First, get recipients who should be notified
                const recipients = await this.getOrderParticipantsExcept(
                    orderId,
                    senderId,
                    transaction,
                );

                if (recipients.length > 0) {
                    const senderName = sender
                        ? `${sender.firstName} ${sender.lastName}`
                        : senderType;

                    // Create a notification for each recipient - generate UUIDs for each notification
                    const notifications = recipients.map(recipient => ({
                        id: uuidv4(), // Generate UUID using uuid package
                        title: NotificationTypes.CHAT_MESSAGE_RECEIVED,
                        message: message.length > 50 ? `${message.substring(0, 47)}...` : message,
                        heading: `New message from ${senderName}`,
                        read: false,
                        resource: orderId, // The orderId is used as the resource to link to the specific chat
                        userId: recipient.id,
                        actorId: senderId,
                    }));

                    // Add notifications in bulk
                    await NotificationService.addNotifications(notifications, transaction);
                }
            } catch (error) {
                console.error('Error creating chat message notifications:', error);
                // Don't fail the transaction if notifications fail
            }

            return formattedMessage;
        });
    }

    // Helper method to get all participants in an order chat except the specified user
    private static async getOrderParticipantsExcept(
        orderId: string,
        excludeUserId: string,
        transaction?: Transaction,
    ): Promise<{ id: string; type: string }[]> {
        try {
            // Fetch the order with customer and agent
            const orderData = await Order.findByPk(orderId, {
                include: [
                    { model: User, as: 'customer' },
                    { model: User, as: 'agent' },
                ],
                transaction,
                raw: true, // Get raw data to avoid issues with model instances
                nest: true, // Nest the joined models
            });

            if (!orderData) {
                console.warn(`Order ${orderId} not found for chat participants`);
                return [];
            }

            const participants = [];

            // Add customer if not excluded and exists
            if (orderData.customer?.id && orderData.customer.id !== excludeUserId) {
                participants.push({
                    id: orderData.customer.id,
                    type: 'customer',
                });
            }

            // Add agent if not excluded and exists
            if (orderData.agent?.id && orderData.agent.id !== excludeUserId) {
                participants.push({
                    id: orderData.agent.id,
                    type: 'agent',
                });
            }

            // Fallback: if no agent in relationship but agentId exists, try to get agent ID directly
            if (!orderData.agent?.id && orderData.agentId && orderData.agentId !== excludeUserId) {
                participants.push({
                    id: orderData.agentId,
                    type: 'agent',
                });
            }

            return participants;
        } catch (error) {
            console.error('Error getting order participants:', error);
            return [];
        }
    }

    static async getMessagesByOrderId(orderId: string): Promise<ChatMessageType[]> {
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

        // Format messages for response
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

    static async markMessagesAsRead(orderId: string, userId: string): Promise<number> {
        const [updatedCount] = await ChatMessage.update(
            { isRead: true },
            {
                where: {
                    orderId,
                    senderId: { [Op.ne]: userId },
                    isRead: false,
                },
            },
        );

        // If messages were marked as read, also mark related notifications as read
        if (updatedCount > 0) {
            try {
                // Get all unread chat message notifications for this user and order
                const notifications = await Database.models.Notification.findAll({
                    where: {
                        userId,
                        title: NotificationTypes.CHAT_MESSAGE_RECEIVED,
                        resource: orderId,
                        read: false,
                    },
                    raw: true, // Get raw data
                });

                // Update each notification one by one
                for (const notification of notifications) {
                    // Type assertion to access id property
                    const notificationId = (notification as unknown as { id: string }).id;
                    await NotificationService.updateSingleNotification(notificationId, {
                        read: true,
                    });
                }
            } catch (error) {
                console.error('Error updating chat notification status:', error);
            }
        }

        return updatedCount;
    }

    static async getUnreadMessageCount(
        userId: string,
        orderId?: string,
    ): Promise<{ total: number; byOrder?: Record<string, number> }> {
        // If orderId is provided, just get the count for that order
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

        // If no orderId provided, get counts grouped by orderId
        interface UnreadMessageCount {
            orderId: string;
            count: string | number;
        }

        const unreadMessages = (await ChatMessage.findAll({
            where: {
                senderId: { [Op.ne]: userId },
                isRead: false,
            },
            attributes: ['orderId', [Database.fn('COUNT', Database.col('id')), 'count']],
            group: ['orderId'],
            raw: true,
        })) as unknown as UnreadMessageCount[];

        // Initialise the result object
        const byOrder: Record<string, number> = {};
        let total = 0;

        // Process the results
        unreadMessages.forEach((message: { orderId: string; count: string | number }) => {
            const count =
                typeof message.count === 'string' ? parseInt(message.count, 10) : message.count;
            byOrder[message.orderId] = count;
            total += count;
        });

        return { total, byOrder };
    }

    static async activateChat(data: ChatActivationType): Promise<boolean> {
        try {
            console.log('Activating chat with data:', data);
            const { orderId, activatedBy } = data;

            // Store in Redis
            const chatKey = `chat:active:${orderId}`;
            await redisClient.set(
                chatKey,
                JSON.stringify({
                    activatedAt: new Date().toISOString(),
                    activatedBy,
                }),
            );

            // Set expiration separately
            await redisClient.expire(chatKey, 86400); // 24 hours

            // Create a notification for all participants except the activator
            try {
                const participants = await this.getOrderParticipantsExcept(orderId, activatedBy.id);

                if (participants.length > 0) {
                    const notifications = participants.map(participant => ({
                        id: uuidv4(), // Generate UUID using uuid package
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
                console.error('Error creating chat activation notifications:', error);
                // Don't fail the operation if notifications fail
            }

            return true;
        } catch (error) {
            console.error('Error activating chat:', error);
            return false;
        }
    }

    static async getChatActivationData(orderId: string): Promise<ChatActivationType | null> {
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
            console.error('Error getting chat activation data:', error);
            return null;
        }
    }

    static async isChatActive(orderId: string): Promise<boolean> {
        try {
            const chatKey = `chat:active:${orderId}`;
            const chatData = await redisClient.get(chatKey);

            return !!chatData;
        } catch (error) {
            console.error('Error checking if chat is active:', error);
            return false;
        }
    }

    static async notifyUserLeftChat(
        orderId: string,
        user: { id: string; type: SenderType; name: string },
    ): Promise<boolean> {
        try {
            // Get all participants except the user who left
            const participants = await this.getOrderParticipantsExcept(orderId, user.id);

            if (participants.length > 0) {
                // Create notifications for remaining participants
                const notifications = participants.map(participant => ({
                    id: uuidv4(), // Generate UUID for each notification
                    title: NotificationTypes.USER_LEFT_CHAT,
                    message: `${user.name} (${user.type}) has left the chat for order ${orderId}`,
                    heading: 'User Left Chat',
                    read: false,
                    resource: orderId,
                    userId: participant.id,
                    actorId: user.id,
                }));

                // Add notifications to the database
                await NotificationService.addNotifications(notifications);
                return true;
            }

            return false;
        } catch (error) {
            console.error('Error creating user left chat notifications:', error);
            return false;
        }
    }
}
