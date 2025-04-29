import {
    Table, Column, Model, DataType, ForeignKey, BelongsTo,
    IsUUID, PrimaryKey, Default,
    HasMany,
} from 'sequelize-typescript';
import Market from './market.model';
import Review from './review.model';

@Table
export default class Product extends Model<Product | IProduct> {
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
        description: string;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false,
    })
        price: number;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: true,
    })
        discountPrice: number;

    @Column({
        type: DataType.ARRAY(DataType.STRING),
        allowNull: true,
    })
        images: string[];

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
        barcode: string;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
        sku: string; // Stock Keeping Unit

    @Column({
        type: DataType.INTEGER,
        defaultValue: 0,
    })
        stockQuantity: number;

    @Column({
        type: DataType.JSONB,
        allowNull: true,
    })
        attributes: object;

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: true,
    })
        isAvailable: boolean;

    @IsUUID(4)
    @ForeignKey(() => Market)
    @Column
        marketId: string;

    @BelongsTo(() => Market)
        market: Market;

    @HasMany(() => Review, 'productId')  // Change 'reviewerId' to 'productId'
        reviews: Review[];
}

export interface IProduct {
    id?: string;
    name: string;
    description?: string;
    price: number;
    discountPrice?: number;
    images?: string[];
    barcode?: string;
    sku?: string;
    stockQuantity?: number;
    attributes?: object;
    isAvailable?: boolean;
    marketId: string;
    market?: Market;
    reviews?: Review[];
}