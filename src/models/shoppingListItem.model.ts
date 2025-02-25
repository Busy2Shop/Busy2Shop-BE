import {
    Table, Column, Model, DataType, ForeignKey, BelongsTo, IsUUID, PrimaryKey, Default,
} from 'sequelize-typescript';
import Product from './product.model';
import ShoppingList from './shoppingList.model';




@Table
export default class ShoppingListItem extends Model<ShoppingListItem | IShoppingListItem> {
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
        type: DataType.INTEGER,
        defaultValue: 1,
    })
        quantity: number;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
        unit: string; // e.g., kg, pcs, etc.

    @Column({
        type: DataType.TEXT,
        allowNull: true,
    })
        notes: string;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: true, // Null for local markets or when price is unknown
    })
        estimatedPrice: number;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: true, // Actual price added by vendor when purchased
    })
        actualPrice: number;

    @IsUUID(4)
    @ForeignKey(() => ShoppingList)
    @Column
        shoppingListId: string;

    @BelongsTo(() => ShoppingList)
        shoppingList: ShoppingList;

    @IsUUID(4)
    @ForeignKey(() => Product)
    @Column({
        allowNull: true, // Can be null if item isn't linked to a specific product
    })
        productId: string;

    @BelongsTo(() => Product)
        product: Product;
}

export interface IShoppingListItem {
    id?: string;
    name: string;
    quantity?: number;
    unit?: string;
    notes?: string;
    estimatedPrice?: number;
    actualPrice?: number;
    shoppingListId: string;
    productId?: string;
}