import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { BadRequestError } from '../utils/customErrors';
import EnhancedChatService from '../services/chat-enhanced.service';
import OrderService from '../services/order.service';
import CloudinaryClientConfig from '../clients/cloudinary.config';
import { logger } from '../utils/logger';

/**
 * Enhanced Chat Controller
 * Handles all chat-related HTTP endpoints using the enhanced chat service
 */
export default class EnhancedChatController {
    /**
     * Get messages for an order
     */
    static async getOrderMessages(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;
        const userId = req.user.id;
        const userType = req.user.status.userType;

        if (!orderId) {
            throw new BadRequestError('Order ID is required');
        }

        try {
            // Get order to validate access
            let order;
            try {
                order = await OrderService.getOrderByNumber(orderId);
            } catch {
                order = await OrderService.getOrder(orderId);
            }

            // Verify access using enhanced chat service
            const chatService = EnhancedChatService;
            const hasAccess = await chatService.verifyOrderAccess(order.id, userId, userType);
            if (!hasAccess) {
                throw new BadRequestError('You do not have access to this order chat');
            }

            // Check if chat is active
            const isChatActive = await chatService.isChatActive(order.id);
            if (!isChatActive) {
                throw new BadRequestError('Chat is not active for this order');
            }

            // Get messages
            const messages = await chatService.getMessagesByOrderId(order.id);

            // Mark messages as read
            await chatService.markMessagesAsRead(order.id, userId);

            res.status(200).json({
                status: 'success',
                message: 'Chat messages retrieved successfully',
                data: { messages },
            });
        } catch (error) {
            logger.error('Error getting order messages:', error);
            throw error;
        }
    }

    /**
     * Send a message in the chat
     */
    static async sendMessage(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;
        const { message, imageUrl } = req.body;
        const userId = req.user.id;
        const userType = req.user.status.userType;

        if (!orderId) {
            throw new BadRequestError('Order ID is required');
        }

        if (!message || message.trim().length === 0) {
            throw new BadRequestError('Message content is required');
        }

        try {
            // Get order to validate orderId format
            let order;
            try {
                order = await OrderService.getOrderByNumber(orderId);
            } catch {
                order = await OrderService.getOrder(orderId);
            }

            // Send message using enhanced chat service
            const chatService = EnhancedChatService;
            const savedMessage = await chatService.sendMessage(
                userId,
                userType,
                order.id,
                message.trim(),
                imageUrl
            );

            res.status(200).json({
                status: 'success',
                message: 'Message sent successfully',
                data: savedMessage,
            });
        } catch (error) {
            logger.error('Error sending message:', error);
            throw error;
        }
    }

    /**
     * Get unread message count
     */
    static async getUnreadMessageCount(req: AuthenticatedRequest, res: Response) {
        const { id } = req.user;
        const { orderId } = req.query;

        try {
            const chatService = EnhancedChatService;
            let result;

            if (orderId) {
                // Get order to validate orderId format
                let order;
                try {
                    order = await OrderService.getOrderByNumber(orderId as string);
                } catch {
                    order = await OrderService.getOrder(orderId as string);
                }
                result = await chatService.getUnreadMessageCount(id, order.id);
            } else {
                result = await chatService.getUnreadMessageCount(id);
            }

            res.status(200).json({
                status: 'success',
                message: 'Unread message count retrieved successfully',
                data: result,
            });
        } catch (error) {
            logger.error('Error getting unread message count:', error);
            throw error;
        }
    }

    /**
     * Mark messages as read
     */
    static async markMessagesAsRead(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;
        const { id } = req.user;

        if (!orderId) {
            throw new BadRequestError('Order ID is required');
        }

        try {
            // Get order to validate orderId format
            let order;
            try {
                order = await OrderService.getOrderByNumber(orderId);
            } catch {
                order = await OrderService.getOrder(orderId);
            }

            const chatService = EnhancedChatService;
            await chatService.markMessagesAsRead(order.id, id);

            res.status(200).json({
                status: 'success',
                message: 'Messages marked as read successfully',
            });
        } catch (error) {
            logger.error('Error marking messages as read:', error);
            throw error;
        }
    }

    /**
     * Activate chat for an order
     */
    static async activateChat(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;
        const userId = req.user.id;
        const userType = req.user.status.userType;
        const userName = `${req.user.firstName} ${req.user.lastName}`.trim();

        if (!orderId) {
            throw new BadRequestError('Order ID is required');
        }

        try {
            // Get order to validate access and orderId format
            let order;
            try {
                order = await OrderService.getOrderByNumber(orderId);
            } catch {
                order = await OrderService.getOrder(orderId);
            }

            // Verify access using enhanced chat service
            const chatService = EnhancedChatService;
            const hasAccess = await chatService.verifyOrderAccess(order.id, userId, userType);
            if (!hasAccess) {
                throw new BadRequestError('You do not have access to this order chat');
            }

            // Check if chat is already active
            const isChatActive = await chatService.isChatActive(order.id);
            if (isChatActive) {
                const activationData = await chatService.getChatActivationData(order.id);
                res.status(200).json({
                    status: 'success',
                    message: 'Chat is already active',
                    data: activationData,
                });
                return;
            }

            // Activate chat
            const activationData = {
                orderId: order.id,
                activatedBy: {
                    id: userId,
                    type: userType as 'agent' | 'customer' | 'admin',
                    name: userName,
                },
            };

            const success = await chatService.activateChat(activationData);

            if (success) {
                res.status(200).json({
                    status: 'success',
                    message: 'Chat activated successfully',
                    data: activationData,
                });
            } else {
                res.status(500).json({
                    status: 'error',
                    message: 'Failed to activate chat',
                });
            }
        } catch (error) {
            logger.error('Error activating chat:', error);
            throw error;
        }
    }

    /**
     * Check if chat is active for an order
     */
    static async isChatActive(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;

        try {
            // Get order to validate orderId format
            let actualOrderId;
            try {
                const order = await OrderService.getOrderByNumber(orderId);
                actualOrderId = order.id;
            } catch {
                actualOrderId = orderId;
            }

            const chatService = EnhancedChatService;
            const isChatActive = await chatService.isChatActive(actualOrderId);

            if (isChatActive) {
                const activationData = await chatService.getChatActivationData(actualOrderId);
                res.status(200).json({
                    status: 'success',
                    isActive: true,
                    data: activationData,
                });
            } else {
                res.status(200).json({
                    status: 'success',
                    isActive: false,
                });
            }
        } catch (error) {
            logger.error('Error checking chat status:', error);
            throw error;
        }
    }

    /**
     * Upload image for chat
     */
    static async uploadChatImage(req: AuthenticatedRequest, res: Response) {
        const userId = req.user.id;

        // Check if file exists in request
        const file = req.file;
        if (!file) {
            throw new BadRequestError('No image file provided');
        }

        try {
            // Upload image to Cloudinary
            const result = await CloudinaryClientConfig.uploadtoCloudinary({
                fileBuffer: file.buffer,
                id: userId,
                name: file.originalname,
                type: 'chat_image',
            });

            if (!result?.url) {
                throw new BadRequestError('Image upload failed');
            }

            res.status(200).json({
                status: 'success',
                message: 'Chat image uploaded successfully',
                data: {
                    imageUrl: result.url,
                },
            });
        } catch (error) {
            logger.error('Error uploading chat image:', error);
            throw error;
        }
    }
}