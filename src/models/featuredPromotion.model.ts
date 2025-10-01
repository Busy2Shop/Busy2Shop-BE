import {
    Table,
    Column,
    Model,
    DataType,
    PrimaryKey,
    Default,
    CreatedAt,
    UpdatedAt,
} from 'sequelize-typescript';

export type SearchType = 'location' | 'market' | 'product' | 'category' | 'discount' | 'all';

export interface IGradientConfig {
    from: string;
    to: string;
    direction: string; // e.g., 'to-br', 'to-r', 'to-bl'
}

export interface ISearchFilters {
    location?: string;
    marketId?: string;
    categoryId?: string;
    hasDiscount?: boolean;
    minPrice?: number;
    maxPrice?: number;
    [key: string]: any;
}

export interface IPromotionMetadata {
    area?: string;
    state?: string;
    category?: string;
    targetMarketId?: string;
    partnerId?: string;
    campaignId?: string;
    discountPercentage?: number;
    [key: string]: any;
}

export interface IFeaturedPromotion {
    id?: string;
    title: string;
    subtitle?: string;
    icon?: string; // Lucide icon name or emoji
    iconUrl?: string; // Custom icon image URL
    backgroundColor: string;
    backgroundGradient?: IGradientConfig;
    searchQuery: string;
    searchType: SearchType;
    searchFilters?: ISearchFilters;
    displayOrder: number;
    isActive?: boolean;
    startDate?: Date;
    endDate?: Date;
    clickCount?: number;
    metadata?: IPromotionMetadata;
}

@Table({
    tableName: 'featured_promotions',
    indexes: [
        {
            fields: ['isActive', 'displayOrder'],
            name: 'featured_promotions_active_order_idx',
        },
        {
            fields: ['searchType'],
            name: 'featured_promotions_search_type_idx',
        },
        {
            fields: ['startDate', 'endDate'],
            name: 'featured_promotions_dates_idx',
        },
    ],
})
export default class FeaturedPromotion extends Model<FeaturedPromotion | IFeaturedPromotion> {
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column(DataType.UUID)
    id: string;

    @Column({
        type: DataType.STRING(100),
        allowNull: false,
        comment: 'Display title for the promotional card',
    })
    title: string;

    @Column({
        type: DataType.STRING(200),
        allowNull: true,
        comment: 'Optional subtitle or description',
    })
    subtitle: string;

    @Column({
        type: DataType.STRING(50),
        allowNull: true,
        comment: 'Lucide icon name or emoji for the card',
    })
    icon: string;

    @Column({
        type: DataType.TEXT,
        allowNull: true,
        comment: 'URL to custom icon/image',
    })
    iconUrl: string;

    @Column({
        type: DataType.STRING(50),
        allowNull: false,
        defaultValue: '#00A67E',
        comment: 'Background color (hex, rgb, or gradient class)',
    })
    backgroundColor: string;

    @Column({
        type: DataType.JSONB,
        allowNull: true,
        comment: 'Gradient configuration {from: "#color1", to: "#color2", direction: "to-br"}',
    })
    backgroundGradient: IGradientConfig;

    @Column({
        type: DataType.STRING(200),
        allowNull: false,
        comment: 'Search query to execute when clicked',
    })
    searchQuery: string;

    @Column({
        type: DataType.ENUM('location', 'market', 'product', 'category', 'discount', 'all'),
        allowNull: false,
        defaultValue: 'all',
        comment: 'Type of search to prioritize results',
    })
    searchType: SearchType;

    @Column({
        type: DataType.JSONB,
        allowNull: true,
        comment: 'Additional search filters (marketId, categoryId, hasDiscount, etc)',
    })
    searchFilters: ISearchFilters;

    @Column({
        type: DataType.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Order in which cards appear (lower numbers first)',
    })
    displayOrder: number;

    @Column({
        type: DataType.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Whether this promotion is currently active',
    })
    isActive: boolean;

    @Column({
        type: DataType.DATE,
        allowNull: true,
        comment: 'Optional start date for scheduled promotions',
    })
    startDate: Date;

    @Column({
        type: DataType.DATE,
        allowNull: true,
        comment: 'Optional end date for time-limited promotions',
    })
    endDate: Date;

    @Column({
        type: DataType.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of times this card has been clicked',
    })
    clickCount: number;

    @Column({
        type: DataType.JSONB,
        allowNull: true,
        comment: 'Additional metadata (targetMarketId, partnerId, campaignId, etc)',
    })
    metadata: IPromotionMetadata;

    @CreatedAt
    createdAt: Date;

    @UpdatedAt
    updatedAt: Date;

    // Helper method to check if promotion is currently active based on dates
    isCurrentlyActive(): boolean {
        if (!this.isActive) return false;

        const now = new Date();

        if (this.startDate && now < this.startDate) {
            return false; // Not started yet
        }

        if (this.endDate && now > this.endDate) {
            return false; // Already ended
        }

        return true;
    }

    // Helper method to increment click count
    async incrementClickCount(): Promise<void> {
        this.clickCount += 1;
        await this.save();
    }
}
