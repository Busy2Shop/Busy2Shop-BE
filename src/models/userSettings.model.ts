// Import necessary modules and dependencies
import {
    Table, Column, Model, DataType, ForeignKey, DefaultScope,
    BelongsTo, IsUUID, Unique, PrimaryKey, Default,
} from 'sequelize-typescript';
import User from './user.model'; // Adjust the import path as necessary

interface IBlockUnblockEntry {
    [date: string]: string; // Key is the date in YYYY-MM-DD format, value is the reason
}

export interface IBlockMeta {
    blockHistory: IBlockUnblockEntry[];
    unblockHistory: IBlockUnblockEntry[];
}
// default scope to exclude the meta
@DefaultScope(() => ({
    attributes: { exclude: ['meta'] },
}))

@Table({ timestamps: false })
export default class UserSettings extends Model<UserSettings | IUserSettings> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
        id: string;

    @Column({ type: DataType.DATEONLY })
        joinDate: string;

    @Column({ type: DataType.DATE })
        lastLogin: Date | null;

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: false,
        allowNull: false,
    })
        isKycVerified: boolean;

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: false,
        allowNull: false,
    })
        isBlocked: boolean;

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: false,
        allowNull: false,
    })
        isDeactivated: boolean;

    @Column({
        type: DataType.JSONB,
        defaultValue: null,
        allowNull: true,
    })
        meta: IBlockMeta | null;

    @Column({
        type: DataType.JSONB,
        allowNull: true,
        validate: {
            isValidAgentMeta(this: User, value: IAgentMeta | null) {
                if (this.status?.userType === 'agent') {
                    if (!value?.nin) {
                        throw new Error('NIN is required for agents');
                    }
                    if (!/^\d{11}$/.test(value.nin)) {
                        throw new Error('Invalid NIN format. Must be 11 digits');
                    }
                }
            },
        },
    })
        agentMetaData : IAgentMeta | null;

    /*@Column({
        type: DataType.BOOLEAN,
        defaultValue: false,
    })
    locationTrackingEnabled: boolean;*/

    @IsUUID(4)
    @Unique
    @ForeignKey(() => User)
    @Column
        userId: string;

    @BelongsTo(() => User)
        user: User;
}

export interface IUserSettings {
    userId: string;
    lastLogin?: Date;
    joinDate: string;
    isBlocked?: boolean;
    isDeactivated?: boolean;
    isKycVerified?: boolean;
    agentMetaData?: IAgentMeta | null;
    //locationTrackingEnabled?: boolean;
    meta?: IBlockMeta | null;
}

export interface IAgentMeta {
    nin: string;
    images: string[];
}