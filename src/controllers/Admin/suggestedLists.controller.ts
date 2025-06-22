/* eslint-disable @typescript-eslint/no-explicit-any */
import { Response } from 'express';
import { AdminAuthenticatedRequest } from '../../middlewares/authMiddleware';
import ShoppingListService from '../../services/shoppingList.service';
import ShoppingList from '../../models/shoppingList.model';
import ShoppingListItem from '../../models/shoppingListItem.model';
import Market from '../../models/market.model';
import User from '../../models/user.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/customErrors';
import { Op } from 'sequelize';

export default class SuggestedListsController {
    /**
     * Create a new suggested shopping list (Admin only)
     */
    static async createSuggestedList(req: AdminAuthenticatedRequest, res: Response) {
        // Admin authentication is handled by middleware

        const {
            name,
            notes,
            category,
            tags,
            estimatedTime,
            estimatedCost,
            minPrice,
            maxPrice,
            marketType,
            image,
            isPopular,
            sortOrder,
            marketId,
            items,
        } = req.body;

        if (!name) {
            throw new BadRequestError('List name is required');
        }

        // Create the suggested list
        const suggestedList = await ShoppingListService.createShoppingList(
            {
                name,
                notes,
                customerId: '00000000-0000-0000-0000-000000000000', // System user ID for admin-created lists
                marketId,
                status: 'draft',
                creatorType: 'admin',
                listType: 'suggested',
                category,
                estimatedTime,
                estimatedCost,
                minPrice,
                maxPrice,
                marketType,
                image,
                isPopular: isPopular || false,
                isActive: true,
                sortOrder: sortOrder || 0,
                createdBy: '00000000-0000-0000-0000-000000000000', // System creator ID
                tags: tags || [],
            },
            items || [],
        );

        res.status(201).json({
            status: 'success',
            message: 'Suggested shopping list created successfully',
            data: suggestedList,
        });
    }

    /**
     * Get all suggested lists with admin features
     */
    static async getAllSuggestedLists(req: AdminAuthenticatedRequest, res: Response) {
        // Admin authentication is handled by middleware

        const { page = 1, size = 20, category, active, popular, search } = req.query;

        const whereClause: any = {
            listType: 'suggested',
        };

        if (category) {
            whereClause.category = category;
        }

        if (active !== undefined) {
            whereClause.isActive = active === 'true';
        }

        if (popular !== undefined) {
            whereClause.isPopular = popular === 'true';
        }

        if (search) {
            whereClause[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { notes: { [Op.iLike]: `%${search}%` } },
                { category: { [Op.iLike]: `%${search}%` } },
            ];
        }

        const offset = (Number(page) - 1) * Number(size);

        const { rows: lists, count } = await ShoppingList.findAndCountAll({
            where: whereClause,
            include: [
                {
                    model: ShoppingListItem,
                    as: 'items',
                },
                {
                    model: Market,
                    as: 'market',
                    attributes: ['id', 'name', 'location'],
                },
                {
                    model: User,
                    as: 'creator',
                    attributes: ['id', 'name', 'email'],
                },
            ],
            order: [
                ['sortOrder', 'ASC'],
                ['isPopular', 'DESC'],
                ['createdAt', 'DESC'],
            ],
            limit: Number(size),
            offset,
        });

        res.status(200).json({
            status: 'success',
            message: 'Suggested lists retrieved successfully',
            data: {
                lists,
                pagination: {
                    currentPage: Number(page),
                    totalPages: Math.ceil(count / Number(size)),
                    totalItems: count,
                    itemsPerPage: Number(size),
                },
                summary: {
                    totalSuggestedLists: count,
                    activeLists: lists.filter(l => l.isActive).length,
                    popularLists: lists.filter(l => l.isPopular).length,
                    categories: [...new Set(lists.map(l => l.category).filter(Boolean))],
                },
            },
        });
    }

    /**
     * Get a specific suggested list by ID
     */
    static async getSuggestedList(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;

        const list = await ShoppingList.findOne({
            where: { id, listType: 'suggested' },
            include: [
                {
                    model: ShoppingListItem,
                    as: 'items',
                },
                {
                    model: Market,
                    as: 'market',
                    attributes: ['id', 'name', 'location', 'marketType'],
                },
                {
                    model: User,
                    as: 'creator',
                    attributes: ['id', 'name', 'email'],
                },
            ],
        });

        if (!list) {
            throw new NotFoundError('Suggested list not found');
        }

        res.status(200).json({
            status: 'success',
            message: 'Suggested list retrieved successfully',
            data: list,
        });
    }

    /**
     * Update a suggested list (Admin only)
     */
    static async updateSuggestedList(req: AdminAuthenticatedRequest, res: Response) {
        // Admin authentication is handled by middleware

        const { id } = req.params;
        const {
            name,
            notes,
            category,
            tags,
            estimatedTime,
            estimatedCost,
            minPrice,
            maxPrice,
            marketType,
            image,
            isPopular,
            isActive,
            sortOrder,
            marketId,
        } = req.body;

        const list = await ShoppingList.findOne({
            where: { id, listType: 'suggested' },
        });

        if (!list) {
            throw new NotFoundError('Suggested list not found');
        }

        // Prepare update data
        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (notes !== undefined) updateData.notes = notes;
        if (category !== undefined) updateData.category = category;
        if (tags !== undefined) updateData.tags = tags;
        if (estimatedTime !== undefined) updateData.estimatedTime = estimatedTime;
        if (estimatedCost !== undefined) updateData.estimatedCost = estimatedCost;
        if (minPrice !== undefined) updateData.minPrice = minPrice;
        if (maxPrice !== undefined) updateData.maxPrice = maxPrice;
        if (marketType !== undefined) updateData.marketType = marketType;
        if (image !== undefined) updateData.image = image;
        if (isPopular !== undefined) updateData.isPopular = isPopular;
        if (isActive !== undefined) updateData.isActive = isActive;
        if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
        if (marketId !== undefined) updateData.marketId = marketId;

        await list.update(updateData);

        // Reload with associations
        const updatedList = await ShoppingList.findOne({
            where: { id },
            include: [
                {
                    model: ShoppingListItem,
                    as: 'items',
                },
                {
                    model: Market,
                    as: 'market',
                    attributes: ['id', 'name', 'location'],
                },
            ],
        });

        res.status(200).json({
            status: 'success',
            message: 'Suggested list updated successfully',
            data: updatedList,
        });
    }

    /**
     * Delete a suggested list (Admin only)
     */
    static async deleteSuggestedList(req: AdminAuthenticatedRequest, res: Response) {
        // Admin authentication is handled by middleware

        const { id } = req.params;

        const list = await ShoppingList.findOne({
            where: { id, listType: 'suggested' },
        });

        if (!list) {
            throw new NotFoundError('Suggested list not found');
        }

        await list.destroy();

        res.status(200).json({
            status: 'success',
            message: 'Suggested list deleted successfully',
            data: null,
        });
    }

    /**
     * Bulk operations for suggested lists
     */
    static async bulkUpdateSuggestedLists(req: AdminAuthenticatedRequest, res: Response) {
        // Admin authentication is handled by middleware

        const { action, listIds, updateData } = req.body;

        if (!action || !listIds || !Array.isArray(listIds)) {
            throw new BadRequestError('Action and list IDs are required');
        }

        let result;

        switch (action) {
            case 'activate':
                result = await ShoppingList.update(
                    { isActive: true },
                    { where: { id: { [Op.in]: listIds }, listType: 'suggested' } }
                );
                break;

            case 'deactivate':
                result = await ShoppingList.update(
                    { isActive: false },
                    { where: { id: { [Op.in]: listIds }, listType: 'suggested' } }
                );
                break;

            case 'make_popular':
                result = await ShoppingList.update(
                    { isPopular: true },
                    { where: { id: { [Op.in]: listIds }, listType: 'suggested' } }
                );
                break;

            case 'remove_popular':
                result = await ShoppingList.update(
                    { isPopular: false },
                    { where: { id: { [Op.in]: listIds }, listType: 'suggested' } }
                );
                break;

            case 'update':
                if (!updateData) {
                    throw new BadRequestError('Update data is required for update action');
                }
                result = await ShoppingList.update(
                    updateData,
                    { where: { id: { [Op.in]: listIds }, listType: 'suggested' } }
                );
                break;

            case 'delete':
                result = await ShoppingList.destroy({
                    where: { id: { [Op.in]: listIds }, listType: 'suggested' }
                });
                break;

            default:
                throw new BadRequestError('Invalid action. Use: activate, deactivate, make_popular, remove_popular, update, delete');
        }

        res.status(200).json({
            status: 'success',
            message: `Bulk ${action} operation completed successfully`,
            data: {
                affectedRows: Array.isArray(result) ? result[0] : result, // result[0] for update operations, result for delete
                action,
                listIds,
            },
        });
    }

    /**
     * Get suggested lists analytics
     */
    static async getSuggestedListsAnalytics(req: AdminAuthenticatedRequest, res: Response) {
        // Admin authentication is handled by middleware

        const totalSuggested = await ShoppingList.count({
            where: { listType: 'suggested' }
        });

        const activeSuggested = await ShoppingList.count({
            where: { listType: 'suggested', isActive: true }
        });

        const popularSuggested = await ShoppingList.count({
            where: { listType: 'suggested', isPopular: true }
        });

        const categoryCounts = await ShoppingList.findAll({
            where: { listType: 'suggested', isActive: true },
            attributes: ['category', [ShoppingList.sequelize!.fn('COUNT', ShoppingList.sequelize!.col('id')), 'count']],
            group: ['category'],
            raw: true,
        });

        const creatorTypeCounts = await ShoppingList.findAll({
            where: { listType: 'suggested' },
            attributes: ['creatorType', [ShoppingList.sequelize!.fn('COUNT', ShoppingList.sequelize!.col('id')), 'count']],
            group: ['creatorType'],
            raw: true,
        });

        // Get recent activity (lists created in last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const recentActivity = await ShoppingList.count({
            where: {
                listType: 'suggested',
                createdAt: {
                    [Op.gte]: thirtyDaysAgo,
                },
            },
        });

        res.status(200).json({
            status: 'success',
            message: 'Suggested lists analytics retrieved successfully',
            data: {
                overview: {
                    totalSuggestedLists: totalSuggested,
                    activeLists: activeSuggested,
                    popularLists: popularSuggested,
                    inactiveLists: totalSuggested - activeSuggested,
                },
                categoryDistribution: categoryCounts,
                creatorDistribution: creatorTypeCounts,
                activity: {
                    listsCreatedLast30Days: recentActivity,
                    growthRate: totalSuggested > 0 ? ((recentActivity / totalSuggested) * 100).toFixed(2) : '0',
                },
                recommendations: this.generateAnalyticsRecommendations({
                    totalSuggested,
                    activeSuggested,
                    popularSuggested,
                    recentActivity,
                }),
            },
        });
    }

    /**
     * Copy user list to suggested list (Admin only)
     */
    static async convertToSuggestedList(req: AdminAuthenticatedRequest, res: Response) {
        // Admin authentication is handled by middleware

        const { id } = req.params;
        const {
            category,
            tags,
            estimatedTime,
            estimatedCost,
            marketType,
            image,
            isPopular,
        } = req.body;

        const originalList = await ShoppingList.findOne({
            where: { id, listType: 'personal' },
            include: [{ model: ShoppingListItem, as: 'items' }],
        });

        if (!originalList) {
            throw new NotFoundError('Original list not found or is not a personal list');
        }

        // Create new suggested list based on the original
        const suggestedList = await ShoppingListService.createShoppingList(
            {
                name: `${originalList.name} (Suggested)`,
                notes: `Converted from user list: ${originalList.notes || ''}`,
                customerId: '00000000-0000-0000-0000-000000000000', // System user ID
                marketId: originalList.marketId,
                status: 'draft',
                creatorType: 'admin',
                listType: 'suggested',
                category,
                estimatedTime,
                estimatedCost,
                marketType,
                image,
                isPopular: isPopular || false,
                isActive: true,
                sortOrder: 0,
                createdBy: '00000000-0000-0000-0000-000000000000', // System creator ID
                tags: tags || [],
            },
            originalList.items?.map(item => ({
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                notes: item.notes,
                estimatedPrice: item.estimatedPrice,
                productId: item.productId,
            })) || [],
        );

        res.status(201).json({
            status: 'success',
            message: 'List converted to suggested list successfully',
            data: {
                originalList: {
                    id: originalList.id,
                    name: originalList.name,
                },
                suggestedList,
            },
        });
    }

    /**
     * Generate analytics recommendations
     */
    private static generateAnalyticsRecommendations(data: any): string[] {
        const recommendations: string[] = [];

        if (data.activeSuggested < data.totalSuggested * 0.8) {
            recommendations.push('Consider reviewing and activating more suggested lists');
        }

        if (data.popularSuggested < 3) {
            recommendations.push('Mark more high-performing lists as popular to increase visibility');
        }

        if (data.recentActivity < 2) {
            recommendations.push('Create more suggested lists to keep content fresh');
        }

        if (data.totalSuggested < 10) {
            recommendations.push('Build a larger catalog of suggested lists for better user experience');
        }

        return recommendations;
    }
} 