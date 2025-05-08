import { Transaction } from 'sequelize';
import { BadRequestError, NotFoundError } from '../../utils/customErrors';
import AlatPayment, { AlatPayStatus, IAlatPayment } from '../../models/payment/alatPayment.model';
import { logger } from '../../utils/logger';

interface CreatePaymentRecordParams {
    transactionId: string;
    amount: number;
    virtualBankAccountNumber: string;
    virtualBankCode: string;
    expiredAt: string | Date;
    userId: string;
    orderId?: string;
    shoppingListId?: string;
    metadata?: object;
    response?: object;
    transaction?: Transaction;
}

interface UpdatePaymentStatusParams {
    transactionId: string;
    status: AlatPayStatus;
    paidAt?: Date;
    response?: object;
    transaction?: Transaction;
}

interface GetPaymentParams {
    id?: string;
    transactionId?: string;
    userId?: string;
    orderId?: string;
    shoppingListId?: string;
    status?: AlatPayStatus;
}

export default class AlatPaymentRecordService {
    /**
     * Create a new payment record
     */
    public static async createPaymentRecord(
        params: CreatePaymentRecordParams,
    ): Promise<AlatPayment> {
        const {
            transactionId,
            amount,
            virtualBankAccountNumber,
            virtualBankCode,
            expiredAt,
            userId,
            orderId,
            shoppingListId,
            metadata,
            response,
            transaction,
        } = params;

        try {
            // Check if a record with this transaction ID already exists
            const existingPayment = await AlatPayment.findOne({
                where: { transactionId },
                transaction,
            });

            if (existingPayment) {
                throw new BadRequestError('Payment record with this transaction ID already exists');
            }

            // Create the payment record
            const paymentRecord = await AlatPayment.create(
                {
                    transactionId,
                    amount,
                    virtualBankAccountNumber,
                    virtualBankCode,
                    expiredAt: new Date(expiredAt),
                    userId,
                    orderId,
                    shoppingListId,
                    metadata,
                    response,
                    status: AlatPayStatus.PENDING,
                },
                { transaction },
            );

            return paymentRecord;
        } catch (error) {
            logger.error('Error creating payment record:', error);
            throw error;
        }
    }

    /**
     * Update payment status
     */
    public static async updatePaymentStatus(
        params: UpdatePaymentStatusParams,
    ): Promise<AlatPayment> {
        const { transactionId, status, paidAt, response, transaction } = params;

        try {
            // Find the payment record
            const paymentRecord = await AlatPayment.findOne({
                where: { transactionId },
                transaction,
            });

            if (!paymentRecord) {
                throw new NotFoundError('Payment record not found');
            }

            // Update the record
            const updateData: Partial<IAlatPayment> = { status };

            if (paidAt) {
                updateData.paidAt = paidAt;
            }

            if (response) {
                updateData.response = response;
            }

            await paymentRecord.update(updateData, { transaction });

            return paymentRecord;
        } catch (error) {
            logger.error('Error updating payment status:', error);
            throw error;
        }
    }

    /**
     * Get payment records based on search criteria
     */
    public static async getPayments(params: GetPaymentParams): Promise<AlatPayment[]> {
        try {
            const payments = await AlatPayment.findAll({
                where: {
                    ...(params.id && { id: params.id }),
                    ...(params.transactionId && { transactionId: params.transactionId }),
                    ...(params.userId && { userId: params.userId }),
                    ...(params.orderId && { orderId: params.orderId }),
                    ...(params.shoppingListId && { shoppingListId: params.shoppingListId }),
                    ...(params.status && { status: params.status }),
                },
                include: [
                    {
                        association: 'user',
                        attributes: ['id', 'firstName', 'lastName', 'email'],
                    },
                    {
                        association: 'order',
                        required: false,
                    },
                    {
                        association: 'shoppingList',
                        required: false,
                    },
                ],
            });

            return payments;
        } catch (error) {
            logger.error('Error fetching payment records:', error);
            throw error;
        }
    }

    /**
     * Get a single payment record
     */
    public static async getPayment(params: GetPaymentParams): Promise<AlatPayment | null> {
        try {
            const payment = await AlatPayment.findOne({
                where: {
                    ...(params.id && { id: params.id }),
                    ...(params.transactionId && { transactionId: params.transactionId }),
                    ...(params.userId && { userId: params.userId }),
                    ...(params.orderId && { orderId: params.orderId }),
                    ...(params.shoppingListId && { shoppingListId: params.shoppingListId }),
                    ...(params.status && { status: params.status }),
                },
                include: [
                    {
                        association: 'user',
                        attributes: ['id', 'firstName', 'lastName', 'email'],
                    },
                    {
                        association: 'order',
                        required: false,
                    },
                    {
                        association: 'shoppingList',
                        required: false,
                    },
                ],
            });

            return payment;
        } catch (error) {
            logger.error('Error fetching payment record:', error);
            throw error;
        }
    }
}
