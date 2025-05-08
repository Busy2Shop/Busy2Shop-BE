import { Transaction } from 'sequelize';
import AlatPayClient, { AlatPayVirtualAccountRequest, AlatPayVirtualAccountResponse, AlatPayTransactionStatusResponse, AlatPayWebhookPayload } from '../../clients/alatpay.client';
import { logger } from '../../utils/logger';
import { BadRequestError, NotFoundError } from '../../utils/customErrors';
import OrderService from '../order.service';
import User from '../../models/user.model';
import ShoppingList from '../../models/shoppingList.model';
import Order from '../../models/order.model';
import { Database } from '../../models';
import AlatPaymentRecordService from './alatPaymentRecord.service';
import { AlatPayStatus } from '../../models/payment/alatPayment.model';

interface GenerateVirtualAccountParams {
    amount: number;
    orderId: string;
    description: string;
    user: User;
}

interface ProcessWebhookParams {
    payload: AlatPayWebhookPayload;
    transaction?: Transaction;
}

export default class AlatPayService {
    private static client = AlatPayClient.getInstance();

    /**
     * Generate a virtual account for payment
     */
    public static async generateVirtualAccount(params: GenerateVirtualAccountParams): Promise<AlatPayVirtualAccountResponse> {
        const { amount, orderId, description, user } = params;

        try {
            // Format user data
            const phoneNumber = user.phone?.number || '';

            // Create request payload
            const request: Omit<AlatPayVirtualAccountRequest, 'businessId'> = {
                amount,
                currency: 'NGN', // Default to NGN, can be configurable
                orderId,
                description,
                customer: {
                    email: user.email,
                    phone: phoneNumber,
                    firstName: user.firstName || '',
                    lastName: user.lastName || '',
                    metadata: JSON.stringify({ userId: user.id }),
                },
            };

            // Call ALATPay client to generate virtual account
            const response = await this.client.generateVirtualAccount(request);

            // Log the response for debugging
            logger.info(`Generated virtual account for order ${orderId}:`, { orderId, virtualAccount: response.data.virtualBankAccountNumber });

            // Store the payment record in our database
            await AlatPaymentRecordService.createPaymentRecord({
                transactionId: response.data.transactionId,
                amount: response.data.amount,
                virtualBankAccountNumber: response.data.virtualBankAccountNumber,
                virtualBankCode: response.data.virtualBankCode,
                expiredAt: response.data.expiredAt,
                userId: user.id,
                orderId,
                metadata: {
                    description,
                    customer: response.data.customer,
                },
                response: response.data,
            });

            return response;
        } catch (error) {
            logger.error('Error generating virtual account:', error);
            throw new BadRequestError('Failed to generate virtual account for payment');
        }
    }

    /**
     * Check the status of a transaction
     */
    public static async checkTransactionStatus(transactionId: string): Promise<AlatPayTransactionStatusResponse> {
        try {
            const response = await this.client.getTransactionStatus(transactionId);

            // If we have a completed transaction, update our records
            if (response.data.status === 'completed') {
                await AlatPaymentRecordService.updatePaymentStatus({
                    transactionId,
                    status: AlatPayStatus.COMPLETED,
                    paidAt: new Date(),
                    response: response.data,
                });
            } else if (response.data.status === 'failed') {
                await AlatPaymentRecordService.updatePaymentStatus({
                    transactionId,
                    status: AlatPayStatus.FAILED,
                    response: response.data,
                });
            }

            return response;
        } catch (error) {
            logger.error('Error checking transaction status:', error);
            throw new BadRequestError('Failed to check transaction status');
        }
    }

    /**
     * Process a webhook from ALATPay
     */
    public static async processWebhook(params: ProcessWebhookParams): Promise<void> {
        const { payload, transaction } = params;

        try {
            // Validate webhook payload
            const isValid = await this.client.validateWebhookPayload(payload);
            if (!isValid) {
                logger.warn('Invalid webhook payload received');
                return;
            }

            const { Data } = payload.Value;
            const { OrderId, Status, Amount, Id: TransactionId } = Data;

            // Log the webhook data
            logger.info('Processing ALATPay webhook:', { orderId: OrderId, status: Status, amount: Amount });

            // If the payment is complete, update the order status
            if (Status === 'completed') {
                // Use a transaction if not provided
                const useTransaction = transaction || await Database.transaction();

                try {
                    // Update our payment record
                    const alatPayStatus = Status === 'completed' ? AlatPayStatus.COMPLETED :
                        Status === 'failed' ? AlatPayStatus.FAILED :
                            AlatPayStatus.PENDING;

                    await AlatPaymentRecordService.updatePaymentStatus({
                        transactionId: TransactionId,
                        status: alatPayStatus,
                        paidAt: Status === 'completed' ? new Date() : undefined,
                        response: Data,
                        transaction: useTransaction,
                    });

                    // Find the order
                    const order = await Order.findOne({
                        where: { id: OrderId },
                        transaction: useTransaction,
                    });

                    if (!order) {
                        logger.error(`Order ${OrderId} not found for webhook processing`);
                        if (!transaction) await useTransaction.rollback();
                        return;
                    }

                    // Update order status
                    await order.update({
                        status: 'accepted',
                        totalAmount: Amount,
                        // Add transaction reference or any other fields
                        // You might want to store the transactionId in a meta field or separate table
                    }, { transaction: useTransaction });

                    // Find the shopping list associated with this order
                    if (order.shoppingListId) {
                        const shoppingList = await ShoppingList.findByPk(order.shoppingListId, {
                            transaction: useTransaction,
                        });

                        if (shoppingList) {
                            // Update shopping list status
                            await shoppingList.update({
                                status: 'pending', // Or whatever status you use for paid orders
                            }, { transaction: useTransaction });
                        }
                    }

                    // Commit transaction if we started it
                    if (!transaction) await useTransaction.commit();

                    logger.info(`Successfully processed payment for order ${OrderId}`);
                } catch (error) {
                    // Rollback transaction if we started it
                    if (!transaction) await useTransaction.rollback();

                    logger.error('Error processing webhook:', error);
                    throw error;
                }
            }
        } catch (error) {
            logger.error('Error processing webhook:', error);
            throw error;
        }
    }

    /**
     * Get transaction history for a user
     */
    public static async getTransactionHistory(page: number = 1, limit: number = 10): Promise<any> {
        try {
            const response = await this.client.getAllTransactions(page, limit);
            return response;
        } catch (error) {
            logger.error('Error fetching transaction history:', error);
            throw new BadRequestError('Failed to fetch transaction history');
        }
    }

    /**
     * Get user payment records
     */
    public static async getUserPayments(userId: string): Promise<any> {
        try {
            const payments = await AlatPaymentRecordService.getPayments({ userId });
            return payments;
        } catch (error) {
            logger.error('Error fetching user payments:', error);
            throw new BadRequestError('Failed to fetch user payment records');
        }
    }
}