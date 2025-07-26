import {
    Table,
    Column,
    Model,
    DataType,
    ForeignKey,
    BelongsTo,
    IsUUID,
    PrimaryKey,
    Default,
} from 'sequelize-typescript';
import User from './user.model';
import Order from './order.model';
import ShoppingList from './shoppingList.model';

export enum TransactionStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    FAILED = 'failed',
    REFUNDED = 'refunded',
    PARTIALLY_REFUNDED = 'partially_refunded',
}

export enum TransactionType {
    ORDER = 'order',
    SHOPPING_LIST = 'shopping_list',
    REFUND = 'refund',
    ADJUSTMENT = 'adjustment',
}

export enum PaymentMethod {
    ALATPAY = 'alatpay',
    CARD = 'card',
    BANK_TRANSFER = 'bank_transfer',
}

@Table
export default class Transaction extends Model<Transaction | ITransaction> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
    id: string;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false,
    })
    amount: number;

    @Column({
        type: DataType.STRING,
        allowNull: false,
        defaultValue: 'NGN',
    })
    currency: string;

    @Column({
        type: DataType.ENUM(...Object.values(TransactionStatus)),
        defaultValue: TransactionStatus.PENDING,
    })
    status: TransactionStatus;

    @Column({
        type: DataType.ENUM(...Object.values(TransactionType)),
        allowNull: false,
    })
    type: TransactionType;

    @Column({
        type: DataType.ENUM(...Object.values(PaymentMethod)),
        allowNull: false,
    })
    paymentMethod: PaymentMethod;

    @Column({
        type: DataType.STRING,
        allowNull: false,
    })
    referenceId: string;

    @Column({
        type: DataType.ENUM('order', 'shopping_list'),
        allowNull: false,
    })
    referenceType: 'order' | 'shopping_list';

    @Column({
        type: DataType.JSONB,
        allowNull: false,
        defaultValue: {},
    })
    metadata: {
        paymentProvider: string;
        providerTransactionId: string;
        providerResponse: any;
        attempts: number;
        lastAttemptAt: Date;
        processedAt?: Date;
        refundedAt?: Date;
        refundAmount?: number;
        refundReason?: string;
        deliveryAddress?: {
            address: string;
            latitude: number;
            longitude: number;
            city?: string;
            state?: string;
            country?: string;
            additionalDirections?: string;
        };
        customerNotes?: string;
        shoppingListId?: string;
        customerId?: string;
        serviceFee?: number;
        deliveryFee?: number;
        subtotal?: number;
    };

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column
    userId: string;

    @BelongsTo(() => User)
    user: User;

    @IsUUID(4)
    @ForeignKey(() => Order)
    @Column({
        allowNull: true,
    })
    orderId: string;

    @BelongsTo(() => Order)
    order: Order;

    @IsUUID(4)
    @ForeignKey(() => ShoppingList)
    @Column({
        allowNull: true,
    })
    shoppingListId: string;

    @BelongsTo(() => ShoppingList)
    shoppingList: ShoppingList;

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
    processedAt: Date;

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
    refundedAt: Date;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: true,
    })
    refundAmount: number;

    @Column({
        type: DataType.TEXT,
        allowNull: true,
    })
    refundReason: string;
}

export interface ITransaction {
    id?: string;
    amount: number;
    currency: string;
    status?: TransactionStatus;
    type: TransactionType;
    paymentMethod: PaymentMethod;
    referenceId: string;
    referenceType: 'order' | 'shopping_list';
    metadata?: {
        paymentProvider: string;
        providerTransactionId: string;
        providerResponse: any;
        attempts: number;
        lastAttemptAt: Date;
        processedAt?: Date;
        refundedAt?: Date;
        refundAmount?: number;
        refundReason?: string;
        deliveryAddress?: {
            address: string;
            latitude: number;
            longitude: number;
            city?: string;
            state?: string;
            country?: string;
            additionalDirections?: string;
        };
        customerNotes?: string;
        shoppingListId?: string;
        customerId?: string;
        serviceFee?: number;
        deliveryFee?: number;
        subtotal?: number;
    };
    userId: string;
    orderId?: string;
    shoppingListId?: string;
    processedAt?: Date;
    refundedAt?: Date;
    refundAmount?: number;
    refundReason?: string;
}
