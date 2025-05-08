import AlatPayClient, {
    AlatPayTransactionStatusResponse,
    AlatPayVirtualAccountResponse,
    AlatPayWebhookPayload,
} from '../../clients/alatpay.client';
import User from '../../models/user.model';
import { logger } from '../../utils/logger';
import { BadRequestError } from '../../utils/customErrors';
import OrderService from '../../services/order.service';
import { paymentWebhookQueue, paymentExpiryCheckQueue } from '../../queues/payment.queue';
import HelperUtils from '../../utils/helpers';
import TransactionService from '../transaction.service';
import { TransactionStatus, TransactionType, PaymentMethod } from '../../models/transaction.model';

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
        params: GenerateVirtualAccountParams,
    ): Promise<{ data: AlatPayVirtualAccountResponse }> {
        try {
            const { amount, orderId, description, user, currency, idempotencyKey } = params;

            // Validate amount
            if (amount <= 0) {
                throw new BadRequestError('Amount must be greater than zero');
            }

            // Check if there's already a pending transaction for this order
            const existingTransaction = await TransactionService.getTransactionByReference(
                orderId,
                'order',
            );

            if (existingTransaction && !idempotencyKey) {
                throw new BadRequestError('A pending payment already exists for this order');
            }

            // Generate a client reference to avoid duplicates (if idempotencyKey was provided)
            const clientReference =
                idempotencyKey || `${orderId}-${HelperUtils.generateRandomString(8)}`;

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

            // Determine if it's for an order or shopping list
            const isOrder = await OrderService.getOrder(orderId);
            const referenceType = isOrder ? 'order' : 'shopping_list';

            // Create transaction record
            await TransactionService.createTransaction({
                amount,
                currency,
                type: TransactionType.ORDER,
                paymentMethod: PaymentMethod.ALATPAY,
                referenceId: orderId,
                referenceType,
                userId: user.id,
                status: TransactionStatus.PENDING,
                metadata: {
                    paymentProvider: 'alatpay',
                    providerTransactionId: response.data.transactionId,
                    providerResponse: response.data,
                    attempts: 0,
                    lastAttemptAt: new Date(),
                },
                ...(isOrder ? { orderId } : { shoppingListId: orderId }),
            });

            return { data: response };
        } catch (error) {
            logger.error('Error generating virtual account:', error);
            throw error;
        }
    }

    /**
     * Check the status of a transaction
     */
    static async checkTransactionStatus(
        transactionId: string,
    ): Promise<{ data: AlatPayTransactionStatusResponse['data'] }> {
        try {
            const client = AlatPayClient.getInstance();
            const response = await client.getTransactionStatus(transactionId);

            // Find the transaction by provider transaction ID
            const transaction = await TransactionService.getTransactionByProviderId(transactionId);

            if (transaction) {
                const alatPayStatus = this.mapAlatPayStatusToLocal(response.data.status);

                if (transaction.status !== alatPayStatus) {
                    // Queue webhook processing if status changed
                    await paymentWebhookQueue.add('process-webhook', {
                        providerTransactionId: transactionId,
                        transactionId: transaction.id,
                        userId: transaction.userId,
                    });

                    // Update transaction status
                    await TransactionService.updateTransactionStatus(
                        transaction.id,
                        alatPayStatus,
                        {
                            providerResponse: response.data,
                            attempts: (transaction.metadata.attempts || 0) + 1,
                            lastAttemptAt: new Date(),
                        },
                    );
                }
            }

            return { data: response.data };
        } catch (error) {
            logger.error('Error checking transaction status:', error);
            throw error;
        }
    }

    /**
     * Process webhook notification from AlatPay
     */
    static async processWebhook({ payload }: { payload: AlatPayWebhookPayload }): Promise<void> {
        try {
            // Validate webhook payload
            const client = AlatPayClient.getInstance();
            const isValid = await client.validateWebhookPayload(payload);

            if (!isValid) {
                logger.warn('Invalid webhook payload received');
                return;
            }

            const { Data } = payload.Value;

            // Find the transaction by provider transaction ID
            const transaction = await TransactionService.getTransactionByProviderId(Data.Id);

            if (!transaction) {
                logger.warn(`Transaction not found for provider transaction ID: ${Data.Id}`);
                return;
            }

            // Queue the webhook processing
            await paymentWebhookQueue.add('process-webhook', {
                providerTransactionId: Data.Id,
                transactionId: transaction.id,
                userId: transaction.userId,
            });

            logger.info(`Webhook queued for processing: ${Data.Id}`);
        } catch (error) {
            logger.error('Error processing webhook:', error);
            throw error;
        }
    }

    /**
     * Check for and update expired transactions
     */
    static async checkExpiredTransactions(): Promise<CheckExpiredTransactionsResult> {
        try {
            const pendingTransactions = await TransactionService.getUserTransactions('', 1, 1000, {
                status: TransactionStatus.PENDING,
            });

            const result: CheckExpiredTransactionsResult = {
                processed: 0,
                expired: [],
                errors: [],
            };

            // Process each pending transaction
            for (const transaction of pendingTransactions.transactions) {
                try {
                    // Double-check with AlatPay
                    const client = AlatPayClient.getInstance();
                    const response = await client.getTransactionStatus(
                        transaction.metadata.providerTransactionId,
                    );

                    const alatPayStatus = this.mapAlatPayStatusToLocal(response.data.status);

                    // If the transaction is actually completed according to AlatPay, process it
                    if (alatPayStatus === TransactionStatus.COMPLETED) {
                        await TransactionService.updateTransactionStatus(
                            transaction.id,
                            TransactionStatus.COMPLETED,
                            {
                                providerResponse: response.data,
                                attempts: (transaction.metadata.attempts || 0) + 1,
                                lastAttemptAt: new Date(),
                            },
                        );

                        // Queue webhook processing
                        await paymentWebhookQueue.add('process-webhook', {
                            providerTransactionId: transaction.metadata.providerTransactionId,
                            transactionId: transaction.id,
                            userId: transaction.userId,
                        });
                    }
                    // If truly expired, update status
                    else if (
                        alatPayStatus === TransactionStatus.PENDING ||
                        alatPayStatus === TransactionStatus.FAILED
                    ) {
                        await TransactionService.updateTransactionStatus(
                            transaction.id,
                            TransactionStatus.FAILED,
                            {
                                providerResponse: response.data,
                                attempts: (transaction.metadata.attempts || 0) + 1,
                                lastAttemptAt: new Date(),
                            },
                        );

                        // Queue expiry check
                        await paymentExpiryCheckQueue.add('check-expiry', {
                            transactionId: transaction.id,
                            userId: transaction.userId,
                        });

                        result.expired.push(transaction.metadata.providerTransactionId);
                    }

                    result.processed++;
                } catch (error) {
                    logger.error(`Error processing expired transaction ${transaction.id}:`, error);
                    result.errors.push(transaction.metadata.providerTransactionId);
                }
            }

            return result;
        } catch (error) {
            logger.error('Error checking expired transactions:', error);
            throw error;
        }
    }

    /**
     * Map AlatPay status to our local status
     */
    public static mapAlatPayStatusToLocal(alatPayStatus: string): TransactionStatus {
        switch (alatPayStatus.toLowerCase()) {
            case 'completed':
            case 'successful':
            case 'success':
                return TransactionStatus.COMPLETED;
            case 'failed':
            case 'failure':
                return TransactionStatus.FAILED;
            case 'expired':
                return TransactionStatus.FAILED;
            case 'pending':
            default:
                return TransactionStatus.PENDING;
        }
    }

    /**
     * Get transaction history
     */
    static async getTransactionHistory(
        page: number = 1,
        limit: number = 10,
        filters: Record<string, any> = {}
    ): Promise<{ data: any[]; pagination: { total: number; page: number; limit: number } }> {
        try {
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
        } catch (error) {
            logger.error('Error getting transaction history:', error);
            throw error;
        }
    }

    /**
     * Get user payments
     */
    static async getUserPayments(userId: string): Promise<any[]> {
        try {
            const transactions = await TransactionService.getUserTransactions(userId, 1, 1000, {
                paymentMethod: PaymentMethod.ALATPAY,
            });

            return transactions.transactions;
        } catch (error) {
            logger.error('Error getting user payments:', error);
            throw error;
        }
    }

    /**
     * Reconcile transactions with AlatPay
     */
    static async reconcileTransactions(): Promise<{
        reconciled: number;
        failed: number;
        errors: string[];
    }> {
        try {
            const result = {
                reconciled: 0,
                failed: 0,
                errors: [] as string[],
            };

            // Get all pending transactions
            const pendingTransactions = await TransactionService.getUserTransactions('', 1, 1000, {
                status: TransactionStatus.PENDING,
                paymentMethod: PaymentMethod.ALATPAY,
            });

            // Process each transaction
            for (const transaction of pendingTransactions.transactions) {
                try {
                    // Get status from AlatPay
                    const { data: statusResponse } = await this.checkTransactionStatus(
                        transaction.metadata.providerTransactionId
                    );

                    const alatPayStatus = this.mapAlatPayStatusToLocal(statusResponse.status);

                    // Update transaction status if different
                    if (transaction.status !== alatPayStatus) {
                        await TransactionService.updateTransactionStatus(
                            transaction.id,
                            alatPayStatus,
                            {
                                providerResponse: statusResponse,
                                attempts: (transaction.metadata.attempts || 0) + 1,
                                lastAttemptAt: new Date(),
                            }
                        );

                        // Queue webhook processing
                        await paymentWebhookQueue.add('process-webhook', {
                            providerTransactionId: transaction.metadata.providerTransactionId,
                            transactionId: transaction.id,
                            userId: transaction.userId,
                        });

                        result.reconciled++;
                    }
                } catch (error) {
                    logger.error(`Error reconciling transaction ${transaction.id}:`, error);
                    result.failed++;
                    result.errors.push(transaction.id);
                }
            }

            return result;
        } catch (error) {
            logger.error('Error reconciling transactions:', error);
            throw error;
        }
    }
}
