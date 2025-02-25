import {
    BelongsTo, Column, DataType, Default, ForeignKey,
    IsUUID, Model, PrimaryKey, Table,
} from 'sequelize-typescript';
import User from './user.model';

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
  
    @IsUUID(4)
    @ForeignKey(() => User)
    @Column
        reviewerId: string;

    @BelongsTo(() => User, 'reviewerId')
        reviewer: User;
}

export interface IReview {
    id: string;
    comment: string;
    rating: number;
    reviewerId: string;
}