import {
    Table,
    Column,
    Model,
    DataType,
    Default,
    IsUUID,
    PrimaryKey,
    BelongsTo,
    ForeignKey,
} from 'sequelize-typescript';
import User from './user.model';
import ShoppingList from './shoppingList.model';

@Table
export default class ChatMessage extends Model<ChatMessage> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
        id: string;

    @IsUUID(4)
    @ForeignKey(() => ShoppingList)
    @Column({
        type: DataType.UUID,
        allowNull: false,
    })
        orderId: string;

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column({
        type: DataType.UUID,
        allowNull: false,
    })
        senderId: string;

    @Column({
        type: DataType.ENUM('vendor', 'user'),
        allowNull: false,
    })
        senderType: 'vendor' | 'user';

    @Column({
        type: DataType.TEXT,
        allowNull: false,
    })
        message: string;

    @Default(false)
    @Column({
        type: DataType.BOOLEAN,
        allowNull: false,
    })
        isRead: boolean;

    // Associations
    @BelongsTo(() => User, 'senderId')
        sender: User;

    @BelongsTo(() => ShoppingList, 'orderId')
        order: ShoppingList;
}
