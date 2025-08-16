import { Router } from 'express';
import { AuthenticatedRequest } from '../../middlewares/authMiddleware';
import { Response } from 'express';
import { basicAuth, AuthenticatedController } from '../../middlewares/authMiddleware';
import OrderService from '../../services/order.service';
import { BadRequestError } from '../../utils/customErrors';

const router = Router();

class WebhookStatusController {
    /**
     * Check order status by transaction ID - this serves as the webhook alternative
     * Returns the same format as the polling endpoint but checks the order status directly
     */
    static async checkOrderByTransaction(req: AuthenticatedRequest, res: Response): Promise<void> {
        const { transactionId } = req.params;

        if (!transactionId) {
            throw new BadRequestError('Transaction ID is required');
        }

        try {
            // Find order by transaction ID (paymentId field)
            const order = await OrderService.getOrderByPaymentId(transactionId);
            
            if (!order) {
                res.status(404).json({
                    status: 'error',
                    message: 'Order not found for this transaction',
                    data: null,
                });
                return;
            }

            // Check if user is authorized to view this order
            if (order.customerId !== req.user.id) {
                res.status(403).json({
                    status: 'error',
                    message: 'Not authorized to view this order',
                    data: null,
                });
                return;
            }

            // Return data in the same format as the AlatPay status endpoint
            const statusData = {
                Status: order.paymentStatus === 'completed' ? 'COMPLETED' : 
                       order.paymentStatus === 'failed' ? 'FAILED' :
                       order.paymentStatus === 'pending' ? 'PENDING' : 'PENDING',
                status: order.paymentStatus,
                order: {
                    id: order.id,
                    orderNumber: order.orderNumber,
                    totalAmount: order.totalAmount,
                    status: order.status,
                    paymentStatus: order.paymentStatus,
                    customerId: order.customerId,
                    agentId: order.agentId,
                    createdAt: order.createdAt,
                    updatedAt: order.updatedAt,
                },
                transactionId: transactionId,
            };

            res.status(200).json({
                status: 'success',
                message: 'Order status retrieved successfully',
                data: statusData,
            });
        } catch (error) {
            console.error('Error checking order by transaction:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to check order status',
                data: null,
            });
        }
    }
}

// Route to check order status by transaction ID (webhook alternative)
router.get(
    '/order-status/:transactionId',
    basicAuth('access'),
    AuthenticatedController(WebhookStatusController.checkOrderByTransaction),
);

export default router;