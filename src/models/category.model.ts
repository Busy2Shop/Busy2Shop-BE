import {
    Table, Column, Model, DataType, BelongsToMany,
    IsUUID, PrimaryKey, Default, Unique,
} from 'sequelize-typescript';
import Market from './market.model';
import MarketCategory from './marketCategory.model';

@Table
export default class Category extends Model<Category | ICategory> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
        id: string;

    @Unique
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
        type: DataType.ARRAY(DataType.STRING),
        allowNull: true,
    })
        images: string[];

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: false,
    })
        isPinned: boolean;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
        icon: string;

    // Relationships
    @BelongsToMany(() => Market, () => MarketCategory)
        markets: Market[];
}

export interface ICategory {
    id?: string;
    name: string;
    description?: string;
    images?: string[];
    isPinned?: boolean;
    icon?: string;
}