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
import ShoppingList from './shoppingList.model';

@Table
export default class Order extends Model<Order | IOrder> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
    id: string;

    @Column({
        type: DataType.STRING,
        allowNull: false,
        unique: true,
    })
    orderNumber: string;

    @Column({
        type: DataType.STRING,
        allowNull: false,
        defaultValue: 'pending',
        validate: {
            isIn: [
                [
                    'pending',
                    'accepted',
                    'in_progress',
                    'shopping',
                    'shopping_completed',
                    'delivery',
                    'completed',
                    'cancelled',
                ],
            ],
        },
    })
    status:
        | 'pending'
        | 'accepted'
        | 'in_progress'
        | 'shopping'
        | 'shopping_completed'
        | 'delivery'
        | 'completed'
        | 'cancelled';

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
    agentNotes: string;

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
    acceptedAt: Date;

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
    shoppingStartedAt: Date;

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
    shoppingCompletedAt: Date;

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
    deliveryStartedAt: Date;

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
    completedAt: Date;

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
    cancelledAt: Date;

    @Column({
        type: DataType.JSONB,
        allowNull: true,
        defaultValue: [],
    })
    rejectedAgents: {
        agentId: string;
        reason: string;
        rejectedAt: Date;
    }[];

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column
    customerId: string;

    @BelongsTo(() => User, 'customerId')
    customer: User;

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column({
        allowNull: true, // Null until an agent accepts the order
    })
    agentId: string;

    @BelongsTo(() => User, 'agentId')
    agent: User;

    @IsUUID(4)
    @ForeignKey(() => ShoppingList)
    @Column
    shoppingListId: string;

    @BelongsTo(() => ShoppingList)
    shoppingList: ShoppingList;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    paymentId: string;

    @Column({
        type: DataType.ENUM('pending', 'completed', 'failed', 'expired'),
        allowNull: true,
    })
    paymentStatus: 'pending' | 'completed' | 'failed' | 'expired';

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
    paymentProcessedAt: Date;

}

export interface IOrder {
    id?: string;
    orderNumber?: string; // Optional for creation, will be generated if not provided
    status?:
        | 'pending'
        | 'accepted'
        | 'in_progress'
        | 'shopping'
        | 'shopping_completed'
        | 'delivery'
        | 'completed'
        | 'cancelled';
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
    agentNotes?: string;
    acceptedAt?: Date;
    shoppingStartedAt?: Date;
    shoppingCompletedAt?: Date;
    deliveryStartedAt?: Date;
    completedAt?: Date;
    cancelledAt?: Date;
    rejectedAgents?: {
        agentId: string;
        reason: string;
        rejectedAt: Date;
    }[];
    customerId: string;
    agentId?: string;
    shoppingListId: string;
    paymentId?: string;
    paymentStatus?: 'pending' | 'completed' | 'failed' | 'expired';
    paymentProcessedAt?: Date;
}
