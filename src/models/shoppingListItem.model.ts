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
import Product from './product.model';
import ShoppingList from './shoppingList.model';

@Table
export default class ShoppingListItem extends Model<ShoppingListItem | IShoppingListItem> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column(DataType.UUID)
    id: string;

    @Column({
        type: DataType.STRING,
        allowNull: false,
    })
    name: string;

    @Column({
        type: DataType.INTEGER,
        defaultValue: 1,
    })
    quantity: number;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    unit: string | null; // e.g., kg, pcs, etc.

    @Column({
        type: DataType.TEXT,
        allowNull: true,
    })
    notes: string | null;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: true, // Null for local markets or when the price is unknown
    })
    estimatedPrice: number | null;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: true, // Actual price added by agent when purchased
    })
    actualPrice: number | null;

    @IsUUID(4)
    @ForeignKey(() => ShoppingList)
    @Column({
        type: DataType.UUID,
        allowNull: false,
    })
    shoppingListId: string;

    @BelongsTo(() => ShoppingList)
    shoppingList: ShoppingList;

    @IsUUID(4)
    @ForeignKey(() => Product)
    @Column({
        type: DataType.UUID,
        allowNull: true, // Can be null if the item isn't linked to a specific product
    })
    productId: string | null;

    @BelongsTo(() => Product)
    product: Product;
}

export interface IShoppingListItem {
    id?: string;
    name: string;
    quantity?: number;
    unit?: string | null;
    notes?: string | null;
    estimatedPrice?: number | null;
    actualPrice?: number | null;
    shoppingListId: string;
    productId?: string | null;
}
