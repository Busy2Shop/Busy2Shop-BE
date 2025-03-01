import ChatMessage from '../models/chatMessage.model';
import { Transaction } from 'sequelize';
import { Database } from '../models';
import User from '../models/user.model';
import { logger } from '../utils/logger';

interface IMessageData {
    orderId: string;
    senderId: string;
    senderType: 'vendor' | 'user';
    message: string;
}

export class ChatService {
    /**
     * Save a new chat message
     * @param messageData Message data to save
     * @returns Saved message with sender info
     */
    static async saveMessage(messageData: IMessageData): Promise<any> {
        const transaction = await Database.transaction();
        try {
            const { orderId, senderId, senderType, message } = messageData;

            // Create the message
            const chatMessage = await ChatMessage.create(
                {
                    orderId,
                    senderId,
                    senderType,
                    message,
                    isRead: false,
                },
                { transaction }
            );

            // Get sender info
            const sender = await User.findByPk(senderId, {
                attributes: ['id', 'firstName', 'lastName', 'displayImage'],
                transaction,
            });

            await transaction.commit();

            // Return message with sender info
            return {
                id: chatMessage.id,
                orderId: chatMessage.orderId,
                message: chatMessage.message,
                createdAt: chatMessage.createdAt,
                isRead: chatMessage.isRead,
                sender: {
                    id: sender?.id,
                    name: `${sender?.firstName} ${sender?.lastName}`,
                    displayImage: sender?.displayImage,
                    type: senderType,
                },
            };
        } catch (error) {
            await transaction.rollback();
            logger.error('Error saving chat message:', error);
            throw error;
        }
    }

    /**
     * Get all messages for a specific order
     * @param orderId Order ID to get messages for
     * @returns Array of messages with sender info
     */
    static async getMessagesByOrderId(orderId: string): Promise<any[]> {
        try {
            // Get all messages for the order
            const messages = await ChatMessage.findAll({
                where: { orderId },
                order: [['createdAt', 'ASC']],
                include: [
                    {
                        model: User,
                        as: 'sender',
                        attributes: ['id', 'firstName', 'lastName', 'displayImage'],
                    },
                ],
            });

            // Format messages
            return messages.map((message) => ({
                id: message.id,
                orderId: message.orderId,
                message: message.message,
                createdAt: message.createdAt,
                isRead: message.isRead,
                sender: {
                    id: message.sender?.id,
                    name: `${message.sender?.firstName} ${message.sender?.lastName}`,
                    displayImage: message.sender?.displayImage,
                    type: message.senderType,
                },
            }));
        } catch (error) {
            logger.error('Error getting chat messages:', error);
            throw error;
        }
    }

    /**
     * Mark messages as read
     * @param orderId Order ID
     * @param userId User ID who is reading the messages
     */
    static async markMessagesAsRead(orderId: string, userId: string): Promise<void> {
        const transaction = await Database.transaction();
        try {
            // Mark all messages sent to this user as read
            await ChatMessage.update(
                { isRead: true },
                {
                    where: {
                        orderId,
                        senderId: { [Database.Op.ne]: userId }, // All messages not sent by this user
                        isRead: false,
                    },
                    transaction,
                }
            );

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            logger.error('Error marking messages as read:', error);
            throw error;
        }
    }

    /**
     * Get unread message count for a user
     * @param userId User ID
     * @returns Count of unread messages
     */
    static async getUnreadMessageCount(userId: string, orderId?: string): Promise<number> {
        try {
            const whereClause: any = {
                senderId: { [Database.Op.ne]: userId }, // Messages not sent by this user
                isRead: false,
            };

            // If orderId is provided, only count messages for that order
            if (orderId) {
                whereClause.orderId = orderId;
            }

            const count = await ChatMessage.count({
                where: whereClause,
            });

            return count;
        } catch (error) {
            logger.error('Error getting unread message count:', error);
            throw error;
        }
    }
}
