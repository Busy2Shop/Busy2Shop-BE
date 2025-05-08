import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { BadRequestError } from '../utils/customErrors';
import { ChatService } from '../services/chat.service';
import { ChatActivationType } from '../clients/socket/types';
import OrderService from '../services/order.service';
import CloudinaryClientConfig from '../clients/cloudinary.config';

export default class ChatController {
    /**
     * Validates if a user has permission to access an order's chat
     *
     * @param order - Order object containing agent and customer identifiers
     * @param userId - ID of the user attempting to access the chat
     * @param userType - Type of user ('agent' or 'customer')
     * @throws {BadRequestError} - When user doesn't have permission to access the chat
     *
     * For agents: Access is granted only if the order's agentId matches the userId
     * For customers: Access is granted only if the order's customerId matches the userId
     */
    private static verifyOrderAccess(
        order: { agentId?: string; customerId?: string },
        userId: string,
        userType: string,
    ): void {
        // Refactored to avoid duplicate BadRequestError
        const hasAccess =
            (userType === 'agent' && order.agentId === userId) ||
            (userType === 'customer' && order.customerId === userId);

        if (!hasAccess) {
            throw new BadRequestError('You do not have access to this order chat');
        }
    }

    static async getOrderMessages(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;
        const userId = req.user.id;

        if (!orderId) {
            throw new BadRequestError('Order ID is required');
        }

        // Verify the order exists and the user has access to it
        const order = await OrderService.getOrder(orderId);

        // Check if the user is authorized to access this order's chat
        ChatController.verifyOrderAccess(order, userId, req.user.status.userType);

        // Check if the chat is active
        const isChatActive = await ChatService.isChatActive(orderId);
        if (!isChatActive) {
            throw new BadRequestError('Chat is not active for this order');
        }

        const messages = await ChatService.getMessagesByOrderId(orderId);

        // Mark messages as read
        await ChatService.markMessagesAsRead(orderId, userId);

        res.status(200).json({
            status: 'success',
            message: 'Chat messages retrieved successfully',
            data: {
                messages,
            },
        });
    }

    static async getUnreadMessageCount(req: AuthenticatedRequest, res: Response) {
        const { id } = req.user;
        const { orderId } = req.query;

        let result;

        if (orderId) {
            await OrderService.getOrder(orderId as string);
            result = await ChatService.getUnreadMessageCount(id, orderId as string);
        } else {
            result = await ChatService.getUnreadMessageCount(id);
        }

        res.status(200).json({
            status: 'success',
            message: 'Unread message count retrieved successfully',
            data: result,
        });
    }

    static async markMessagesAsRead(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;
        const { id } = req.user;

        if (!orderId) {
            throw new BadRequestError('Order ID is required');
        }

        await ChatService.markMessagesAsRead(orderId, id);

        res.status(200).json({
            status: 'success',
            message: 'Messages marked as read successfully',
        });
    }

    static async activateChat(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;
        const userId = req.user.id;
        const userType = req.user.status.userType;
        const userName = req.user.firstName + ' ' + req.user.lastName;

        if (!orderId) {
            throw new BadRequestError('Order ID is required');
        }

        // Verify the order exists and the user has access to it
        const order = await OrderService.getOrder(orderId);

        // Check if the user is authorized to access this order's chat
        ChatController.verifyOrderAccess(order, userId, userType);

        // Check if the chat is already active
        const isChatActive = await ChatService.isChatActive(orderId);
        if (isChatActive) {
            const activationData = await ChatService.getChatActivationData(orderId);
            res.status(200).json({
                status: 'success',
                message: 'Chat is already active',
                data: activationData,
            });
            return;
        }

        // Activate chat
        const activationData: ChatActivationType = {
            orderId,
            activatedBy: {
                id: userId,
                type: userType as 'agent' | 'customer' | 'admin',
                name: userName,
            },
        };

        const success = await ChatService.activateChat(activationData);

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
    }

    static async isChatActive(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;

        const isChatActive = await ChatService.isChatActive(orderId);

        if (isChatActive) {
            const activationData = await ChatService.getChatActivationData(orderId);
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
    }

    static async uploadChatImage(req: AuthenticatedRequest, res: Response) {
        const userId = req.user.id;

        // Check if the file exists in the request
        // eslint-disable-next-line no-undef
        const file = req.file;

        if (!file) {
            throw new BadRequestError('No image file provided');
        }

        // Upload image to Cloudinary using the same pattern as other controllers
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
    }
}
