import {
    Table, Column, Model, DataType, ForeignKey, BelongsTo, IsUUID, PrimaryKey, Default,
} from 'sequelize-typescript';
import User from './user.model';
import ShoppingList from './shoppingList.model';

@Table
export default class Order extends Model<Order | IOrder> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
        id: string;

    @Column({
        type: DataType.ENUM('pending', 'accepted', 'in_progress', 'completed', 'cancelled'),
        defaultValue: 'pending',
    })
        status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false,
    })
        totalAmount: number;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false,
    })
        serviceFee: number;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false,
    })
        deliveryFee: number;

    @Column({
        type: DataType.JSONB,
        allowNull: false,
    })
        deliveryAddress: {
        latitude: number;
        longitude: number;
        address: string;
        city: string;
        state: string;
        country: string;
        additionalDirections?: string;
    };

    @Column({
        type: DataType.TEXT,
        allowNull: true,
    })
        customerNotes: string;

    @Column({
        type: DataType.TEXT,
        allowNull: true,
    })
        vendorNotes: string;

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
        acceptedAt: Date;

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
        completedAt: Date;

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column
        customerId: string;

    @BelongsTo(() => User, 'customerId')
        customer: User;

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column({
        allowNull: true, // Null until a vendor accepts the order
    })
        vendorId: string;

    @BelongsTo(() => User, 'vendorId')
        vendor: User;

    @IsUUID(4)
    @ForeignKey(() => ShoppingList)
    @Column
        shoppingListId: string;

    @BelongsTo(() => ShoppingList)
        shoppingList: ShoppingList;
}

export interface IOrder {
    id?: string;
    status?: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
    totalAmount: number;
    serviceFee: number;
    deliveryFee: number;
    deliveryAddress: {
        latitude: number;
        longitude: number;
        address: string;
        city: string;
        state: string;
        country: string;
        additionalDirections?: string;
    };
    customerNotes?: string;
    vendorNotes?: string;
    acceptedAt?: Date;
    completedAt?: Date;
    customerId: string;
    vendorId?: string;
    shoppingListId: string;
}