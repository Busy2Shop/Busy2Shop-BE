import FeaturedPromotion, { IFeaturedPromotion, SearchType } from '../models/featuredPromotion.model';
import { BadRequestError, NotFoundError } from '../utils/customErrors';
import { logger } from '../utils/logger';
import { Op } from 'sequelize';

export interface IGetPromotionsOptions {
    includeInactive?: boolean;
    searchType?: SearchType;
    limit?: number;
}

export default class FeaturedPromotionService {
    /**
     * Get all active featured promotions for display on home page
     */
    async getActivePromotions(limit: number = 6): Promise<FeaturedPromotion[]> {
        try {
            const now = new Date();

            // Build where clause with proper typing
            // Note: Using type assertion for complex Sequelize operators that TypeScript struggles with
            const whereClause: any = {
                isActive: true,
                [Op.and]: [
                    {
                        [Op.or]: [
                            { startDate: { [Op.is]: null } },
                            { startDate: { [Op.lte]: now } },
                        ],
                    },
                    {
                        [Op.or]: [
                            { endDate: { [Op.is]: null } },
                            { endDate: { [Op.gte]: now } },
                        ],
                    },
                ],
            };

            const promotions = await FeaturedPromotion.findAll({
                where: whereClause,
                order: [
                    ['displayOrder', 'ASC'],
                    ['createdAt', 'DESC'],
                ],
                limit,
            });

            logger.info(`Retrieved ${promotions.length} active featured promotions`);
            return promotions;
        } catch (error) {
            logger.error('Error fetching active promotions:', error);
            throw error;
        }
    }

    /**
     * Get all promotions (admin view)
     */
    async getAllPromotions(options: IGetPromotionsOptions = {}): Promise<FeaturedPromotion[]> {
        try {
            const { includeInactive = true, searchType, limit } = options;

            const where: any = {};

            if (!includeInactive) {
                where.isActive = true;
            }

            if (searchType) {
                where.searchType = searchType;
            }

            const promotions = await FeaturedPromotion.findAll({
                where,
                order: [
                    ['displayOrder', 'ASC'],
                    ['createdAt', 'DESC'],
                ],
                limit,
            });

            logger.info(`Retrieved ${promotions.length} promotions (includeInactive: ${includeInactive})`);
            return promotions;
        } catch (error) {
            logger.error('Error fetching promotions:', error);
            throw error;
        }
    }

    /**
     * Get promotion by ID
     */
    async getPromotionById(id: string): Promise<FeaturedPromotion> {
        try {
            const promotion = await FeaturedPromotion.findByPk(id);

            if (!promotion) {
                throw new NotFoundError('Featured promotion not found');
            }

            return promotion;
        } catch (error) {
            logger.error(`Error fetching promotion ${id}:`, error);
            throw error;
        }
    }

    /**
     * Create new featured promotion
     */
    async createPromotion(data: IFeaturedPromotion): Promise<FeaturedPromotion> {
        try {
            // Validate required fields
            if (!data.title || !data.searchQuery || !data.searchType) {
                throw new BadRequestError('Title, search query, and search type are required');
            }

            // Set default display order if not provided
            if (data.displayOrder === undefined) {
                const maxOrder = await FeaturedPromotion.max('displayOrder') as number;
                data.displayOrder = (maxOrder || 0) + 1;
            }

            const promotion = await FeaturedPromotion.create(data);

            logger.info(`Created featured promotion: ${promotion.id} - ${promotion.title}`);
            return promotion;
        } catch (error) {
            logger.error('Error creating promotion:', error);
            throw error;
        }
    }

    /**
     * Update featured promotion
     */
    async updatePromotion(id: string, data: Partial<IFeaturedPromotion>): Promise<FeaturedPromotion> {
        try {
            const promotion = await this.getPromotionById(id);

            // Update fields
            await promotion.update(data);

            logger.info(`Updated featured promotion: ${id} - ${promotion.title}`);
            return promotion;
        } catch (error) {
            logger.error(`Error updating promotion ${id}:`, error);
            throw error;
        }
    }

    /**
     * Delete featured promotion
     */
    async deletePromotion(id: string): Promise<void> {
        try {
            const promotion = await this.getPromotionById(id);

            await promotion.destroy();

            logger.info(`Deleted featured promotion: ${id} - ${promotion.title}`);
        } catch (error) {
            logger.error(`Error deleting promotion ${id}:`, error);
            throw error;
        }
    }

    /**
     * Toggle promotion active status
     */
    async togglePromotionStatus(id: string): Promise<FeaturedPromotion> {
        try {
            const promotion = await this.getPromotionById(id);

            promotion.isActive = !promotion.isActive;
            await promotion.save();

            logger.info(`Toggled promotion ${id} status to: ${promotion.isActive}`);
            return promotion;
        } catch (error) {
            logger.error(`Error toggling promotion ${id}:`, error);
            throw error;
        }
    }

    /**
     * Reorder promotions
     */
    async reorderPromotions(promotionOrders: { id: string; displayOrder: number }[]): Promise<void> {
        try {
            // Update each promotion's display order
            await Promise.all(
                promotionOrders.map(({ id, displayOrder }) =>
                    FeaturedPromotion.update({ displayOrder }, { where: { id } })
                )
            );

            logger.info(`Reordered ${promotionOrders.length} promotions`);
        } catch (error) {
            logger.error('Error reordering promotions:', error);
            throw error;
        }
    }

    /**
     * Track promotion click
     */
    async trackClick(id: string): Promise<void> {
        try {
            const promotion = await this.getPromotionById(id);
            await promotion.incrementClickCount();

            logger.info(`Tracked click for promotion: ${id} (total: ${promotion.clickCount})`);
        } catch (error) {
            logger.error(`Error tracking click for promotion ${id}:`, error);
            // Don't throw error for analytics tracking
        }
    }

    /**
     * Get promotion analytics
     */
    async getPromotionAnalytics(id: string): Promise<{
        promotion: FeaturedPromotion;
        analytics: {
            totalClicks: number;
            clicksPerDay: number;
            isActive: boolean;
            daysActive: number;
        };
    }> {
        try {
            const promotion = await this.getPromotionById(id);

            const daysActive = promotion.createdAt
                ? Math.floor((Date.now() - promotion.createdAt.getTime()) / (1000 * 60 * 60 * 24))
                : 0;

            const clicksPerDay = daysActive > 0 ? promotion.clickCount / daysActive : promotion.clickCount;

            return {
                promotion,
                analytics: {
                    totalClicks: promotion.clickCount,
                    clicksPerDay: Math.round(clicksPerDay * 100) / 100,
                    isActive: promotion.isCurrentlyActive(),
                    daysActive,
                },
            };
        } catch (error) {
            logger.error(`Error fetching analytics for promotion ${id}:`, error);
            throw error;
        }
    }
}
