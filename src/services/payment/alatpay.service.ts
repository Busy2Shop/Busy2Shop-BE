import AlatPayClient, {
    AlatPayTransactionStatusResponse,
    AlatPayVirtualAccountResponse,
    AlatPayWebhookPayload,
} from '../../clients/alatpay.client';
import User from '../../models/user.model';
import { logger } from '../../utils/logger';
import { BadRequestError } from '../../utils/customErrors';
import ShoppingListService from '../../services/shoppingList.service';
import OrderService from '../../services/order.service';
import { paymentProcessingQueue } from '../../queues/payment.queue';
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
        params: GenerateVirtualAccountParams
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
                'order'
            );

            if (existingTransaction && !idempotencyKey) {
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
        transactionId: string
    ): Promise<{ data: AlatPayTransactionStatusResponse['data'] }> {
        try {
            const client = AlatPayClient.getInstance();
            const response = await client.getTransactionStatus(transactionId);

            // Find the transaction by provider transaction ID
            const transaction = await TransactionService.getTransactionByProviderId(transactionId);

            if (transaction) {
                const alatPayStatus = this.mapAlatPayStatusToLocal(response.data.status);

                if (transaction.status !== alatPayStatus) {
                    // Queue transaction processing if status changed to completed
                    if (alatPayStatus === TransactionStatus.COMPLETED) {
                        await paymentProcessingQueue.add(
                            'process-completed-payment',
                            {
                                transactionId: transaction.id,
                                providerTransactionId: transactionId,
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

                    // Update transaction status
                    await TransactionService.updateTransactionStatus(
                        transaction.id,
                        alatPayStatus,
                        {
                            providerResponse: response.data,
                            attempts: (transaction.metadata.attempts || 0) + 1,
                            lastAttemptAt: new Date(),
                        }
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

            // Find the transaction by provider transaction ID
            const transaction = await TransactionService.getTransactionByProviderId(Data.Id);

            if (!transaction) {
                logger.warn(`Transaction not found for provider transaction ID: ${Data.Id}`);
                return;
            }

            // Update transaction status
            const alatPayStatus = this.mapAlatPayStatusToLocal(Data.Status);

            // Only process if the status has changed
            if (transaction.status !== alatPayStatus) {
                if (alatPayStatus === TransactionStatus.COMPLETED) {
                    // Queue the transaction processing task
                    await paymentProcessingQueue.add(
                        'process-completed-payment',
                        {
                            transactionId: transaction.id,
                            providerTransactionId: Data.Id,
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

                // Update transaction record
                await TransactionService.updateTransactionStatus(
                    transaction.id,
                    alatPayStatus,
                    {
                        providerResponse: Data,
                        attempts: (transaction.metadata.attempts || 0) + 1,
                        lastAttemptAt: new Date(),
                    }
                );

                logger.info(`Transaction ${Data.Id} status updated to ${alatPayStatus}`);
            }
        } catch (error) {
            logger.error('Error processing webhook:', error);
            throw error;
        }
    }

    /**
     * Process completed payment
     */
    static async processCompletedPayment(transactionId: string): Promise<void> {
        try {
            const transaction = await TransactionService.getTransaction(transactionId);

            // Skip if transaction is not completed
            if (transaction.status !== TransactionStatus.COMPLETED) {
                logger.warn(`Transaction ${transactionId} status is ${transaction.status}, not processing`);
                return;
            }

            // Skip if already processed
            if (transaction.processedAt) {
                logger.info(`Transaction ${transactionId} already processed`);
                return;
            }

            // Process order payment
            if (transaction.orderId) {
                await OrderService.processOrderPayment(transaction.orderId, transaction.id);
            }
            // Process shopping list payment
            else if (transaction.shoppingListId) {
                await ShoppingListService.processShoppingListPayment(transaction.shoppingListId, transaction.id);
            }

            logger.info(`Transaction ${transactionId} processed successfully`);
        } catch (error) {
            logger.error(`Error processing transaction ${transactionId}:`, error);
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
                        transaction.metadata.providerTransactionId
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
                            }
                        );

                        // Queue transaction processing
                        await paymentProcessingQueue.add(
                            'process-completed-payment',
                            {
                                transactionId: transaction.id,
                                providerTransactionId: transaction.metadata.providerTransactionId,
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
                    else if (alatPayStatus === TransactionStatus.PENDING || alatPayStatus === TransactionStatus.FAILED) {
                        await TransactionService.updateTransactionStatus(
                            transaction.id,
                            TransactionStatus.FAILED,
                            {
                                providerResponse: response.data,
                                attempts: (transaction.metadata.attempts || 0) + 1,
                                lastAttemptAt: new Date(),
                            }
                        );
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
    private static mapAlatPayStatusToLocal(alatPayStatus: string): TransactionStatus {
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
}