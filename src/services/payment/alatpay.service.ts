import { Transaction } from 'sequelize';
import AlatPayClient, {
    AlatPayVirtualAccountRequest,
    AlatPayVirtualAccountResponse,
    AlatPayTransactionStatusResponse,
    AlatPayWebhookPayload,
} from '../../clients/alatpay.client';
import { logger } from '../../utils/logger';
import { BadRequestError, NotFoundError } from '../../utils/customErrors';
import OrderService from '../order.service';
import User from '../../models/user.model';
import ShoppingList from '../../models/shoppingList.model';
import Order from '../../models/order.model';
import { Database } from '../../models';
import AlatPaymentRecordService from './alatPaymentRecord.service';
import { AlatPayStatus } from '../../models/payment/alatPayment.model';
import { v4 as uuidv4 } from 'uuid';

interface GenerateVirtualAccountParams {
    amount: number;
    orderId: string;
    description: string;
    user: User;
    currency?: string;
    idempotencyKey?: string;
}

interface ProcessWebhookParams {
    payload: AlatPayWebhookPayload;
    transaction?: Transaction;
}

interface ReconcileTransactionsParams {
    startDate: Date;
    endDate: Date;
}

export default class AlatPayService {
    private static client = AlatPayClient.getInstance();

    /**
     * Generate a virtual account for payment
     */
    public static async generateVirtualAccount(
        params: GenerateVirtualAccountParams,
    ): Promise<AlatPayVirtualAccountResponse> {
        const { amount, orderId, description, user, currency = 'NGN', idempotencyKey } = params;

        try {
            // Format user data
            const phoneNumber = user.phone?.number || '';

            // Create request payload
            const request: Omit<AlatPayVirtualAccountRequest, 'businessId'> = {
                amount,
                currency, // Allow currency customization
                orderId,
                description,
                customer: {
                    email: user.email,
                    phone: phoneNumber,
                    firstName: user.firstName || '',
                    lastName: user.lastName || '',
                    metadata: JSON.stringify({
                        userId: user.id,
                        idempotencyKey: idempotencyKey || uuidv4(), // Add idempotency key to prevent duplicate transactions
                    }),
                },
            };

            // Call ALATPay client to generate virtual account
            const response = await this.client.generateVirtualAccount(request);

            // Log the response for debugging
            logger.info(`Generated virtual account for order ${orderId}:`, {
                orderId,
                virtualAccount: response.data.virtualBankAccountNumber,
                expiresAt: response.data.expiredAt,
            });

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
                    idempotencyKey: idempotencyKey || uuidv4(),
                },
                response: response.data,
            });

            return response;
        } catch (error) {
            logger.error('Error generating virtual account:', error);

            // More detailed error handling
            if (error.response && error.response.data) {
                logger.error('ALATPay API error details:', error.response.data);

                if (error.response.status === 400) {
                    throw new BadRequestError(
                        `Invalid request: ${error.response.data.message || 'Bad request'}`,
                    );
                } else if (error.response.status === 401 || error.response.status === 403) {
                    throw new BadRequestError('Authentication or authorization error with ALATPay');
                }
            }

            throw new BadRequestError('Failed to generate virtual account for payment');
        }
    }

    /**
     * Check the status of a transaction
     */
    public static async checkTransactionStatus(
        transactionId: string,
    ): Promise<AlatPayTransactionStatusResponse> {
        try {
            const response = await this.client.getTransactionStatus(transactionId);

            // Update our local records based on the status
            switch (response.data.status) {
                case 'completed':
                    await AlatPaymentRecordService.updatePaymentStatus({
                        transactionId,
                        status: AlatPayStatus.COMPLETED,
                        paidAt: new Date(),
                        response: response.data,
                    });
                    break;
                case 'failed':
                    await AlatPaymentRecordService.updatePaymentStatus({
                        transactionId,
                        status: AlatPayStatus.FAILED,
                        response: response.data,
                    });
                    break;
                case 'expired':
                    await AlatPaymentRecordService.updatePaymentStatus({
                        transactionId,
                        status: AlatPayStatus.EXPIRED,
                        response: response.data,
                    });
                    break;
                // Add any other status cases as needed
            }

            return response;
        } catch (error) {
            logger.error('Error checking transaction status:', error);

            if (error.response && error.response.status === 404) {
                throw new NotFoundError('Transaction not found on ALATPay');
            }

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
                logger.warn('Invalid webhook payload received', { payload });
                return;
            }

            const { Data } = payload.Value;
            const { OrderId, Status, Amount, Id: TransactionId } = Data;

            // Log the webhook data
            logger.info('Processing ALATPay webhook:', {
                orderId: OrderId,
                status: Status,
                amount: Amount,
                transactionId: TransactionId,
            });

            // Get our local payment record first
            const paymentRecord = await AlatPaymentRecordService.getPayment({
                transactionId: TransactionId,
            });

            if (!paymentRecord) {
                logger.warn(`Payment record for transaction ${TransactionId} not found locally`);
                // Optionally verify with ALATPay directly to confirm if transaction is legit
                const transactionDetails = await this.client.getTransactionStatus(TransactionId);

                if (!transactionDetails.status) {
                    logger.warn('Transaction could not be verified with ALATPay', {
                        TransactionId,
                    });
                    return;
                }

                // If transaction exists on ALATPay but not locally, we could create a record
                // This handles cases where webhook arrives before our database is updated

                // Add implementation as needed...
            }

            // If the payment is complete, update the order status
            if (Status === 'completed') {
                // Use a transaction if not provided
                const useTransaction = transaction || (await Database.transaction());

                try {
                    // Update our payment record
                    const alatPayStatus =
                        Status === 'completed'
                            ? AlatPayStatus.COMPLETED
                            : Status === 'failed'
                              ? AlatPayStatus.FAILED
                              : Status === 'expired'
                                ? AlatPayStatus.EXPIRED
                                : AlatPayStatus.PENDING;

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

                    // Verify payment amount matches expected amount
                    if (order.totalAmount != Amount) {
                        logger.warn(
                            `Payment amount mismatch: expected ${order.totalAmount}, received ${Amount}`,
                            {
                                orderId: OrderId,
                                transactionId: TransactionId,
                            },
                        );

                        // Handle amount discrepancy
                        // You might still want to accept the payment if amount is greater,
                        // or implement a policy for handling this
                    }

                    // Update order status
                    await order.update(
                        {
                            status: 'accepted',
                            paymentStatus: 'paid',
                            paymentReference: TransactionId,
                            paymentMethod: 'bank_transfer',
                            paidAt: new Date(),
                            // Add any other fields as needed
                        },
                        { transaction: useTransaction },
                    );

                    // Find the shopping list associated with this order
                    if (order.shoppingListId) {
                        const shoppingList = await ShoppingList.findByPk(order.shoppingListId, {
                            transaction: useTransaction,
                        });

                        if (shoppingList) {
                            // Update shopping list status
                            await shoppingList.update(
                                {
                                    status: 'pending', // Or whatever status you use for paid orders
                                    paymentStatus: 'paid',
                                },
                                { transaction: useTransaction },
                            );
                        }
                    }

                    // Commit transaction if we started it
                    if (!transaction) await useTransaction.commit();

                    logger.info(`Successfully processed payment for order ${OrderId}`);

                    // Trigger any post-payment processes
                    // e.g., send confirmation emails, notify agents, etc.
                    // These should be done AFTER transaction commit and possibly asynchronously
                } catch (error) {
                    // Rollback transaction if we started it
                    if (!transaction) await useTransaction.rollback();

                    logger.error('Error processing webhook:', error);
                    throw error;
                }
            } else if (Status === 'failed') {
                // Handle failed payments
                // Update order status or take appropriate action
                logger.info(`Payment failed for order ${OrderId}`);

                // You might want to notify the user or take other actions
            }
        } catch (error) {
            logger.error('Error processing webhook:', error);
            throw error;
        }
    }

    /**
     * Get transaction history for a user
     */
    public static async getTransactionHistory(
        page: number = 1,
        limit: number = 10,
        filters?: any,
    ): Promise<any> {
        try {
            const response = await this.client.getAllTransactions(page, limit, filters);
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

    /**
     * Reconcile local payment records with ALATPay records
     * This helps catch any discrepancies or missed webhooks
     */
    public static async reconcileTransactions(params: ReconcileTransactionsParams): Promise<any> {
        const { startDate, endDate } = params;

        try {
            // Get transactions from ALATPay for the given period
            const alatPayTransactions = await this.client.getTransactionsByDateRange(
                startDate,
                endDate,
                1, // page
                1000, // limit - adjust based on your needs
            );

            if (!alatPayTransactions.status || !alatPayTransactions.data) {
                throw new Error('Failed to fetch transactions from ALATPay');
            }

            const results = {
                processed: 0,
                mismatched: 0,
                missing: 0,
                updated: 0,
                errors: 0,
            };

            // Process each transaction
            for (const transaction of alatPayTransactions.data) {
                results.processed++;

                try {
                    // Check if we have this transaction in our system
                    const localTransaction = await AlatPaymentRecordService.getPayment({
                        transactionId: transaction.id,
                    });

                    if (!localTransaction) {
                        // Transaction exists in ALATPay but not in our system
                        results.missing++;

                        // If it's a completed payment, we might want to create a record
                        if (transaction.status === 'completed') {
                            logger.info(
                                `Found completed transaction ${transaction.id} missing from local database`,
                            );

                            // Create a record (simplified - you'd need to add more details)
                            // This assumes we can find the user by order ID
                            const order = await Order.findOne({
                                where: { id: transaction.orderId },
                            });

                            if (order) {
                                await AlatPaymentRecordService.createPaymentRecord({
                                    transactionId: transaction.id,
                                    amount: transaction.amount,
                                    virtualBankAccountNumber:
                                        transaction.ngnVirtualBankAccountNumber || '',
                                    virtualBankCode: transaction.ngnVirtualBankCode || '',
                                    expiredAt: new Date(), // This would need to be set properly
                                    userId: order.customerId,
                                    orderId: transaction.orderId,
                                    status: AlatPayStatus.COMPLETED,
                                    paidAt: new Date(transaction.updatedAt),
                                    response: transaction,
                                });

                                // Update order status if needed
                                await order.update({
                                    status: 'accepted',
                                    paymentStatus: 'paid',
                                    paymentReference: transaction.id,
                                    paymentMethod: 'bank_transfer',
                                    paidAt: new Date(transaction.updatedAt),
                                });

                                results.updated++;
                            }
                        }
                    } else if (localTransaction.status !== transaction.status) {
                        // Status mismatch between local and ALATPay
                        results.mismatched++;

                        // Update our record to match ALATPay
                        const alatPayStatus =
                            transaction.status === 'completed'
                                ? AlatPayStatus.COMPLETED
                                : transaction.status === 'failed'
                                  ? AlatPayStatus.FAILED
                                  : transaction.status === 'expired'
                                    ? AlatPayStatus.EXPIRED
                                    : AlatPayStatus.PENDING;

                        await AlatPaymentRecordService.updatePaymentStatus({
                            transactionId: transaction.id,
                            status: alatPayStatus,
                            paidAt:
                                transaction.status === 'completed'
                                    ? new Date(transaction.updatedAt)
                                    : undefined,
                            response: transaction,
                        });

                        results.updated++;
                    }
                } catch (error) {
                    logger.error(
                        `Error processing transaction ${transaction.id} during reconciliation:`,
                        error,
                    );
                    results.errors++;
                }
            }

            return {
                status: 'success',
                message: 'Reconciliation completed',
                results,
            };
        } catch (error) {
            logger.error('Error reconciling transactions:', error);
            throw new BadRequestError('Failed to reconcile transactions');
        }
    }

    /**
     * Verify if a transaction has expired and update its status
     */
    public static async checkExpiredTransactions(): Promise<any> {
        try {
            // Get all pending transactions that have expired
            const now = new Date();
            const expiredTransactions = await AlatPaymentRecordService.getPayments({
                status: AlatPayStatus.PENDING,
            });

            const results = {
                checked: 0,
                expired: 0,
                errors: 0,
            };

            for (const transaction of expiredTransactions) {
                results.checked++;

                try {
                    // Check if transaction has expired
                    if (transaction.expiredAt && new Date(transaction.expiredAt) < now) {
                        // Update status to expired
                        await AlatPaymentRecordService.updatePaymentStatus({
                            transactionId: transaction.transactionId,
                            status: AlatPayStatus.EXPIRED,
                        });

                        results.expired++;

                        logger.info(`Marked transaction ${transaction.transactionId} as expired`);
                    }
                } catch (error) {
                    logger.error(
                        `Error checking expiration for transaction ${transaction.transactionId}:`,
                        error,
                    );
                    results.errors++;
                }
            }

            return {
                status: 'success',
                message: 'Expired transactions check completed',
                results,
            };
        } catch (error) {
            logger.error('Error checking expired transactions:', error);
            throw new BadRequestError('Failed to check expired transactions');
        }
    }
}
