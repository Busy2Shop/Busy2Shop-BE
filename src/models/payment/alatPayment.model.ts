/* eslint-disable no-unused-vars */
import {
    Table, Column, Model, DataType, ForeignKey, BelongsTo, IsUUID, PrimaryKey, Default,
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

@Table
export default class AlatPayment extends Model<AlatPayment | IAlatPayment> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
        id: string;

    @Column({
        type: DataType.STRING,
        allowNull: false,
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
    })
        virtualBankAccountNumber: string;

    @Column({
        type: DataType.STRING,
        allowNull: false,
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
    })
        expiredAt: Date;

    @Column({
        type: DataType.DATE,
        allowNull: true,
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
    })
        userId: string;

    @IsUUID(4)
    @ForeignKey(() => Order)
    @Column({
        allowNull: true,
    })
        orderId: string;

    @IsUUID(4)
    @ForeignKey(() => ShoppingList)
    @Column({
        allowNull: true,
    })
        shoppingListId: string;

    // Associations
    @BelongsTo(() => User)
        user: User;

    @BelongsTo(() => Order)
        order: Order;

    @BelongsTo(() => ShoppingList)
        shoppingList: ShoppingList;
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
}