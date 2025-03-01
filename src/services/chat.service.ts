import { Op } from 'sequelize';
import { Database } from '../models';
import ChatMessage, { SenderType } from '../models/chatMessage.model';
import User from '../models/user.model';
import { redisClient } from '../utils/redis';
import { Transaction } from 'sequelize';
import { ChatMessageType } from 'clients/socket/types';

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

export class ChatService {
    static async saveMessage(messageData: IMessageData): Promise<ChatMessageType> {
        const { orderId, senderId, senderType, message, imageUrl } = messageData;

        return await Database.transaction(async (transaction: Transaction) => {
            // Create message
            const newMessage = await ChatMessage.create({
                orderId,
                senderId,
                senderType,
                message,
                imageUrl: imageUrl || null,
                isRead: false,
            } as ChatMessage, { transaction });

            // Get sender info
            await User.findByPk(senderId, {
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
                imageUrl: newMessage.imageUrl || undefined,
                isRead: newMessage.isRead,
                createdAt: newMessage.createdAt,
                updatedAt: newMessage.updatedAt,
            };

            return formattedMessage;
        });
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
        const formattedMessages: ChatMessageType[] = messages.map((message) => ({
            id: message.id,
            orderId: message.orderId,
            senderId: message.senderId,
            senderType: message.senderType,
            message: message.message,
            imageUrl: message.imageUrl || undefined,
            isRead: message.isRead,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
        }));

        return formattedMessages;
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
            }
        );

        return updatedCount;
    }

    static async getUnreadMessageCount(userId: string, orderId?: string): Promise<{ total: number; byOrder?: Record<string, number> }> {
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

        const unreadMessages = await ChatMessage.findAll({
            where: {
                senderId: { [Op.ne]: userId },
                isRead: false,
            },
            attributes: ['orderId', [Database.fn('COUNT', Database.col('id')), 'count']],
            group: ['orderId'],
            raw: true,
        }) as unknown as UnreadMessageCount[];

        // Initialize the result object
        const byOrder: Record<string, number> = {};
        let total = 0;

        // Process the results
        unreadMessages.forEach((message: { orderId: string; count: string | number }) => {
            const count = typeof message.count === 'string' ? parseInt(message.count, 10) : message.count;
            byOrder[message.orderId] = count;
            total += count;
        });

        return { total, byOrder };
    }

    static async activateChat(data: ChatActivationType): Promise<boolean> {
        try {
            const { orderId, activatedBy } = data;

            // Store in Redis
            const chatKey = `chat:active:${orderId}`;
            await redisClient.set(
                chatKey,
                JSON.stringify({
                    activatedAt: new Date().toISOString(),
                    activatedBy,
                })
            );

            // Set expiration separately
            await redisClient.expire(chatKey, 86400); // 24 hours

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
}