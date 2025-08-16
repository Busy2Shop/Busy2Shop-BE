import AlatPayClient, {
    AlatPayTransactionStatusResponse,
    AlatPayVirtualAccountResponse,
    AlatPayWebhookPayload,
} from '../../clients/alatpay.client';
import User from '../../models/user.model';
import { logger } from '../../utils/logger';
import { BadRequestError } from '../../utils/customErrors';
// import OrderService from '../../services/order.service';
import { paymentWebhookQueue } from '../../queues/payment.queue';

interface GenerateVirtualAccountParams {
    amount: number;
    orderId: string;
    orderNumber: string;
    description: string;
    user: User;
    currency: string;
}


export default class AlatPayService {
    /**
     * Generate a virtual account for payment
     */
    static async generateVirtualAccount(
        params: GenerateVirtualAccountParams,
    ): Promise<{ data: AlatPayVirtualAccountResponse }> {
        // try {
            const { amount, orderId, description, user, currency, orderNumber } = params;

            // Validate amount
            if (amount <= 0) {
                throw new BadRequestError('Amount must be greater than zero');
            }

            // Ensure amount is a number
            const numericAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
            if (isNaN(numericAmount) || numericAmount <= 0) {
                throw new BadRequestError('Invalid payment amount');
            }
        
            // Call AlatPay API to generate a virtual account
            const client = AlatPayClient.getInstance();
            const response = await client.generateVirtualAccount({
                amount: 100, // numericAmount,
                orderId: orderNumber,
                description,
                currency,
                customer: {
                    email: user.email,
                    phone: user.phone?.number || '',
                    firstName: user.firstName || 'User',
                    lastName: user.lastName || '',
                    metadata: JSON.stringify({ userId: user.id, orderId, orderNumber }),
                },
            });

            // Return response with proper structure matching AlatPayVirtualAccountResponse
            return { 
                data: response,
            };
        // } catch (error) {
        //     logger.error('Error generating virtual account:', error);
        //     throw error;
        // }
    }

    /**
     * Check the status of a transaction
     */
    static async checkTransactionStatus(
        transactionId: string,
    ): Promise<{ status: AlatPayTransactionStatusResponse['data']['status']; orderNumber: string }> {
        // try {
            const client = AlatPayClient.getInstance();
        const response = await client.getTransactionStatus(transactionId);
        
        // const order = {
        //     orderId: response.data.orderId,
        //     orderNumber: response.data.orderNumber,
        // }

            return { status: response.data.status, orderNumber: response.data.orderId };
        // } catch (error) {
        //     logger.error('Error checking transaction status:', error);
        //     throw error;
        // }
    }

    /**
     * Process webhook notification from AlatPay
     */
    static async processWebhook({ payload }: { payload: AlatPayWebhookPayload }): Promise<void> {
        // try {
            // Validate webhook payload
            const client = AlatPayClient.getInstance();
            const isValid = await client.validateWebhookPayload(payload);

            if (!isValid) {
                logger.warn('Invalid webhook payload received');
                return;
            }

            const { Data } = payload.Value;


            // Queue the webhook processing
            await paymentWebhookQueue.add('process-webhook', {
                providerTransactionId: Data.Id,
                transactionId: 'transaction-id-placeholder', // This should be replaced with actual transaction ID logic
                userId: 'user-id-placeholder', // Replace with actual user ID logic
            });

            logger.info(`Webhook queued for processing: ${Data.Id}`);
        // } catch (error) {
        //     logger.error('Error processing webhook:', error);
        //     throw error;
        // }
    }

    /**
     * Get transaction history
     */
    static async getTransactionHistory(
        page: number = 1,
        limit: number = 10,
        filters: Record<string, any> = {}
    ): Promise<{ data: any[]; pagination: { total: number; page: number; limit: number } }> {
        // try {
            const client = AlatPayClient.getInstance();
            const response = await client.getTransactionHistory(page, limit, filters);

            return {
                data: response.data.transactions,
                pagination: {
                    total: response.data.total,
                    page,
                    limit,
                },
            };
        // } catch (error) {
        //     logger.error('Error getting transaction history:', error);
        //     throw error;
        // }
    }
}
