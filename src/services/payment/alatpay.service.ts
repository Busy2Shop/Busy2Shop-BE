import AlatPayClient, {
    AlatPayTransactionStatusResponse,
    AlatPayVirtualAccountResponse,
    AlatPayWebhookPayload,
} from '../../clients/alatpay.client';
import User from '../../models/user.model';
import AlatPayment, { AlatPayStatus, IAlatPayment } from '../../models/payment/alatPayment.model';
import { logger } from '../../utils/logger';
import { BadRequestError } from '../../utils/customErrors';
import ShoppingListService from '../../services/shoppingList.service';
import OrderService from '../../services/order.service';
import { Op } from 'sequelize';
import { paymentProcessingQueue } from '../../queues/payment.queue';
import HelperUtils from '../../utils/helpers';
import UserService from '../user.service';

interface GenerateVirtualAccountParams {
    amount: number;
    orderId: string;
    description: string;
    user: User;
    currency: string;
    idempotencyKey?: string;
}

interface CheckExpiredTransactionsResult {
    processed: number;
    expired: string[];
    errors: string[];
}

export default class AlatPayService {
    /**
     * Generate a virtual account for payment
     */
    static async generateVirtualAccount(
        params: GenerateVirtualAccountParams
    ): Promise<{ data: AlatPayVirtualAccountResponse }> {
        try {
            const { amount, orderId, description, user, currency, idempotencyKey } = params;

            // Validate amount
            if (amount <= 0) {
                throw new BadRequestError('Amount must be greater than zero');
            }

            // Check if there's already a pending payment for this order
            const existingPayment = await AlatPayPayment.findOne({
                where: {
                    [Op.or]: [
                        { orderId, status: AlatPayStatus.PENDING },
                        { shoppingListId: orderId, status: AlatPayStatus.PENDING },
                    ],
                },
            });

            if (existingPayment && !idempotencyKey) {
                throw new BadRequestError('A pending payment already exists for this order');
            }

            // Generate a client reference to avoid duplicates (if idempotencyKey was provided)
            const clientReference = idempotencyKey || `${orderId}-${HelperUtils.generateRandomString(8)}`;

            // Call AlatPay API to generate a virtual account
            const client = AlatPayClient.getInstance();
            const response = await client.generateVirtualAccount({
                amount,
                orderId: clientReference,
                description,
                currency,
                customer: {
                    email: user.email,
                    phone: user.phone?.number || '',
                    firstName: user.firstName || 'User',
                    lastName: user.lastName || '',
                    metadata: JSON.stringify({ userId: user.id }),
                },
            });

            // Save the payment details to our database
            const paymentData: IAlatPayment = {
                transactionId: response.data.transactionId,
                amount,
                currency,
                virtualBankAccountNumber: response.data.virtualBankAccountNumber,
                virtualBankCode: response.data.virtualBankCode,
                status: AlatPayStatus.PENDING,
                expiredAt: new Date(response.data.expiredAt),
                userId: user.id,
                metadata: {
                    clientReference,
                    paymentType: 'virtual_account',
                },
                response: response.data,
            };

            // Determine if it's for an order or shopping list
            const isOrder = await OrderService.getOrder(orderId);
            if (isOrder) {
                paymentData.orderId = orderId;
            } else {
                const shoppingList = await ShoppingListService.getShoppingList(orderId);
                if (shoppingList) {
                    paymentData.shoppingListId = orderId;
                } else {
                    throw new BadRequestError('Invalid orderId provided');
                }
            }

            // Create the payment record
            await AlatPayPayment.create(paymentData);

            return { data: response.data };
        } catch (error) {
            logger.error('Error generating virtual account:', error);
            throw error;
        }
    }

    /**
     * Check the status of a transaction
     */
    static async checkTransactionStatus(
        transactionId: string
    ): Promise<{ data: AlatPayTransactionStatusResponse['data'] }> {
        try {
            const client = AlatPayClient.getInstance();
            const response = await client.getTransactionStatus(transactionId);

            // Update our payment record if the status has changed
            const payment = await AlatPayPayment.findOne({
                where: { transactionId },
            });

            if (payment) {
                const alatPayStatus = this.mapAlatPayStatusToLocal(response.data.status);

                if (payment.status !== alatPayStatus) {
                    // Queue payment processing if status changed to completed
                    if (alatPayStatus === AlatPayStatus.COMPLETED) {
                        payment.paidAt = new Date();
                        await paymentProcessingQueue.add(
                            'process-completed-payment',
                            {
                                paymentId: payment.id,
                                transactionId,
                            },
                            {
                                attempts: 3,
                                backoff: {
                                    type: 'exponential',
                                    delay: 1000,
                                },
                            }
                        );
                    }

                    // Update payment status
                    await payment.update({
                        status: alatPayStatus,
                        response: response.data,
                    });
                }
            }

            return { data: response.data };
        } catch (error) {
            logger.error('Error checking transaction status:', error);
            throw error;
        }
    }

    /**
     * Get transaction history
     */
    static async getTransactionHistory(
        page: number = 1,
        limit: number = 10,
        filters: any = {}
    ): Promise<{ data: any; pagination: any }> {
        try {
            const client = AlatPayClient.getInstance();
            const response = await client.getAllTransactions(page, limit, filters);

            return {
                data: response.data || [],
                pagination: {
                    currentPage: page,
                    pageSize: limit,
                    totalCount: response.total || 0,
                    totalPages: Math.ceil((response.total || 0) / limit),
                },
            };
        } catch (error) {
            logger.error('Error getting transaction history:', error);
            throw error;
        }
    }

    /**
     * Get user payments
     */
    static async getUserPayments(userId: string): Promise<AlatPayPayment[]> {
        try {
            const payments = await AlatPayPayment.findAll({
                where: { userId },
                order: [['createdAt', 'DESC']],
            });

            return payments;
        } catch (error) {
            logger.error('Error getting user payments:', error);
            throw error;
        }
    }

    /**
     * Process webhook notification from AlatPay
     */
    static async processWebhook(
        { payload }: { payload: AlatPayWebhookPayload }
    ): Promise<void> {
        try {
            // Validate webhook payload
            const client = AlatPayClient.getInstance();
            const isValid = await client.validateWebhookPayload(payload);

            if (!isValid) {
                logger.warn('Invalid webhook payload received');
                return;
            }

            const { Data } = payload.Value;

            // Find the corresponding payment in our database
            const payment = await AlatPayPayment.findOne({
                where: { transactionId: Data.Id },
            });

            if (!payment) {
                logger.warn(`Payment not found for transaction ID: ${Data.Id}`);
                return;
            }

            // Update payment status
            const alatPayStatus = this.mapAlatPayStatusToLocal(Data.Status);

            // Only process if the status has changed
            if (payment.status !== alatPayStatus) {
                if (alatPayStatus === AlatPayStatus.COMPLETED) {
                    payment.paidAt = new Date();

                    // Queue the payment processing task
                    await paymentProcessingQueue.add(
                        'process-completed-payment',
                        {
                            paymentId: payment.id,
                            transactionId: Data.Id,
                        },
                        {
                            attempts: 3,
                            backoff: {
                                type: 'exponential',
                                delay: 1000,
                            },
                        }
                    );
                }

                // Update payment record
                await payment.update({
                    status: alatPayStatus,
                    response: Data,
                });

                logger.info(`Payment ${Data.Id} status updated to ${alatPayStatus}`);
            }
        } catch (error) {
            logger.error('Error processing webhook:', error);
            throw error;
        }
    }

    /**
     * Process completed payment
     */
    static async processCompletedPayment(paymentId: string): Promise<void> {
        try {
            const payment = await AlatPayPayment.findByPk(paymentId);

            if (!payment) {
                throw new Error(`Payment not found: ${paymentId}`);
            }

            // Skip if payment is not completed
            if (payment.status !== AlatPayStatus.COMPLETED) {
                logger.warn(`Payment ${paymentId} status is ${payment.status}, not processing`);
                return;
            }

            // Skip if already processed
            if (payment.metadata?.processed) {
                logger.info(`Payment ${paymentId} already processed`);
                return;
            }

            // Process order payment
            if (payment.orderId) {
                await OrderService.processPayment(payment.orderId, payment.id);
            }

            // Process shopping list payment
            else if (payment.shoppingListId) {
                await ShoppingListService.processPayment(payment.shoppingListId, payment.id);
            }

            // Mark payment as processed
            await payment.update({
                metadata: {
                    ...payment.metadata as object,
                    processed: true,
                    processedAt: new Date().toISOString(),
                },
            });

            logger.info(`Payment ${paymentId} processed successfully`);
        } catch (error) {
            logger.error(`Error processing payment ${paymentId}:`, error);
            throw error;
        }
    }

    /**
     * Update payment status
     */
    static async updatePaymentStatus({
        transactionId,
        status,
        response,
    }: {
        transactionId: string;
        status: string;
        response: any;
    }): Promise<void> {
        try {
            const payment = await AlatPayPayment.findOne({
                where: { transactionId },
            });

            if (!payment) {
                logger.warn(`Payment not found for transaction ID: ${transactionId}`);
                return;
            }

            const alatPayStatus = this.mapAlatPayStatusToLocal(status);

            // Update payment record
            await payment.update({
                status: alatPayStatus,
                response,
                ...(alatPayStatus === AlatPayStatus.COMPLETED ? { paidAt: new Date() } : {}),
            });

            logger.info(`Payment ${transactionId} status updated to ${alatPayStatus}`);
        } catch (error) {
            logger.error(`Error updating payment status for ${transactionId}:`, error);
            throw error;
        }
    }

    /**
     * Check for and update expired transactions
     */
    static async checkExpiredTransactions(): Promise<CheckExpiredTransactionsResult> {
        try {
            const now = new Date();
            const pendingExpiredPayments = await AlatPayPayment.findAll({
                where: {
                    status: AlatPayStatus.PENDING,
                    expiredAt: { [Op.lt]: now },
                },
            });

            const result: CheckExpiredTransactionsResult = {
                processed: 0,
                expired: [],
                errors: [],
            };

            // Process each expired payment
            for (const payment of pendingExpiredPayments) {
                try {
                    // Double-check with AlatPay (in case payment was made but webhook failed)
                    const client = AlatPayClient.getInstance();
                    const response = await client.getTransactionStatus(payment.transactionId);

                    const alatPayStatus = this.mapAlatPayStatusToLocal(response.data.status);

                    // If the payment is actually completed according to AlatPay, process it
                    if (alatPayStatus === AlatPayStatus.COMPLETED) {
                        await payment.update({
                            status: AlatPayStatus.COMPLETED,
                            paidAt: new Date(),
                            response: response.data,
                        });

                        // Queue payment processing
                        await paymentProcessingQueue.add(
                            'process-completed-payment',
                            {
                                paymentId: payment.id,
                                transactionId: payment.transactionId,
                            },
                            {
                                attempts: 3,
                                backoff: {
                                    type: 'exponential',
                                    delay: 1000,
                                },
                            }
                        );
                    }
                    // If truly expired, update status
                    else if (alatPayStatus === AlatPayStatus.PENDING || alatPayStatus === AlatPayStatus.EXPIRED) {
                        await payment.update({
                            status: AlatPayStatus.EXPIRED,
                            response: response.data,
                        });
                        result.expired.push(payment.transactionId);
                    }

                    result.processed++;
                } catch (error) {
                    logger.error(`Error processing expired payment ${payment.transactionId}:`, error);
                    result.errors.push(payment.transactionId);
                }
            }

            return result;
        } catch (error) {
            logger.error('Error checking expired transactions:', error);
            throw error;
        }
    }

    /**
     * Reconcile transactions with AlatPay
     */
    static async reconcileTransactions({
        startDate,
        endDate,
    }: {
        startDate: Date;
        endDate: Date;
    }): Promise<any> {
        try {
            const client = AlatPayClient.getInstance();

            // Get transactions from AlatPay for the date range
            const alatPayTransactions = await client.getTransactionsByDateRange(
                startDate,
                endDate,
                1,
                1000 // Get a large batch
            );

            // Get our local transactions for the same period
            const localTransactions = await AlatPayPayment.findAll({
                where: {
                    createdAt: {
                        [Op.between]: [startDate, endDate],
                    },
                },
            });

            const results = {
                matched: 0,
                updated: 0,
                missing: 0,
                errors: 0,
            };

            // Map local transactions by transaction ID for easy lookup
            const localTransactionMap = new Map(
                localTransactions.map(t => [t.transactionId, t])
            );

            // Check each AlatPay transaction
            for (const transaction of alatPayTransactions.data) {
                try {
                    const localTransaction = localTransactionMap.get(transaction.Id);

                    // If we have the transaction locally
                    if (localTransaction) {
                        const alatPayStatus = this.mapAlatPayStatusToLocal(transaction.Status);

                        // If status mismatch, update our record
                        if (localTransaction.status !== alatPayStatus) {
                            await localTransaction.update({
                                status: alatPayStatus,
                                response: transaction,
                                ...(alatPayStatus === AlatPayStatus.COMPLETED && !localTransaction.paidAt
                                    ? { paidAt: new Date() }
                                    : {}),
                            });

                            // If now completed and not processed, queue it
                            if (
                                alatPayStatus === AlatPayStatus.COMPLETED &&
                                (!localTransaction.metadata?.processed)
                            ) {
                                await paymentProcessingQueue.add(
                                    'process-completed-payment',
                                    {
                                        paymentId: localTransaction.id,
                                        transactionId: transaction.Id,
                                    },
                                    {
                                        attempts: 3,
                                        backoff: {
                                            type: 'exponential',
                                            delay: 1000,
                                        },
                                    }
                                );
                            }

                            results.updated++;
                        } else {
                            results.matched++;
                        }
                    }
                    // Transaction in AlatPay but not in our system
                    else {
                        results.missing++;
                        // Log but don't create - this would require additional data
                        logger.warn(`Transaction ${transaction.Id} exists in AlatPay but not in our system`);
                    }
                } catch (error) {
                    logger.error(`Error reconciling transaction ${transaction.Id}:`, error);
                    results.errors++;
                }
            }

            return results;
        } catch (error) {
            logger.error('Error reconciling transactions:', error);
            throw error;
        }
    }

    /**
     * Get payment by ID
     */
    static async getPaymentById(paymentId: string): Promise<AlatPayPayment | null> {
        return AlatPayPayment.findByPk(paymentId);
    }

    /**
     * Get user by ID
     */
    static async getUserById(userId: string): Promise<User | null> {
        return UserService.viewSingleUser(userId);
    }

    /**
     * Map AlatPay status to our local status
     */
    private static mapAlatPayStatusToLocal(alatPayStatus: string): AlatPayStatus {
        switch (alatPayStatus.toLowerCase()) {
            case 'completed':
            case 'successful':
            case 'success':
                return AlatPayStatus.COMPLETED;
            case 'failed':
            case 'failure':
                return AlatPayStatus.FAILED;
            case 'expired':
                return AlatPayStatus.EXPIRED;
            case 'pending':
            default:
                return AlatPayStatus.PENDING;
        }
    }
}

// For TypeScript support (import alias)
const AlatPayPayment = AlatPayment;