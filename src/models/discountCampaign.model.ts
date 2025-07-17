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
    HasMany,
    BeforeCreate,
    BeforeUpdate,
} from 'sequelize-typescript';
import User from './user.model';
import DiscountUsage from './discountUsage.model';
import Market from './market.model';
import Product from './product.model';

export enum DiscountType {
    PERCENTAGE = 'percentage',
    FIXED_AMOUNT = 'fixed_amount',
    BUY_X_GET_Y = 'buy_x_get_y',
    FREE_SHIPPING = 'free_shipping',
}

export enum DiscountTargetType {
    GLOBAL = 'global', // Apply to entire order
    MARKET = 'market', // Apply to specific market orders
    PRODUCT = 'product', // Apply to specific products
    CATEGORY = 'category', // Apply to specific categories
    USER = 'user', // Apply to specific users
    REFERRAL = 'referral', // Referral bonus discounts
    FIRST_ORDER = 'first_order', // First-time user discounts
}

export enum CampaignStatus {
    DRAFT = 'draft',
    ACTIVE = 'active',
    PAUSED = 'paused',
    EXPIRED = 'expired',
    CANCELLED = 'cancelled',
}

@Table({
    indexes: [
        {
            fields: ['status', 'startDate', 'endDate'],
        },
        {
            fields: ['targetType'],
        },
        {
            fields: ['code'],
            unique: true,
            where: {
                code: { [require('sequelize').Op.ne]: null },
            },
        },
    ],
})
export default class DiscountCampaign extends Model<DiscountCampaign | IDiscountCampaign> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
    id: string;

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
        type: DataType.STRING,
        allowNull: true,
        unique: true,
    })
    code: string; // Promo code (optional for automatic discounts)

    @Column({
        type: DataType.ENUM(...Object.values(DiscountType)),
        allowNull: false,
    })
    type: DiscountType;

    @Column({
        type: DataType.ENUM(...Object.values(DiscountTargetType)),
        allowNull: false,
    })
    targetType: DiscountTargetType;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false,
    })
    value: number; // Percentage (0-100) or fixed amount

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: true,
    })
    minimumOrderAmount: number;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: true,
    })
    maximumDiscountAmount: number; // Cap for percentage discounts

    @Column({
        type: DataType.INTEGER,
        allowNull: true,
    })
    usageLimit: number; // Total usage limit across all users

    @Column({
        type: DataType.INTEGER,
        allowNull: true,
    })
    usageLimitPerUser: number; // Usage limit per user

    @Column({
        type: DataType.INTEGER,
        defaultValue: 0,
    })
    usageCount: number; // Current usage count

    @Column({
        type: DataType.DATE,
        allowNull: false,
    })
    startDate: Date;

    @Column({
        type: DataType.DATE,
        allowNull: false,
    })
    endDate: Date;

    @Column({
        type: DataType.ENUM(...Object.values(CampaignStatus)),
        defaultValue: CampaignStatus.DRAFT,
    })
    status: CampaignStatus;

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: false,
    })
    isAutomaticApply: boolean; // Auto-apply without code

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: false,
    })
    isStackable: boolean; // Can be combined with other discounts

    @Column({
        type: DataType.INTEGER,
        defaultValue: 0,
    })
    priority: number; // Higher priority discounts apply first

    @Column({
        type: DataType.JSONB,
        allowNull: true,
        defaultValue: {},
    })
    conditions: {
        // Advanced conditions for discount eligibility
        userType?: 'customer' | 'agent'; // Specific user types
        dayOfWeek?: number[]; // 0-6 (Sunday-Saturday)
        timeOfDay?: {
            start: string; // HH:mm format
            end: string;
        };
        orderCount?: {
            min?: number;
            max?: number;
        };
        lastOrderDays?: number; // Days since last order
        excludeDiscountedItems?: boolean;
        includeShippingInMinimum?: boolean;
    };

    @Column({
        type: DataType.JSONB,
        allowNull: true,
        defaultValue: {},
    })
    buyXGetYConfig: {
        buyQuantity?: number;
        getQuantity?: number;
        buyProductIds?: string[];
        getProductIds?: string[];
        applyToSameProduct?: boolean;
    };

    @Column({
        type: DataType.ARRAY(DataType.UUID),
        allowNull: true,
        defaultValue: [],
    })
    targetProductIds: string[]; // For product-specific discounts

    @Column({
        type: DataType.ARRAY(DataType.UUID),
        allowNull: true,
        defaultValue: [],
    })
    targetMarketIds: string[]; // For market-specific discounts

    @Column({
        type: DataType.ARRAY(DataType.UUID),
        allowNull: true,
        defaultValue: [],
    })
    targetUserIds: string[]; // For user-specific discounts

    @Column({
        type: DataType.ARRAY(DataType.STRING),
        allowNull: true,
        defaultValue: [],
    })
    targetCategories: string[]; // For category-specific discounts

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column
    createdBy: string; // Admin who created the campaign

    @BelongsTo(() => User, 'createdBy')
    creator: User;

    @HasMany(() => DiscountUsage, 'campaignId')
    usages: DiscountUsage[];

    @BeforeCreate
    @BeforeUpdate
    static validateConfiguration(instance: DiscountCampaign) {
        // Validate discount value based on type
        if (instance.type === DiscountType.PERCENTAGE && (instance.value < 0 || instance.value > 100)) {
            throw new Error('Percentage discount must be between 0 and 100');
        }

        if (instance.type === DiscountType.FIXED_AMOUNT && instance.value < 0) {
            throw new Error('Fixed amount discount cannot be negative');
        }

        // Validate date range
        if (instance.startDate >= instance.endDate) {
            throw new Error('Start date must be before end date');
        }

        // Validate Buy X Get Y configuration
        if (instance.type === DiscountType.BUY_X_GET_Y) {
            if (!instance.buyXGetYConfig || !instance.buyXGetYConfig.buyQuantity || !instance.buyXGetYConfig.getQuantity) {
                throw new Error('Buy X Get Y discounts require buyQuantity and getQuantity configuration');
            }
        }
    }

    // Check if campaign is currently active
    get isActive(): boolean {
        const now = new Date();
        return this.status === CampaignStatus.ACTIVE && 
               this.startDate <= now && 
               this.endDate >= now &&
               (this.usageLimit === null || this.usageCount < this.usageLimit);
    }

    // Check if campaign can be used by a specific user
    async canBeUsedBy(userId: string): Promise<boolean> {
        if (!this.isActive) return false;

        if (this.usageLimitPerUser) {
            const userUsageCount = await DiscountUsage.count({
                where: {
                    campaignId: this.id,
                    userId: userId,
                },
            });

            if (userUsageCount >= this.usageLimitPerUser) {
                return false;
            }
        }

        return true;
    }
}


export interface IDiscountCampaign {
    id?: string;
    name: string;
    description?: string;
    code?: string;
    type: DiscountType;
    targetType: DiscountTargetType;
    value: number;
    minimumOrderAmount?: number;
    maximumDiscountAmount?: number;
    usageLimit?: number;
    usageLimitPerUser?: number;
    usageCount?: number;
    startDate: Date;
    endDate: Date;
    status?: CampaignStatus;
    isAutomaticApply?: boolean;
    isStackable?: boolean;
    priority?: number;
    conditions?: any;
    buyXGetYConfig?: any;
    targetProductIds?: string[];
    targetMarketIds?: string[];
    targetUserIds?: string[];
    targetCategories?: string[];
    createdBy: string;
    creator?: User;
    usages?: DiscountUsage[];
}

