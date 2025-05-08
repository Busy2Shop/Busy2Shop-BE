import {
    Transaction,
    TransactionStatus,
    TransactionType,
    PaymentMethod,
    ITransaction,
} from '../models/transaction.model';
import { logger } from '../utils/logger';
import { BadRequestError, NotFoundError } from '../utils/customErrors';
import { Op } from 'sequelize';
import { Database } from '../models';

export default class TransactionService {
    /**
     * Create a new transaction
     */
    static async createTransaction(transactionData: ITransaction): Promise<Transaction> {
        try {
            return await Transaction.create(transactionData);
        } catch (error) {
            logger.error('Error creating transaction:', error);
            throw error;
        }
    }

    /**
     * Get a transaction by ID
     */
    static async getTransaction(id: string): Promise<Transaction> {
        const transaction = await Transaction.findByPk(id, {
            include: ['user', 'order', 'shoppingList'],
        });

        if (!transaction) {
            throw new NotFoundError('Transaction not found');
        }

        return transaction;
    }

    /**
     * Get transactions for a user
     */
    static async getUserTransactions(
        userId: string,
        page: number = 1,
        limit: number = 10,
        filters: any = {},
    ): Promise<{ transactions: Transaction[]; count: number; totalPages: number }> {
        const where: any = { userId };

        // Apply filters
        if (filters.status) {
            where.status = filters.status;
        }
        if (filters.type) {
            where.type = filters.type;
        }
        if (filters.paymentMethod) {
            where.paymentMethod = filters.paymentMethod;
        }
        if (filters.startDate && filters.endDate) {
            where.createdAt = {
                [Op.between]: [new Date(filters.startDate), new Date(filters.endDate)],
            };
        }

        const { rows: transactions, count } = await Transaction.findAndCountAll({
            where,
            include: ['order', 'shoppingList'],
            order: [['createdAt', 'DESC']],
            limit,
            offset: (page - 1) * limit,
        });

        return {
            transactions,
            count,
            totalPages: Math.ceil(count / limit),
        };
    }

    /**
     * Update transaction status
     */
    static async updateTransactionStatus(
        id: string,
        status: TransactionStatus,
        metadata: any = {},
    ): Promise<Transaction> {
        return await Database.transaction(async transaction => {
            const existingTransaction = await Transaction.findByPk(id, { transaction });

            if (!existingTransaction) {
                throw new NotFoundError('Transaction not found');
            }

            const updateData: any = {
                status,
                metadata: {
                    ...existingTransaction.metadata,
                    ...metadata,
                },
            };

            // Set processedAt if status is completed
            if (status === TransactionStatus.COMPLETED) {
                updateData.processedAt = new Date();
            }

            // Set refundedAt if status is refunded or partially_refunded
            if (
                status === TransactionStatus.REFUNDED ||
                status === TransactionStatus.PARTIALLY_REFUNDED
            ) {
                updateData.refundedAt = new Date();
            }

            await existingTransaction.update(updateData, { transaction });

            return await this.getTransaction(id);
        });
    }

    /**
     * Process a refund
     */
    static async processRefund(id: string, amount: number, reason: string): Promise<Transaction> {
        return await Database.transaction(async transaction => {
            const existingTransaction = await Transaction.findByPk(id, { transaction });

            if (!existingTransaction) {
                throw new NotFoundError('Transaction not found');
            }

            if (existingTransaction.status !== TransactionStatus.COMPLETED) {
                throw new BadRequestError('Can only refund completed transactions');
            }

            if (amount > existingTransaction.amount) {
                throw new BadRequestError('Refund amount cannot exceed transaction amount');
            }

            const isPartialRefund = amount < existingTransaction.amount;
            const newStatus = isPartialRefund
                ? TransactionStatus.PARTIALLY_REFUNDED
                : TransactionStatus.REFUNDED;

            await existingTransaction.update(
                {
                    status: newStatus,
                    refundAmount: amount,
                    refundReason: reason,
                    refundedAt: new Date(),
                    metadata: {
                        ...existingTransaction.metadata,
                        refundAmount: amount,
                        refundReason: reason,
                        refundedAt: new Date(),
                    },
                },
                { transaction },
            );

            return await this.getTransaction(id);
        });
    }

    /**
     * Get transaction by reference
     */
    static async getTransactionByReference(
        referenceId: string,
        referenceType: 'order' | 'shopping_list',
    ): Promise<Transaction | null> {
        return await Transaction.findOne({
            where: {
                referenceId,
                referenceType,
            },
            include: ['user', 'order', 'shoppingList'],
        });
    }

    /**
     * Get transaction by provider transaction ID
     */
    static async getTransactionByProviderId(
        providerTransactionId: string,
    ): Promise<Transaction | null> {
        return await Transaction.findOne({
            where: {
                'metadata.providerTransactionId': providerTransactionId,
            },
            include: ['user', 'order', 'shoppingList'],
        });
    }
}
