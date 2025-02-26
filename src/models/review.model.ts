import {
    BeforeSave,
    BelongsTo, Column, DataType, Default, ForeignKey,
    IsUUID, Model, PrimaryKey, Table,
} from 'sequelize-typescript';
import User from './user.model';
import Market from './market.model';
import Product from './product.model';
import { BadRequestError } from '../utils/customErrors';

@Table
export default class Review extends Model<Review | IReview> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
        id: string;

    @Column({ type: DataType.TEXT })
        comment: string;

    @Column({
        type: DataType.INTEGER,
        validate: {
            min: 1,
            max: 5,
        },
    })
        rating: number;

    @Column({
        type: DataType.ARRAY(DataType.STRING),
        allowNull: true,
    })
        images: string[];

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column
        reviewerId: string;

    @BelongsTo(() => User, 'reviewerId')
        reviewer: User;

    @IsUUID(4)
    @ForeignKey(() => Market)
    @Column({
        allowNull: true, // Can be null if this is a product review
    })
        marketId: string;

    @BelongsTo(() => Market)
        market: Market;

    @IsUUID(4)
    @ForeignKey(() => Product)
    @Column({
        allowNull: true, // Can be null if this is a market review
    })
        productId: string;

    @BelongsTo(() => Product)
        product: Product;
    
    // Before save check if the market or product id is present and set the other to null
    @BeforeSave
    static async checkMasterclassOrMentorshipId(instance: Review) {
        if (instance.marketId && instance.productId) {
            throw new BadRequestError('Review Record cannot be associated to both a market and a product.');
        }
        if (!instance.marketId && !instance.productId) {
            throw new BadRequestError('A Review Record must be associated to either a market or a product.');
        }
    }
    
}

export interface IReview {
    id?: string;
    comment: string;
    rating: number;
    images?: string[];
    reviewerId: string;
    marketId?: string;
    productId?: string;
}