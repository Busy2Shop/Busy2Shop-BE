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
    BeforeCreate,
} from 'sequelize-typescript';
import User from './user.model';
import Referral from './referral.model';
import DiscountCampaign from './discountCampaign.model';

export enum BonusType {
    DISCOUNT = 'discount', // Discount on next order
    CASHBACK = 'cashback', // Cash reward
    CREDIT = 'credit', // Account credit
    FREE_DELIVERY = 'free_delivery', // Free delivery voucher
}

export enum BonusStatus {
    PENDING = 'pending', // Waiting for referral completion
    AVAILABLE = 'available', // Ready to be used
    USED = 'used', // Already redeemed
    EXPIRED = 'expired', // Past expiration date
}

export enum TriggerEvent {
    SIGNUP = 'signup', // When referred user signs up
    FIRST_ORDER = 'first_order', // When referred user places first order
    ORDER_AMOUNT = 'order_amount', // When referred user reaches certain order amount
    TIME_BASED = 'time_based', // After certain time period
}

@Table({
    indexes: [
        {
            fields: ['referralId'],
        },
        {
            fields: ['recipientId', 'status'],
        },
        {
            fields: ['triggerEvent', 'status'],
        },
    ],
})
export default class ReferralBonus extends Model<ReferralBonus | IReferralBonus> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
    id: string;

    @IsUUID(4)
    @ForeignKey(() => Referral)
    @Column
    referralId: string;

    @BelongsTo(() => Referral)
    referral: Referral;

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column
    recipientId: string; // Who receives the bonus (referee or referred)

    @BelongsTo(() => User, 'recipientId')
    recipient: User;

    @Column({
        type: DataType.ENUM(...Object.values(BonusType)),
        allowNull: false,
    })
    type: BonusType;

    @Column({
        type: DataType.ENUM(...Object.values(BonusStatus)),
        defaultValue: BonusStatus.PENDING,
    })
    status: BonusStatus;

    @Column({
        type: DataType.ENUM(...Object.values(TriggerEvent)),
        allowNull: false,
    })
    triggerEvent: TriggerEvent;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: true,
    })
    value: number; // Amount for cashback/credit, percentage for discount

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    title: string; // Display name for the bonus

    @Column({
        type: DataType.TEXT,
        allowNull: true,
    })
    description: string;

    @IsUUID(4)
    @ForeignKey(() => DiscountCampaign)
    @Column({
        allowNull: true,
    })
    discountCampaignId: string; // Associated discount campaign for discount bonuses

    @BelongsTo(() => DiscountCampaign)
    discountCampaign: DiscountCampaign;

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
    expiresAt: Date;

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
    triggeredAt: Date; // When the trigger condition was met

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
    usedAt: Date; // When the bonus was redeemed

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    usedInOrderId: string; // Order where bonus was used

    @Column({
        type: DataType.JSONB,
        allowNull: true,
        defaultValue: {},
    })
    conditions: {
        minimumOrderAmount?: number; // For order_amount trigger
        targetAmount?: number; // Target amount to reach
        validDays?: number; // How many days the bonus is valid
        applicableMarkets?: string[]; // Markets where bonus can be used
        maxUsageCount?: number; // How many times bonus can be used
        usageCount?: number; // Current usage count
    };

    @Column({
        type: DataType.JSONB,
        allowNull: true,
        defaultValue: {},
    })
    metadata: {
        originalReferralCode?: string;
        campaignId?: string; // Associated marketing campaign
        sourceEvent?: string; // What triggered this bonus
        bonusReason?: string; // Human readable reason
    };

    @BeforeCreate
    static setDefaultExpiration(instance: ReferralBonus) {
        if (!instance.expiresAt && instance.conditions?.validDays) {
            const expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() + instance.conditions.validDays);
            instance.expiresAt = expirationDate;
        }
    }

    // Check if bonus is currently usable
    get isUsable(): boolean {
        const now = new Date();
        return this.status === BonusStatus.AVAILABLE && 
               (!this.expiresAt || this.expiresAt > now) &&
               (!this.conditions?.maxUsageCount || 
                (this.conditions.usageCount || 0) < this.conditions.maxUsageCount);
    }

    // Calculate discount amount for a given order total
    calculateDiscountAmount(orderTotal: number): number {
        if (this.type !== BonusType.DISCOUNT || !this.isUsable) {
            return 0;
        }

        if (this.conditions?.minimumOrderAmount && orderTotal < this.conditions.minimumOrderAmount) {
            return 0;
        }

        // If linked to a discount campaign, use its calculation logic
        if (this.discountCampaign) {
            const discountAmount = (orderTotal * this.discountCampaign.value) / 100;
            return this.discountCampaign.maximumDiscountAmount 
                ? Math.min(discountAmount, this.discountCampaign.maximumDiscountAmount)
                : discountAmount;
        }

        // Simple percentage calculation
        return (orderTotal * (this.value || 0)) / 100;
    }

    // Mark bonus as used
    async markAsUsed(orderId?: string): Promise<void> {
        const updatedConditions = {
            ...this.conditions,
            usageCount: (this.conditions?.usageCount || 0) + 1,
        };

        await this.update({
            status: BonusStatus.USED,
            usedAt: new Date(),
            usedInOrderId: orderId,
            conditions: updatedConditions,
        });
    }
}

// Referral bonus configuration for different events
@Table
export class ReferralBonusConfig extends Model<ReferralBonusConfig | IReferralBonusConfig> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
    id: string;

    @Column({
        type: DataType.STRING,
        allowNull: false,
        unique: true,
    })
    name: string; // e.g., "signup_bonus", "first_order_bonus"

    @Column({
        type: DataType.ENUM(...Object.values(TriggerEvent)),
        allowNull: false,
    })
    triggerEvent: TriggerEvent;

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: true,
    })
    isActive: boolean;

    @Column({
        type: DataType.JSONB,
        allowNull: false,
    })
    refereeBonus: {
        type: BonusType;
        value: number;
        title: string;
        description: string;
        validDays: number;
        conditions: any;
    };

    @Column({
        type: DataType.JSONB,
        allowNull: false,
    })
    referredBonus: {
        type: BonusType;
        value: number;
        title: string;
        description: string;
        validDays: number;
        conditions: any;
    };

    @Column({
        type: DataType.INTEGER,
        defaultValue: 0,
    })
    priority: number; // Processing order for multiple configs

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column
    createdBy: string;

    @BelongsTo(() => User, 'createdBy')
    creator: User;
}

export interface IReferralBonus {
    id?: string;
    referralId: string;
    recipientId: string;
    type: BonusType;
    status?: BonusStatus;
    triggerEvent: TriggerEvent;
    value?: number;
    title?: string;
    description?: string;
    discountCampaignId?: string;
    expiresAt?: Date;
    triggeredAt?: Date;
    usedAt?: Date;
    usedInOrderId?: string;
    conditions?: any;
    metadata?: any;
}

export interface IReferralBonusConfig {
    id?: string;
    name: string;
    triggerEvent: TriggerEvent;
    isActive?: boolean;
    refereeBonus: any;
    referredBonus: any;
    priority?: number;
    createdBy: string;
}