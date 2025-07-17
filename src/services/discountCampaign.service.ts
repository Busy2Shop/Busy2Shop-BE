import { Op } from 'sequelize';
import DiscountCampaign, { 
    IDiscountCampaign, 
    DiscountType, 
    DiscountTargetType, 
    CampaignStatus 
} from '../models/discountCampaign.model';
import DiscountUsage from '../models/discountUsage.model';
import User from '../models/user.model';
import Product from '../models/product.model';
import Market from '../models/market.model';
import ReferralBonus, { BonusType, BonusStatus } from '../models/referralBonus.model';
import { NotFoundError, BadRequestError } from '../utils/customErrors';
import { Database } from '../models';

interface ICampaignQuery {
    page?: number;
    size?: number;
    status?: CampaignStatus;
    type?: DiscountType;
    targetType?: DiscountTargetType;
    isActive?: boolean;
}

interface IDiscountFilters {
    userId: string;
    orderAmount?: number;
    marketId?: string;
    productIds?: string[];
}

interface IDiscountValidation {
    code: string;
    userId: string;
    orderAmount: number;
    marketId?: string;
    productIds?: string[];
}

interface IApplyDiscountData {
    campaignId: string;
    userId: string;
    orderId?: string;
    shoppingListId?: string;
    orderTotal: number;
    items: Array<{
        productId: string;
        quantity: number;
        price: number;
    }>;
}

export default class DiscountCampaignService {
    // Admin methods for managing campaigns

    static async getAllCampaigns(query: ICampaignQuery): Promise<{
        campaigns: DiscountCampaign[];
        pagination?: {
            page: number;
            size: number;
            total: number;
            pages: number;
        };
    }> {
        const { page, size, status, type, targetType, isActive } = query;
        
        const whereClause: any = {};
        
        if (status) whereClause.status = status;
        if (type) whereClause.type = type;
        if (targetType) whereClause.targetType = targetType;
        
        if (isActive !== undefined) {
            const now = new Date();
            if (isActive) {
                whereClause.status = CampaignStatus.ACTIVE;
                whereClause.startDate = { [Op.lte]: now };
                whereClause.endDate = { [Op.gte]: now };
            }
        }

        const options: any = {
            where: whereClause,
            include: [
                {
                    model: User,
                    as: 'creator',
                    attributes: ['id', 'firstName', 'lastName', 'email']
                }
            ],
            order: [['createdAt', 'DESC']]
        };

        if (page && size) {
            const offset = (page - 1) * size;
            options.limit = size;
            options.offset = offset;

            const { count, rows } = await DiscountCampaign.findAndCountAll(options);
            
            return {
                campaigns: rows,
                pagination: {
                    page,
                    size,
                    total: count,
                    pages: Math.ceil(count / size)
                }
            };
        }

        const campaigns = await DiscountCampaign.findAll(options);
        return { campaigns };
    }

    static async getCampaignById(id: string): Promise<DiscountCampaign> {
        const campaign = await DiscountCampaign.findByPk(id, {
            include: [
                {
                    model: User,
                    as: 'creator',
                    attributes: ['id', 'firstName', 'lastName', 'email']
                },
                {
                    model: DiscountUsage,
                    as: 'usages',
                    limit: 10,
                    order: [['createdAt', 'DESC']],
                    include: [
                        {
                            model: User,
                            attributes: ['id', 'firstName', 'lastName', 'email']
                        }
                    ]
                }
            ]
        });

        if (!campaign) {
            throw new NotFoundError('Discount campaign not found');
        }

        return campaign;
    }

    static async createCampaign(campaignData: IDiscountCampaign): Promise<DiscountCampaign> {
        // Validate creator exists
        const creator = await User.findByPk(campaignData.createdBy);
        if (!creator) {
            throw new NotFoundError('Creator user not found');
        }

        // Validate discount code uniqueness if provided
        if (campaignData.code) {
            const existingCampaign = await DiscountCampaign.findOne({
                where: { code: campaignData.code }
            });
            if (existingCampaign) {
                throw new BadRequestError('Discount code already exists');
            }
        }

        const campaign = await DiscountCampaign.create(campaignData);
        return campaign;
    }

    static async updateCampaign(id: string, updateData: Partial<IDiscountCampaign>): Promise<DiscountCampaign> {
        const campaign = await DiscountCampaign.findByPk(id);
        if (!campaign) {
            throw new NotFoundError('Discount campaign not found');
        }

        // Validate discount code uniqueness if being updated
        if (updateData.code && updateData.code !== campaign.code) {
            const existingCampaign = await DiscountCampaign.findOne({
                where: { 
                    code: updateData.code,
                    id: { [Op.ne]: id }
                }
            });
            if (existingCampaign) {
                throw new BadRequestError('Discount code already exists');
            }
        }

        await campaign.update(updateData);
        return campaign;
    }

    static async deleteCampaign(id: string): Promise<void> {
        const campaign = await DiscountCampaign.findByPk(id);
        if (!campaign) {
            throw new NotFoundError('Discount campaign not found');
        }

        // Check if campaign has been used
        const usageCount = await DiscountUsage.count({
            where: { campaignId: id }
        });

        if (usageCount > 0) {
            // Don't delete campaigns that have been used, just deactivate them
            await campaign.update({ status: CampaignStatus.CANCELLED });
        } else {
            await campaign.destroy();
        }
    }

    static async updateCampaignStatus(id: string, status: CampaignStatus): Promise<DiscountCampaign> {
        const campaign = await DiscountCampaign.findByPk(id);
        if (!campaign) {
            throw new NotFoundError('Discount campaign not found');
        }

        await campaign.update({ status });
        return campaign;
    }

    // User methods for applying discounts

    static async getAvailableDiscountsForUser(filters: IDiscountFilters): Promise<DiscountCampaign[]> {
        const { userId, orderAmount, marketId, productIds } = filters;
        const now = new Date();

        // Base query for active campaigns
        const whereClause: any = {
            status: CampaignStatus.ACTIVE,
            startDate: { [Op.lte]: now },
            endDate: { [Op.gte]: now },
            [Op.or]: [
                { usageLimit: null },
                { usageLimit: { [Op.gt]: Database.col('usageCount') } }
            ]
        };

        // Filter by minimum order amount
        if (orderAmount) {
            whereClause[Op.or] = [
                { minimumOrderAmount: null },
                { minimumOrderAmount: { [Op.lte]: orderAmount } }
            ];
        }

        const campaigns = await DiscountCampaign.findAll({
            where: whereClause,
            order: [['priority', 'DESC'], ['value', 'DESC']]
        });

        // Filter campaigns based on target type and user eligibility
        const eligibleCampaigns: DiscountCampaign[] = [];

        for (const campaign of campaigns) {
            const isEligible = await this.isCampaignEligibleForUser(campaign, userId, {
                orderAmount,
                marketId,
                productIds
            });

            if (isEligible) {
                eligibleCampaigns.push(campaign);
            }
        }

        return eligibleCampaigns;
    }

    static async validateDiscountCode(validation: IDiscountValidation): Promise<{
        isValid: boolean;
        campaign?: DiscountCampaign;
        discountAmount?: number;
        error?: string;
    }> {
        const { code, userId, orderAmount, marketId, productIds } = validation;

        const campaign = await DiscountCampaign.findOne({
            where: { code }
        });

        if (!campaign) {
            return {
                isValid: false,
                error: 'Invalid discount code'
            };
        }

        const now = new Date();

        // Check if campaign is active
        if (campaign.status !== CampaignStatus.ACTIVE) {
            return {
                isValid: false,
                error: 'Discount code is not active'
            };
        }

        // Check date range
        if (campaign.startDate > now || campaign.endDate < now) {
            return {
                isValid: false,
                error: 'Discount code has expired or is not yet active'
            };
        }

        // Check usage limits
        if (campaign.usageLimit && campaign.usageCount >= campaign.usageLimit) {
            return {
                isValid: false,
                error: 'Discount code has reached its usage limit'
            };
        }

        // Check user-specific eligibility
        const isEligible = await this.isCampaignEligibleForUser(campaign, userId, {
            orderAmount,
            marketId,
            productIds
        });

        if (!isEligible) {
            return {
                isValid: false,
                error: 'You are not eligible for this discount'
            };
        }

        // Calculate discount amount
        const discountAmount = await this.calculateDiscountAmount(campaign, {
            orderAmount,
            productIds: productIds || []
        });

        return {
            isValid: true,
            campaign,
            discountAmount
        };
    }

    static async getDiscountPreview(data: {
        campaignId: string;
        orderTotal: number;
        items?: any[];
    }): Promise<{
        discountAmount: number;
        finalTotal: number;
        effectivePercentage: number;
    }> {
        const { campaignId, orderTotal, items } = data;

        const campaign = await DiscountCampaign.findByPk(campaignId);
        if (!campaign) {
            throw new NotFoundError('Discount campaign not found');
        }

        // Calculate discount amount with security limits
        const discountAmount = await this.calculateDiscountAmount(campaign, {
            orderAmount: orderTotal,
            productIds: items?.map(item => item.productId) || []
        });

        const finalTotal = Math.max(0, orderTotal - discountAmount);
        const effectivePercentage = orderTotal > 0 ? (discountAmount / orderTotal) * 100 : 0;

        return {
            discountAmount: Math.round(discountAmount * 100) / 100,
            finalTotal: Math.round(finalTotal * 100) / 100,
            effectivePercentage: Math.round(effectivePercentage * 100) / 100
        };
    }

    static async applyDiscount(data: IApplyDiscountData): Promise<{
        discountAmount: number;
        finalTotal: number;
        usage: DiscountUsage;
    }> {
        const { campaignId, userId, orderId, shoppingListId, orderTotal, items } = data;

        const campaign = await DiscountCampaign.findByPk(campaignId);
        if (!campaign) {
            throw new NotFoundError('Discount campaign not found');
        }

        // Validate eligibility
        const isEligible = await this.isCampaignEligibleForUser(campaign, userId, {
            orderAmount: orderTotal
        });

        if (!isEligible) {
            throw new BadRequestError('User is not eligible for this discount');
        }

        // Calculate discount amount
        const discountAmount = await this.calculateDiscountAmount(campaign, {
            orderAmount: orderTotal,
            productIds: items.map(item => item.productId)
        });

        if (discountAmount <= 0) {
            throw new BadRequestError('No discount applicable for this order');
        }

        // Create usage record
        const usage = await DiscountUsage.create({
            campaignId,
            userId,
            orderId,
            shoppingListId,
            discountAmount,
            orderTotal,
            metadata: {
                appliedProducts: items.map(item => item.productId),
                originalPrice: orderTotal,
                finalPrice: orderTotal - discountAmount
            }
        });

        // Update campaign usage count
        await campaign.increment('usageCount');

        const finalTotal = Math.max(0, orderTotal - discountAmount);

        return {
            discountAmount,
            finalTotal,
            usage
        };
    }

    static async getUserDiscountHistory(query: {
        userId: string;
        page?: number;
        size?: number;
    }): Promise<{
        usages: DiscountUsage[];
        pagination?: {
            page: number;
            size: number;
            total: number;
            pages: number;
        };
    }> {
        const { userId, page, size } = query;

        const options: any = {
            where: { userId },
            include: [
                {
                    model: DiscountCampaign,
                    attributes: ['id', 'name', 'type', 'code']
                }
            ],
            order: [['createdAt', 'DESC']]
        };

        if (page && size) {
            const offset = (page - 1) * size;
            options.limit = size;
            options.offset = offset;

            const { count, rows } = await DiscountUsage.findAndCountAll(options);
            
            return {
                usages: rows,
                pagination: {
                    page,
                    size,
                    total: count,
                    pages: Math.ceil(count / size)
                }
            };
        }

        const usages = await DiscountUsage.findAll(options);
        return { usages };
    }

    static async calculateDiscountPreview(data: {
        campaignId: string;
        userId: string;
        orderTotal: number;
        items: Array<{ productId: string; quantity: number; price: number }>;
        marketId?: string;
    }): Promise<{
        discountAmount: number;
        finalTotal: number;
        isEligible: boolean;
        error?: string;
    }> {
        const { campaignId, userId, orderTotal, items, marketId } = data;

        const campaign = await DiscountCampaign.findByPk(campaignId);
        if (!campaign) {
            return {
                discountAmount: 0,
                finalTotal: orderTotal,
                isEligible: false,
                error: 'Campaign not found'
            };
        }

        const isEligible = await this.isCampaignEligibleForUser(campaign, userId, {
            orderAmount: orderTotal,
            marketId,
            productIds: items.map(item => item.productId)
        });

        if (!isEligible) {
            return {
                discountAmount: 0,
                finalTotal: orderTotal,
                isEligible: false,
                error: 'Not eligible for this discount'
            };
        }

        const discountAmount = await this.calculateDiscountAmount(campaign, {
            orderAmount: orderTotal,
            productIds: items.map(item => item.productId)
        });

        return {
            discountAmount,
            finalTotal: Math.max(0, orderTotal - discountAmount),
            isEligible: true
        };
    }

    static async getCampaignStatistics(id: string): Promise<{
        totalUsage: number;
        totalDiscountGiven: number;
        uniqueUsers: number;
        averageOrderValue: number;
        conversionRate: number;
        topUsers: Array<{
            user: User;
            usageCount: number;
            totalDiscount: number;
        }>;
    }> {
        const campaign = await DiscountCampaign.findByPk(id);
        if (!campaign) {
            throw new NotFoundError('Campaign not found');
        }

        const usages = await DiscountUsage.findAll({
            where: { campaignId: id },
            include: [
                {
                    model: User,
                    attributes: ['id', 'firstName', 'lastName', 'email']
                }
            ]
        });

        const totalUsage = usages.length;
        const totalDiscountGiven = usages.reduce((sum, usage) => sum + Number(usage.discountAmount), 0);
        const uniqueUsers = new Set(usages.map(usage => usage.userId)).size;
        const averageOrderValue = usages.length > 0 
            ? usages.reduce((sum, usage) => sum + Number(usage.orderTotal), 0) / usages.length 
            : 0;

        // Group by user for top users
        const userStats = usages.reduce((acc, usage) => {
            const userId = usage.userId;
            if (!acc[userId]) {
                acc[userId] = {
                    user: usage.user,
                    usageCount: 0,
                    totalDiscount: 0
                };
            }
            acc[userId].usageCount++;
            acc[userId].totalDiscount += Number(usage.discountAmount);
            return acc;
        }, {} as Record<string, any>);

        const topUsers = Object.values(userStats)
            .sort((a: any, b: any) => b.totalDiscount - a.totalDiscount)
            .slice(0, 10);

        return {
            totalUsage,
            totalDiscountGiven,
            uniqueUsers,
            averageOrderValue,
            conversionRate: 0, // Would need additional data to calculate
            topUsers
        };
    }

    // Helper methods

    private static async isCampaignEligibleForUser(
        campaign: DiscountCampaign, 
        userId: string, 
        context: {
            orderAmount?: number;
            marketId?: string;
            productIds?: string[];
        }
    ): Promise<boolean> {
        // Check user-specific usage limit
        if (campaign.usageLimitPerUser) {
            const userUsageCount = await DiscountUsage.count({
                where: {
                    campaignId: campaign.id,
                    userId
                }
            });

            if (userUsageCount >= campaign.usageLimitPerUser) {
                return false;
            }
        }

        // Check minimum order amount
        if (campaign.minimumOrderAmount && context.orderAmount && context.orderAmount < campaign.minimumOrderAmount) {
            return false;
        }

        // Check target type specific eligibility
        switch (campaign.targetType) {
            case DiscountTargetType.USER:
                if (!campaign.targetUserIds.includes(userId)) {
                    return false;
                }
                break;

            case DiscountTargetType.MARKET:
                if (context.marketId && !campaign.targetMarketIds.includes(context.marketId)) {
                    return false;
                }
                break;

            case DiscountTargetType.PRODUCT:
                if (context.productIds && 
                    !context.productIds.some(pid => campaign.targetProductIds.includes(pid))) {
                    return false;
                }
                break;

            case DiscountTargetType.REFERRAL:
                // Check if user has referral bonuses
                const hasReferralBonus = await ReferralBonus.findOne({
                    where: {
                        recipientId: userId,
                        status: BonusStatus.AVAILABLE,
                        type: BonusType.DISCOUNT
                    }
                });
                if (!hasReferralBonus) {
                    return false;
                }
                break;

            case DiscountTargetType.FIRST_ORDER:
                // Check if this is user's first order
                const previousOrders = await DiscountUsage.count({
                    where: { userId }
                });
                if (previousOrders > 0) {
                    return false;
                }
                break;
        }

        return true;
    }

    private static async calculateDiscountAmount(
        campaign: DiscountCampaign, 
        context: {
            orderAmount: number;
            productIds: string[];
        }
    ): Promise<number> {
        const { orderAmount, productIds } = context;
        
        // Security: Maximum allowed discount percentages
        const MAX_DISCOUNT_PERCENTAGE = 40; // 40% max
        const MAX_DISCOUNT_AMOUNT_RATIO = 0.4; // Maximum 40% of order value
        
        let discountAmount = 0;

        switch (campaign.type) {
            case DiscountType.PERCENTAGE:
                // Cap percentage at maximum allowed
                const effectivePercentage = Math.min(campaign.value, MAX_DISCOUNT_PERCENTAGE);
                const percentageDiscount = (orderAmount * effectivePercentage) / 100;
                
                // Apply campaign's maximum if set
                discountAmount = campaign.maximumDiscountAmount 
                    ? Math.min(percentageDiscount, campaign.maximumDiscountAmount)
                    : percentageDiscount;
                break;

            case DiscountType.FIXED_AMOUNT:
                // Fixed amount cannot exceed order amount
                discountAmount = Math.min(campaign.value, orderAmount);
                break;

            case DiscountType.FREE_SHIPPING:
                // Would need shipping cost calculation
                discountAmount = 0; // Placeholder
                break;

            case DiscountType.BUY_X_GET_Y:
                // Complex calculation based on buyXGetYConfig
                discountAmount = 0; // Placeholder - would need product-specific logic
                break;

            default:
                discountAmount = 0;
        }
        
        // Final security check: Ensure discount doesn't exceed maximum allowed ratio
        const maxAllowedDiscount = orderAmount * MAX_DISCOUNT_AMOUNT_RATIO;
        discountAmount = Math.min(discountAmount, maxAllowedDiscount);
        
        // Ensure discount is never negative and doesn't exceed order amount
        discountAmount = Math.max(0, Math.min(discountAmount, orderAmount * 0.8));
        
        return Math.round(discountAmount * 100) / 100; // Round to 2 decimal places
    }
}