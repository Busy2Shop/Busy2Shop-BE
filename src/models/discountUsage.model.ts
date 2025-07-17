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
import DiscountCampaign from './discountCampaign.model';
import User from './user.model';

@Table
export default class DiscountUsage extends Model<DiscountUsage | IDiscountUsage> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
    id: string;

    @IsUUID(4)
    @ForeignKey(() => DiscountCampaign)
    @Column
    campaignId: string;

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column
    userId: string;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    orderId: string; // The order where this discount was used

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    shoppingListId: string; // The shopping list where this discount was applied

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false,
    })
    discountAmount: number; // Actual discount amount applied

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false,
    })
    orderTotal: number; // Total order amount when discount was applied

    @Column({
        type: DataType.JSONB,
        allowNull: true,
        defaultValue: {},
    })
    metadata: any; // Additional data about the usage

    // Associations
    @BelongsTo(() => DiscountCampaign)
    campaign: DiscountCampaign;

    @BelongsTo(() => User)
    user: User;
}

export interface IDiscountUsage {
    id?: string;
    campaignId: string;
    userId: string;
    orderId?: string;
    shoppingListId?: string;
    discountAmount: number;
    orderTotal: number;
    metadata?: any;
}