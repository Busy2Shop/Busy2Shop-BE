import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { BadRequestError, NotFoundError } from '../utils/customErrors';
import { ChatService } from '../services/chat.service';
import ShoppingList from '../models/shoppingList.model';

export default class ChatController {
    /**
     * Get chat messages for a specific order
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getOrderMessages(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;
        const { id, status } = req.user;

        if (!orderId) {
            throw new BadRequestError('Order ID is required');
        }

        // Verify the order exists and user has access to it
        const order = await ShoppingList.findByPk(orderId);
        
        if (!order) {
            throw new NotFoundError('Order not found');
        }

        // Check if user is authorized to access this order's chat
        if (status.userType === 'vendor' && order.vendorId !== id) {
            throw new BadRequestError('You do not have access to this order chat');
        } else if (status.userType === 'user' && order.userId !== id) {
            throw new BadRequestError('You do not have access to this order chat');
        }

        // Get messages
        const messages = await ChatService.getMessagesByOrderId(orderId);

        // Mark messages as read
        await ChatService.markMessagesAsRead(orderId, id);

        res.status(200).json({
            status: 'success',
            message: 'Chat messages retrieved successfully',
            data: {
                messages,
            },
        });
    }

    /**
     * Get unread message count for the user
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getUnreadMessageCount(req: AuthenticatedRequest, res: Response) {
        const { id } = req.user;
        const { orderId } = req.query;

        let count: number;
        
        if (orderId) {
            count = await ChatService.getUnreadMessageCount(id, orderId as string);
        } else {
            count = await ChatService.getUnreadMessageCount(id);
        }

        res.status(200).json({
            status: 'success',
            message: 'Unread message count retrieved successfully',
            data: {
                count,
            },
        });
    }

    /**
     * Mark messages as read for a specific order
     * @param req AuthenticatedRequest
     * @param res Response
     */
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
}
