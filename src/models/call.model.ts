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
    CreatedAt,
    UpdatedAt,
} from 'sequelize-typescript';
import User from './user.model';
import Order from './order.model';

export type CallStatus = 'initiating' | 'ringing' | 'active' | 'ended' | 'missed' | 'rejected' | 'failed';
export type CallerType = 'agent' | 'customer';
export type EndReason = 'user-hangup' | 'timeout' | 'connection-error' | 'user-declined';

@Table({
    tableName: 'calls',
    timestamps: true,
})
export default class Call extends Model<Call> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
    id: string;

    @IsUUID(4)
    @ForeignKey(() => Order)
    @Column({
        allowNull: false,
    })
    orderId: string;

    @BelongsTo(() => Order, 'orderId')
    order: Order;

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column({
        allowNull: false,
    })
    callerId: string;

    @BelongsTo(() => User, { foreignKey: 'callerId', as: 'caller' })
    caller: User;

    @Column({
        type: DataType.ENUM('agent', 'customer'),
        allowNull: false,
    })
    callerType: CallerType;

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column({
        allowNull: false,
    })
    recipientId: string;

    @BelongsTo(() => User, { foreignKey: 'recipientId', as: 'recipient' })
    recipient: User;

    @Column({
        type: DataType.ENUM('agent', 'customer'),
        allowNull: false,
    })
    recipientType: CallerType;

    @Column({
        type: DataType.ENUM('initiating', 'ringing', 'active', 'ended', 'missed', 'rejected', 'failed'),
        allowNull: false,
        defaultValue: 'initiating',
    })
    status: CallStatus;

    @Column({
        type: DataType.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: 'Call duration in seconds',
    })
    duration: number | null;

    @Column({
        type: DataType.ENUM('user-hangup', 'timeout', 'connection-error', 'user-declined'),
        allowNull: true,
        defaultValue: null,
    })
    endReason: EndReason | null;

    @Column({
        type: DataType.DATE,
        allowNull: true,
        defaultValue: null,
        comment: 'Timestamp when call was answered',
    })
    answeredAt: Date | null;

    @Column({
        type: DataType.DATE,
        allowNull: true,
        defaultValue: null,
        comment: 'Timestamp when call ended',
    })
    endedAt: Date | null;

    @CreatedAt
    @Column
    createdAt: Date;

    @UpdatedAt
    @Column
    updatedAt: Date;
}

export interface ICall {
    id?: string;
    orderId: string;
    callerId: string;
    callerType: CallerType;
    recipientId: string;
    recipientType: CallerType;
    status?: CallStatus;
    duration?: number | null;
    endReason?: EndReason | null;
    answeredAt?: Date | null;
    endedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
}
