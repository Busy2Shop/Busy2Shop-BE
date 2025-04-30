/* eslint-disable no-unused-vars */
import { Table, Column, Model, DataType, ForeignKey, BelongsTo, IsUUID, PrimaryKey, Default } from 'sequelize-typescript';
import User from './user.model';

export enum ReferralStatus {
    Pending = 'pending',
    Completed = 'completed',
    Cancelled = 'cancelled'
}

@Table({
    indexes: [
        {
            unique: true,
            fields: ['refereeId', 'referredId'],
        },
    ],
})

@Table
export default class Referral extends Model<Referral | IReferral> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
        id: string;

    @ForeignKey(() => User)
    @Column
        refereeId: string;

    @BelongsTo(() => User, {
        foreignKey: 'refereeId',
        as: 'referee',
    })
        referee: User;

    @ForeignKey(() => User)
    @Column
        referredId: string;

    @BelongsTo(() => User, {
        foreignKey: 'referredId',
        as: 'referred',
    })
        referred: User;

    @Column({
        type: DataType.ENUM,
        values: Object.values(ReferralStatus),
        defaultValue: ReferralStatus.Pending,
    })
        status: ReferralStatus;
}


export interface IReferral {
    id?: string;
    refereeId: string;
    referredId: string;
    status?: ReferralStatus;
}