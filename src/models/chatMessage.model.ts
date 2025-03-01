import {
    Table, Column, Model, DataType, ForeignKey, BelongsTo, IsUUID, PrimaryKey, Default,
} from 'sequelize-typescript';
import User, { userTypeValues } from './user.model';
import Order from './order.model';

export type SenderType = userTypeValues | 'admin';

@Table({
    tableName: 'chat_messages',
    timestamps: true,
})
export default class ChatMessage extends Model<ChatMessage> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
        id: string;

    @IsUUID(4)
    @ForeignKey(() => Order)
    @Column
        orderId: string;

    @BelongsTo(() => Order, 'orderId')
        order: Order;

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column
        senderId: string;

    @BelongsTo(() => User, 'senderId')
        sender: User;

    @Column({
        type: DataType.ENUM('vendor', 'customer', 'admin'),
        allowNull: false,
    })
        senderType: SenderType;

    @Column({
        type: DataType.TEXT,
        allowNull: false,
    })
        message: string;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
        imageUrl: string | null;

    @Column({
        type: DataType.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    })
        isRead: boolean;
}

export interface IChatMessage {
    id?: string;
    orderId: string;
    senderId: string;
    senderType: SenderType;
    message: string;
    imageUrl?: string | null;
    isRead?: boolean;
}