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
    Index,
} from 'sequelize-typescript';
import Order from './order.model';
import User from './user.model';

export interface IOrderTrail {
    id: string;
    orderId: string;
    userId?: string;
    action: string;
    description: string;
    previousValue?: any;
    newValue?: any;
    metadata?: any;
    ipAddress?: string;
    userAgent?: string;
    timestamp: Date;
}

@Table({
    tableName: 'OrderTrails',
    timestamps: true,
})
export default class OrderTrail extends Model<OrderTrail | IOrderTrail> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
    id: string;

    @ForeignKey(() => Order)
    @Index
    @Column({
        type: DataType.STRING,
        allowNull: false,
    })
    orderId: string;

    @ForeignKey(() => User)
    @Index
    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    userId?: string;

    @Index
    @Column({
        type: DataType.STRING,
        allowNull: false,
    })
    action: string;

    @Column({
        type: DataType.TEXT,
        allowNull: false,
    })
    description: string;

    @Column({
        type: DataType.JSONB,
        allowNull: true,
    })
    previousValue?: any;

    @Column({
        type: DataType.JSONB,
        allowNull: true,
    })
    newValue?: any;

    @Column({
        type: DataType.JSONB,
        allowNull: true,
    })
    metadata?: any;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    ipAddress?: string;

    @Column({
        type: DataType.TEXT,
        allowNull: true,
    })
    userAgent?: string;

    @Index
    @Column({
        type: DataType.DATE,
        allowNull: false,
        defaultValue: DataType.NOW,
    })
    timestamp: Date;

    // Associations
    @BelongsTo(() => Order)
    order: Order;

    @BelongsTo(() => User)
    user: User;
}