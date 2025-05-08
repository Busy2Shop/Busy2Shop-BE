/* eslint-disable no-unused-vars */
import {
    Table, Column, Model, DataType, ForeignKey, BelongsTo, IsUUID, PrimaryKey, Default,
    CreatedAt, UpdatedAt, Index
} from 'sequelize-typescript';
import User from '../user.model';
import Order from '../order.model';
import ShoppingList from '../shoppingList.model';

export enum AlatPayStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    FAILED = 'failed',
    EXPIRED = 'expired'
}

@Table({
    tableName: 'alat_payments',
    indexes: [
        { fields: ['transaction_id'], unique: true },
        { fields: ['user_id'] },
        { fields: ['order_id'] },
        { fields: ['status'] },
    ]
})
export default class AlatPayment extends Model<AlatPayment | IAlatPayment> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
    id: string;

    @Column({
        type: DataType.STRING,
        allowNull: false,
        unique: true,
        field: 'transaction_id'
    })
    transactionId: string;

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
        type: DataType.STRING,
        allowNull: false,
        field: 'virtual_bank_account_number'
    })
    virtualBankAccountNumber: string;

    @Column({
        type: DataType.STRING,
        allowNull: false,
        field: 'virtual_bank_code'
    })
    virtualBankCode: string;

    @Column({
        type: DataType.ENUM(...Object.values(AlatPayStatus)),
        allowNull: false,
        defaultValue: AlatPayStatus.PENDING,
    })
    status: AlatPayStatus;

    @Column({
        type: DataType.DATE,
        allowNull: false,
        field: 'expired_at'
    })
    expiredAt: Date;

    @Column({
        type: DataType.DATE,
        allowNull: true,
        field: 'paid_at'
    })
    paidAt: Date;

    @Column({
        type: DataType.JSONB,
        allowNull: true,
    })
    metadata: object;

    @Column({
        type: DataType.JSONB,
        allowNull: true,
    })
    response: object;

    // Foreign keys
    @IsUUID(4)
    @ForeignKey(() => User)
    @Column({
        allowNull: false,
        field: 'user_id'
    })
    userId: string;

    @IsUUID(4)
    @ForeignKey(() => Order)
    @Column({
        allowNull: true,
        field: 'order_id'
    })
    orderId: string;

    @IsUUID(4)
    @ForeignKey(() => ShoppingList)
    @Column({
        allowNull: true,
        field: 'shopping_list_id'
    })
    shoppingListId: string;

    // Timestamps
    @CreatedAt
    @Column({
        field: 'created_at'
    })
    createdAt: Date;

    @UpdatedAt
    @Column({
        field: 'updated_at'
    })
    updatedAt: Date;

    // Associations
    @BelongsTo(() => User)
    user: User;

    @BelongsTo(() => Order)
    order: Order;

    @BelongsTo(() => ShoppingList)
    shoppingList: ShoppingList;

    // Calculated fields
    get isExpired(): boolean {
        return new Date() > new Date(this.expiredAt);
    }

    get isPaid(): boolean {
        return this.status === AlatPayStatus.COMPLETED;
    }

    get hasFailed(): boolean {
        return this.status === AlatPayStatus.FAILED;
    }
}

export interface IAlatPayment {
    id?: string;
    transactionId: string;
    amount: number;
    currency?: string;
    virtualBankAccountNumber: string;
    virtualBankCode: string;
    status?: AlatPayStatus;
    expiredAt: Date;
    paidAt?: Date;
    metadata?: object;
    response?: object;
    userId: string;
    orderId?: string;
    shoppingListId?: string;
    createdAt?: Date;
    updatedAt?: Date;
}