import {
    Table, Column, Model, DataType, ForeignKey, BelongsTo, HasMany,
    IsUUID, PrimaryKey, Default,
} from 'sequelize-typescript';
import User from './user.model';
import Market from './market.model';
import ShoppingListItem from './shoppingListItem.model';

@Table
export default class ShoppingList extends Model<ShoppingList | IShoppingList> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
        id: string;

    @Column({
        type: DataType.STRING,
        allowNull: false,
    })
        name: string;

    @Column({
        type: DataType.TEXT,
        allowNull: true,
    })
        notes: string;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: true, // Null for local markets where we don't display estimates
    })
        estimatedTotal: number;

    @Column({
        type: DataType.ENUM('draft', 'pending', 'accepted', 'processing', 'completed', 'cancelled'),
        defaultValue: 'draft',
    })
        status: 'draft' | 'pending' | 'accepted' | 'processing' | 'completed' | 'cancelled';

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column
        customerId: string;

    @BelongsTo(() => User, 'customerId')
        customer: User;

    @IsUUID(4)
    @ForeignKey(() => Market)
    @Column({
        allowNull: true, // Can be null if user hasn't selected a market yet
    })
        marketId: string;

    @BelongsTo(() => Market)
        market: Market;

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column({
        allowNull: true, // Null until a vendor accepts the order
    })
        vendorId: string;

    @BelongsTo(() => User, 'vendorId')
        vendor: User;

    // Relationships
    @HasMany(() => ShoppingListItem)
        items: ShoppingListItem[];
}

export interface IShoppingList {
    id?: string;
    name: string;
    notes?: string;
    estimatedTotal?: number;
    status?: 'draft' | 'pending' | 'accepted' | 'processing' | 'completed' | 'cancelled';
    customerId: string;
    marketId?: string;
    vendorId?: string;
}

