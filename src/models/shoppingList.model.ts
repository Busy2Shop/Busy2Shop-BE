import {
    Table,
    Column,
    Model,
    DataType,
    ForeignKey,
    BelongsTo,
    HasMany,
    IsUUID,
    PrimaryKey,
    Default,
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
        type: DataType.ENUM('draft', 'accepted', 'processing', 'completed', 'cancelled'),
        defaultValue: 'draft',
    })
    status: 'draft' | 'accepted' | 'processing' | 'completed' | 'cancelled';

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column
    customerId: string;

    @BelongsTo(() => User, 'customerId')
    customer: User;

    @IsUUID(4)
    @ForeignKey(() => Market)
    @Column({
        allowNull: true, // Can be null if the user hasn't selected a market yet
    })
    marketId: string;

    @BelongsTo(() => Market)
    market: Market;

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column({
        allowNull: true, // Null until an agent accepts the order
    })
    agentId: string;

    @BelongsTo(() => User, 'agentId')
    agent: User;

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

    // New fields for suggested lists and flexible functionality
    @Column({
        type: DataType.ENUM('user', 'admin', 'system'),
        defaultValue: 'user',
    })
    creatorType: 'user' | 'admin' | 'system';

    @Column({
        type: DataType.ENUM('personal', 'suggested', 'template'),
        defaultValue: 'personal',
    })
    listType: 'personal' | 'suggested' | 'template';

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    category: string; // 'grocery', 'health', 'entertainment', etc.

    @Column({
        type: DataType.ARRAY(DataType.STRING),
        allowNull: true,
    })
    tags: string[]; // ['essential', 'weekly', 'family']

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    estimatedTime: string; // '30-45 mins', '1-2 hours'

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    estimatedCost: string; // '₦5,000 - ₦8,000'

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: true,
    })
    minPrice: number;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: true,
    })
    maxPrice: number;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    marketType: string; // 'supermarket', 'local_market', 'pharmacy', etc.

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    image: string;

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: false,
    })
    isPopular: boolean;

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: true,
    })
    isActive: boolean;

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: false,
    })
    isReadOnly: boolean; // For system/suggested lists that shouldn't be edited

    @IsUUID(4)
    @Column({
        type: DataType.UUID,
        allowNull: true, // Reference to source suggested list if this is a copy
    })
    sourceSuggestedListId: string | null;

    @Column({
        type: DataType.INTEGER,
        defaultValue: 0,
    })
    sortOrder: number;

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column({
        allowNull: true, // Null for system-created lists
    })
    createdBy: string;

    @BelongsTo(() => User, 'createdBy')
    creator: User;

    // Relationships
    @HasMany(() => ShoppingListItem)
    items: ShoppingListItem[];

    // Virtual fields
    get itemCount(): number {
        return this.items ? this.items.length : 0;
    }
}

export interface IShoppingList {
    id?: string;
    name: string;
    notes?: string;
    estimatedTotal?: number;
    status?: 'draft' | 'accepted' | 'processing' | 'completed' | 'cancelled';
    customerId: string;
    marketId?: string;
    agentId?: string;
    paymentId?: string;
    paymentStatus?: 'pending' | 'completed' | 'failed' | 'expired';
    paymentProcessedAt?: Date;
    // New fields for suggested lists
    creatorType?: 'user' | 'admin' | 'system';
    listType?: 'personal' | 'suggested' | 'template';
    category?: string;
    tags?: string[];
    estimatedTime?: string;
    estimatedCost?: string;
    minPrice?: number;
    maxPrice?: number;
    marketType?: string;
    image?: string;
    isPopular?: boolean;
    isActive?: boolean;
    isReadOnly?: boolean;
    sourceSuggestedListId?: string | null;
    sortOrder?: number;
    createdBy?: string;
}
