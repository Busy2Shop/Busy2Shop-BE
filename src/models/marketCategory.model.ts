import {
    Table, Column, Model, DataType, ForeignKey,
    IsUUID, PrimaryKey, Default, BelongsTo,
} from 'sequelize-typescript';
import Market from './market.model';
import Category from './category.model';

@Table
export default class MarketCategory extends Model<MarketCategory | IMarketCategory> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
        id: string;

    @IsUUID(4)
    @ForeignKey(() => Market)
    @Column
        marketId: string;

    @IsUUID(4)
    @ForeignKey(() => Category)
    @Column
        categoryId: string;

    @BelongsTo(() => Market)
        market: Market;

    @BelongsTo(() => Category)
        category: Category;
}

export interface IMarketCategory {
    id?: string;
    marketId: string;
    categoryId: string;
}