// Import necessary modules and dependencies
import {
    Table,
    Column,
    Model,
    DataType,
    ForeignKey,
    DefaultScope,
    Scopes,
    BelongsTo,
    IsUUID,
    Unique,
    PrimaryKey,
    Default,
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
    attributes: { exclude: ['meta', 'agentMetaData'] },
}))
@Scopes(() => ({
    withAgentMeta: {
        attributes: { exclude: [] }, // Include all attributes
    },
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
        defaultValue: null,
        allowNull: true,
    })
    agentMetaData: IAgentMeta | null;

    @IsUUID(4)
    @Unique
    @ForeignKey(() => User)
    @Column({
        onDelete: 'CASCADE',
    })
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
    meta?: IBlockMeta | null;
}

export interface ILivenessVerification {
    faceImage: string;
    results: {
        faceDetected: boolean;
        blinkCompleted: boolean;
        smileCompleted: boolean;
        spoofingPassed: boolean;
        timestamp: string;
        challenges: string[];
    };
    timestamp: string;
    verified: boolean;
}

export interface IAgentMeta {
    nin: string;
    images: string[];
    currentStatus: 'available' | 'busy' | 'away' | 'offline';
    lastStatusUpdate: string; // ISO date string
    isAcceptingOrders: boolean;
    livenessVerification?: ILivenessVerification;
    identityDocument?: {
        type: 'nin' | 'national_id' | 'passport' | 'drivers_license';
        url: string;
        uploadedAt: string;
    };
    kycComplete?: boolean;
    kycStatus?: 'submitted' | 'approved' | 'rejected';
    kycCompletedAt?: string;
}
