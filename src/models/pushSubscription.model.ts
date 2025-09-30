import {
    Table,
    Column,
    Model,
    DataType,
    BelongsTo,
    ForeignKey,
    Default,
    IsUUID,
    PrimaryKey,
    Index,
    BeforeCreate,
    BeforeUpdate,
    Scopes,
} from 'sequelize-typescript';
import { Op } from 'sequelize';
import User from './user.model';

export type DeviceTypeValues = 'web' | 'mobile';

export interface IPushSubscriptionAttributes {
    id: string;
    userId: string;
    playerId: string;
    deviceType: DeviceTypeValues;
    isActive: boolean;
    lastUsed: Date;
    userAgent?: string;
    ipAddress?: string;
    createdAt: Date;
    updatedAt: Date;
}

@Scopes(() => ({
    active: {
        where: { isActive: true },
    },
    web: {
        where: { deviceType: 'web' },
    },
    mobile: {
        where: { deviceType: 'mobile' },
    },
    recent: {
        where: {
            lastUsed: {
                [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            },
        },
    },
    withUser: {
        include: [
            {
                model: User,
                as: 'user',
                attributes: ['id', 'firstName', 'lastName', 'email'],
            },
        ],
    },
}))
@Table({
    tableName: 'PushSubscriptions',
    indexes: [
        {
            fields: ['userId'],
        },
        {
            fields: ['playerId'],
        },
        {
            fields: ['isActive'],
        },
        {
            fields: ['lastUsed'],
        },
        {
            unique: true,
            fields: ['userId', 'playerId'],
            name: 'push_subscriptions_user_player_unique',
        },
    ],
})
class PushSubscription extends Model<IPushSubscriptionAttributes> implements IPushSubscriptionAttributes {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column(DataType.UUID)
    id!: string;

    @ForeignKey(() => User)
    @Index
    @Column(DataType.STRING)
    userId!: string;

    @Index
    @Column({
        type: DataType.STRING,
        allowNull: false,
        comment: 'OneSignal player ID for push notifications',
    })
    playerId!: string;

    @Default('web')
    @Column(DataType.ENUM('web', 'mobile'))
    deviceType!: DeviceTypeValues;

    @Default(true)
    @Index
    @Column(DataType.BOOLEAN)
    isActive!: boolean;

    @Default(DataType.NOW)
    @Index
    @Column(DataType.DATE)
    lastUsed!: Date;

    @Column({
        type: DataType.TEXT,
        allowNull: true,
        comment: 'Browser user agent for web subscriptions',
    })
    userAgent?: string;

    @Column({
        type: DataType.STRING,
        allowNull: true,
        comment: 'IP address when subscription was created',
    })
    ipAddress?: string;

    @Column(DataType.DATE)
    createdAt!: Date;

    @Column(DataType.DATE)
    updatedAt!: Date;

    // Associations
    @BelongsTo(() => User, 'userId')
    user!: User;

    // Virtual getters
    public get isExpired(): boolean {
        // Consider subscription expired if not used for 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return this.lastUsed < thirtyDaysAgo;
    }

    public get deviceInfo(): string {
        if (this.deviceType === 'web' && this.userAgent) {
            // Extract browser name from user agent
            const userAgent = this.userAgent.toLowerCase();
            if (userAgent.includes('chrome')) return 'Chrome (Web)';
            if (userAgent.includes('firefox')) return 'Firefox (Web)';
            if (userAgent.includes('safari')) return 'Safari (Web)';
            if (userAgent.includes('edge')) return 'Edge (Web)';
            return 'Web Browser';
        }
        return this.deviceType === 'mobile' ? 'Mobile App' : 'Web';
    }

    // Lifecycle hooks
    @BeforeCreate
    @BeforeUpdate
    static validateSubscription(instance: PushSubscription) {
        // Ensure playerId is not empty
        if (!instance.playerId || instance.playerId.trim() === '') {
            throw new Error('Player ID cannot be empty');
        }

        // Update lastUsed when reactivating
        if (instance.isActive && instance.changed('isActive')) {
            instance.lastUsed = new Date();
        }
    }

    // Instance methods
    public async markAsUsed(): Promise<void> {
        this.lastUsed = new Date();
        await this.save();
    }

    public async deactivate(): Promise<void> {
        this.isActive = false;
        await this.save();
    }

    public async reactivate(): Promise<void> {
        this.isActive = true;
        this.lastUsed = new Date();
        await this.save();
    }

    // Static methods
    public static async findActiveByUserId(userId: string): Promise<PushSubscription[]> {
        return await PushSubscription.scope('active').findAll({
            where: { userId },
            order: [['lastUsed', 'DESC']],
        });
    }

    public static async findByPlayerIds(playerIds: string[]): Promise<PushSubscription[]> {
        return await PushSubscription.scope('active').findAll({
            where: {
                playerId: playerIds,
            },
        });
    }

    public static async deactivateOldSubscriptions(): Promise<number> {
        // Deactivate subscriptions that haven't been used in 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [affectedCount] = await PushSubscription.update(
            { isActive: false },
            {
                where: {
                    lastUsed: {
                        [Op.lt]: thirtyDaysAgo,
                    },
                    isActive: true,
                },
            }
        );

        return affectedCount;
    }

    public static async getSubscriptionStats(): Promise<{
        total: number;
        active: number;
        web: number;
        mobile: number;
        recent: number; // Active in last 7 days
    }> {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const [
            total,
            active,
            web,
            mobile,
            recent,
        ] = await Promise.all([
            PushSubscription.count(),
            PushSubscription.scope('active').count(),
            PushSubscription.scope(['active', 'web']).count(),
            PushSubscription.scope(['active', 'mobile']).count(),
            PushSubscription.scope(['active', 'recent']).count(),
        ]);

        return { total, active, web, mobile, recent };
    }
}

export default PushSubscription;