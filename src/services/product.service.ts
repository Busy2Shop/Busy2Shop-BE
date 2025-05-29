import { FindAndCountOptions, Op, literal, fn, col } from 'sequelize';
import Product, { IProduct } from '../models/product.model';
import Market from '../models/market.model';
import Category from '../models/category.model';
import ShoppingListItem from '../models/shoppingListItem.model';
import ShoppingList from '../models/shoppingList.model';
import Review from '../models/review.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/customErrors';
import Pagination, { IPaging } from '../utils/pagination';

export interface IViewProductsQuery {
    page?: number;
    size?: number;
    q?: string; // Search query
    marketId?: string;
    categoryId?: string;
    minPrice?: number;
    maxPrice?: number;
    isAvailable?: boolean;
    isPinned?: boolean;
    sortBy?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'featured_first' | 'rating' | 'popularity';
}

interface ProductPerformance {
    productId: string;
    totalOrders: number;
    totalRevenue: number;
    averageRating: number;
    reviewCount: number;
    conversionRate: number;
    trendDirection: 'up' | 'down' | 'stable';
    recommendations: string[];
}

interface SmartRecommendation {
    category: string;
    suggestedProducts: string[];
    reason: string;
    potentialRevenue: number;
    confidence: number;
}

interface FeaturedAnalytics {
    totalProducts: number;
    featuredProducts: number;
    featuredPercentage: number;
    featuredPerformance: {
        avgOrders: number;
        avgRevenue: number;
        avgRating: number;
    };
    nonFeaturedPerformance: {
        avgOrders: number;
        avgRevenue: number;
        avgRating: number;
    };
    impactMetrics: {
        orderLift: number;
        revenueLift: number;
        ratingLift: number;
    };
    recommendations: string[];
}

export default class ProductService {
    static async addProduct(productData: IProduct): Promise<Product> {
        // Validate required fields
        if (!productData.name || !productData.price || !productData.marketId) {
            throw new BadRequestError('Product name, price, and market ID are required');
        }

        // Check if the market exists
        const market = await Market.findByPk(productData.marketId);
        if (!market) {
            throw new NotFoundError('Market not found');
        }

        // If this is a market type that explicitly shouldn't have products
        if (market.marketType === 'local_market') {
            throw new BadRequestError('This type of market cannot have products');
        }

        return await Product.create({ ...productData });
    }

    static async viewProducts(
        queryData?: IViewProductsQuery,
    ): Promise<{ products: Product[]; count: number; totalPages?: number }> {
        const {
            page,
            size,
            q: query,
            marketId,
            categoryId,
            minPrice,
            maxPrice,
            isAvailable,
            isPinned,
            sortBy = 'relevance',
        } = queryData || {};

        const where: Record<string | symbol, unknown> = {};

        // Handle search query with relevance scoring
        if (query) {
            where[Op.or] = [
                { name: { [Op.iLike]: `%${query}%` } },
                { description: { [Op.iLike]: `%${query}%` } },
                { barcode: { [Op.iLike]: `%${query}%` } },
            ];
        }

        // Filter by market
        if (marketId) {
            where.marketId = marketId;
        }

        // Filter by price range
        if (minPrice !== undefined || maxPrice !== undefined) {
            where.price = {} as { [key: symbol]: number };

            if (minPrice !== undefined) {
                (where.price as { [key: symbol]: number })[Op.gte] = minPrice;
            }

            if (maxPrice !== undefined) {
                (where.price as { [key: symbol]: number })[Op.lte] = maxPrice;
            }
        }

        // Filter by availability
        if (isAvailable !== undefined) {
            where.isAvailable = isAvailable;
        }

        // Filter by pinned status
        if (isPinned !== undefined) {
            where.isPinned = isPinned;
        }

        // Build order clause based on sortBy parameter
        const getOrderClause = () => {
            switch (sortBy) {
                case 'price_asc':
                    return [['price', 'ASC']];
                case 'price_desc':
                    return [['price', 'DESC']];
                case 'newest':
                    return [['createdAt', 'DESC']];
                case 'featured_first':
                    return [['isPinned', 'DESC'], ['createdAt', 'DESC']];
                case 'rating':
                    return [[literal('avg_rating'), 'DESC NULLS LAST']];
                case 'popularity':
                    return [[literal('order_count'), 'DESC NULLS LAST']];
                case 'relevance':
                default:
                    if (query) {
                        return [
                            [literal(`
                                CASE 
                                    WHEN LOWER(name) = LOWER('${query}') THEN 100
                                    WHEN LOWER(name) LIKE LOWER('${query}%') THEN 80
                                    WHEN LOWER(name) LIKE LOWER('%${query}%') THEN 60
                                    WHEN LOWER(description) LIKE LOWER('%${query}%') THEN 40
                                    ELSE 20
                                END
                            `), 'DESC'],
                            ['isPinned', 'DESC'],
                            ['createdAt', 'DESC'],
                        ];
                    }
                    return [['isPinned', 'DESC'], ['createdAt', 'DESC']];
            }
        };

        // Build include array
        const includes: any[] = [
            {
                model: Market,
                as: 'market',
                attributes: ['id', 'name', 'marketType', 'address', 'images', 'isPinned'],
                where: {
                    isActive: true,
                },
                ...(categoryId && {
                    include: [{
                        model: Category,
                        as: 'categories',
                        where: { id: categoryId },
                        through: { attributes: [] },
                        required: true,
                    }],
                }),
            },
        ];

        // Add reviews for rating calculation
        if (sortBy === 'rating') {
            includes.push({
                model: Review,
                as: 'reviews',
                attributes: [],
                required: false,
            });
        }

        // Basic query options
        const queryOptions: FindAndCountOptions<Product> = {
            where,
            include: includes,
            attributes: {
                include: [
                    // Add calculated fields for sorting
                    ...(sortBy === 'rating' ? [[
                        fn('AVG', col('reviews.rating')),
                        'avg_rating',
                    ]] : []),
                    ...(sortBy === 'popularity' ? [[
                        literal(`(
                            SELECT COUNT(*)
                            FROM "shoppingListItems" sli
                            INNER JOIN "shoppingLists" sl ON sli."shoppingListId" = sl.id
                            WHERE sli."productId" = "Product".id 
                            AND sl.status IN ('completed', 'processing')
                            AND sl."createdAt" >= NOW() - INTERVAL '30 days'
                        )`),
                        'order_count',
                    ]] : []),
                ],
            },
            ...(sortBy === 'rating' && {
                group: ['Product.id', 'market.id'],
                having: fn('COUNT', col('reviews.id')),
            }),
            order: getOrderClause() as any,
        };

        // Handle pagination
        if (page && size && page > 0 && size > 0) {
            const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);
            queryOptions.limit = limit ?? 0;
            queryOptions.offset = offset ?? 0;
        }

        const { rows: products, count } = await Product.findAndCountAll(queryOptions);

        // Calculate pagination metadata if applicable
        if (page && size && products.length > 0) {
            const totalPages = Pagination.estimateTotalPage({ count, limit: size } as IPaging);
            return { products, count, ...totalPages };
        } else {
            return { products, count };
        }
    }

    static async viewMarketProducts(
        marketId: string,
        queryData?: IViewProductsQuery,
    ): Promise<{ products: Product[]; count: number; totalPages?: number }> {
        // Check if the market exists
        const market = await Market.findByPk(marketId);
        if (!market) {
            throw new NotFoundError('Market not found');
        }

        // Add marketId to the query
        const marketQuery = {
            ...queryData,
            marketId,
        };

        return await this.viewProducts(marketQuery);
    }

    static async getProduct(id: string): Promise<Product> {
        const product = await Product.findByPk(id, {
            include: [
                {
                    model: Market,
                    as: 'market',
                    attributes: ['id', 'name', 'marketType', 'address', 'images', 'isPinned'],
                },
                {
                    model: Review,
                    as: 'reviews',
                    attributes: ['id', 'rating', 'comment', 'createdAt'],
                    include: [{
                        model: 'User',
                        as: 'reviewer',
                        attributes: ['id', 'firstName', 'lastName'],
                    }],
                    separate: true,
                    order: [['createdAt', 'DESC']],
                    limit: 10,
                },
            ],
            attributes: {
                include: [
                    // Add average rating
                    [
                        literal(`(
                            SELECT AVG(rating)::DECIMAL(3,2)
                            FROM reviews 
                            WHERE "productId" = "Product".id
                        )`),
                        'averageRating',
                    ],
                    // Add review count
                    [
                        literal(`(
                            SELECT COUNT(*)
                            FROM reviews 
                            WHERE "productId" = "Product".id
                        )`),
                        'reviewCount',
                    ],
                    // Add order count (last 30 days)
                    [
                        literal(`(
                            SELECT COUNT(*)
                            FROM "shoppingListItems" sli
                            INNER JOIN "shoppingLists" sl ON sli."shoppingListId" = sl.id
                            WHERE sli."productId" = "Product".id 
                            AND sl.status IN ('completed', 'processing')
                            AND sl."createdAt" >= NOW() - INTERVAL '30 days'
                        )`),
                        'recentOrders',
                    ],
                ],
            },
        });

        if (!product) {
            throw new NotFoundError('Product not found');
        }

        return product;
    }

    static async updateProduct(
        id: string,
        ownerId: string,
        dataToUpdate: Partial<IProduct>,
    ): Promise<Product> {
        const product = await this.getProduct(id);

        // Check if the market belongs to this owner (unless it's an admin updating pin status)
        const market = await Market.findByPk(product.marketId);
        if (!market || (market.ownerId !== ownerId && !dataToUpdate.hasOwnProperty('isPinned'))) {
            throw new ForbiddenError('You are not authorized to update this product');
        }

        // Cannot change the market ID
        if (dataToUpdate.marketId && dataToUpdate.marketId !== product.marketId) {
            throw new BadRequestError('Cannot change the market for an existing product');
        }

        await product.update(dataToUpdate);

        return await this.getProduct(id);
    }

    static async deleteProduct(id: string, ownerId: string): Promise<void> {
        const product = await this.getProduct(id);

        // Check if the market belongs to this owner
        const market = await Market.findByPk(product.marketId);
        if (!market || market.ownerId !== ownerId) {
            throw new ForbiddenError('You are not authorized to delete this product');
        }

        await product.destroy();
    }

    static async toggleProductAvailability(id: string, ownerId: string): Promise<Product> {
        const product = await this.getProduct(id);

        // Check if the market belongs to this owner
        const market = await Market.findByPk(product.marketId);
        if (!market || market.ownerId !== ownerId) {
            throw new ForbiddenError('You are not authorized to update this product');
        }

        await product.update({ isAvailable: !product.isAvailable });

        return await this.getProduct(id);
    }

    /**
     * Toggle product pin status (Admin functionality)
     */
    static async toggleProductPin(id: string): Promise<Product> {
        const product = await this.getProduct(id);
        await product.update({ isPinned: !product.isPinned });
        return await this.getProduct(id);
    }

    /**
     * Bulk update product pin status (Admin functionality)
     */
    static async bulkUpdateProductPin(productIds: string[], isPinned: boolean): Promise<Product[]> {
        await Product.update(
            { isPinned },
            { where: { id: { [Op.in]: productIds } } }
        );

        return await Product.findAll({
            where: { id: { [Op.in]: productIds } },
            include: [
                {
                    model: Market,
                    as: 'market',
                    attributes: ['id', 'name', 'marketType'],
                },
            ],
        });
    }

    /**
     * Get featured products analytics
     */
    static async getFeaturedProductsAnalytics(): Promise<FeaturedAnalytics> {
        const [
            totalProducts,
            featuredProducts,
            featuredStats,
            nonFeaturedStats,
        ] = await Promise.all([
            Product.count({ where: { isAvailable: true } }),
            Product.count({ where: { isAvailable: true, isPinned: true } }),

            // Featured products performance
            Product.findAll({
                where: { isAvailable: true, isPinned: true },
                attributes: [
                    [fn('AVG', literal(`(
                        SELECT COUNT(*)
                        FROM "shoppingListItems" sli
                        INNER JOIN "shoppingLists" sl ON sli."shoppingListId" = sl.id
                        WHERE sli."productId" = "Product".id 
                        AND sl.status IN ('completed', 'processing')
                        AND sl."createdAt" >= NOW() - INTERVAL '30 days'
                    )`)), 'avgOrders'],
                    [fn('AVG', col('price')), 'avgPrice'],
                    [fn('AVG', literal(`(
                        SELECT AVG(rating)
                        FROM reviews 
                        WHERE "productId" = "Product".id
                    )`)), 'avgRating'],
                ],
                raw: true,
            }),

            // Non-featured products performance
            Product.findAll({
                where: { isAvailable: true, isPinned: false },
                attributes: [
                    [fn('AVG', literal(`(
                        SELECT COUNT(*)
                        FROM "shoppingListItems" sli
                        INNER JOIN "shoppingLists" sl ON sli."shoppingListId" = sl.id
                        WHERE sli."productId" = "Product".id 
                        AND sl.status IN ('completed', 'processing')
                        AND sl."createdAt" >= NOW() - INTERVAL '30 days'
                    )`)), 'avgOrders'],
                    [fn('AVG', col('price')), 'avgPrice'],
                    [fn('AVG', literal(`(
                        SELECT AVG(rating)
                        FROM reviews 
                        WHERE "productId" = "Product".id
                    )`)), 'avgRating'],
                ],
                raw: true,
            }),
        ]);

        const featuredPerf = featuredStats[0] as any;
        const nonFeaturedPerf = nonFeaturedStats[0] as any;

        const featuredPerformance = {
            avgOrders: parseFloat(featuredPerf?.avgOrders || '0'),
            avgRevenue: parseFloat(featuredPerf?.avgOrders || '0') * parseFloat(featuredPerf?.avgPrice || '0'),
            avgRating: parseFloat(featuredPerf?.avgRating || '0'),
        };

        const nonFeaturedPerformance = {
            avgOrders: parseFloat(nonFeaturedPerf?.avgOrders || '0'),
            avgRevenue: parseFloat(nonFeaturedPerf?.avgOrders || '0') * parseFloat(nonFeaturedPerf?.avgPrice || '0'),
            avgRating: parseFloat(nonFeaturedPerf?.avgRating || '0'),
        };

        const impactMetrics = {
            orderLift: nonFeaturedPerformance.avgOrders > 0 ?
                ((featuredPerformance.avgOrders - nonFeaturedPerformance.avgOrders) / nonFeaturedPerformance.avgOrders * 100) : 0,
            revenueLift: nonFeaturedPerformance.avgRevenue > 0 ?
                ((featuredPerformance.avgRevenue - nonFeaturedPerformance.avgRevenue) / nonFeaturedPerformance.avgRevenue * 100) : 0,
            ratingLift: nonFeaturedPerformance.avgRating > 0 ?
                ((featuredPerformance.avgRating - nonFeaturedPerformance.avgRating) / nonFeaturedPerformance.avgRating * 100) : 0,
        };

        const recommendations = [];
        if (featuredProducts / totalProducts < 0.1) {
            recommendations.push('Consider featuring more high-performing products to boost overall sales');
        }
        if (impactMetrics.orderLift > 50) {
            recommendations.push('Featured products show strong performance - consider expanding the program');
        }
        if (impactMetrics.ratingLift < 0) {
            recommendations.push('Review featured product selection - featured items have lower ratings than average');
        }

        return {
            totalProducts,
            featuredProducts,
            featuredPercentage: totalProducts > 0 ? (featuredProducts / totalProducts * 100) : 0,
            featuredPerformance,
            nonFeaturedPerformance,
            impactMetrics,
            recommendations,
        };
    }

    /**
     * Get product performance metrics
     */
    static async getProductPerformance(productId: string, ownerId: string, timeframe: string): Promise<ProductPerformance> {
        const product = await this.getProduct(productId);

        // Verify ownership
        const market = await Market.findByPk(product.marketId);
        if (!market || market.ownerId !== ownerId) {
            throw new ForbiddenError('You are not authorized to view this product\'s performance');
        }

        const days = timeframe === '7d' ? 7 : timeframe === '90d' ? 90 : 30;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const [orderStats, reviewStats] = await Promise.all([
            ShoppingListItem.findAll({
                attributes: [
                    [fn('COUNT', col('id')), 'totalOrders'],
                    [fn('SUM', literal('quantity * COALESCE("actualPrice", "estimatedPrice", 0)')), 'totalRevenue'],
                ],
                include: [{
                    model: ShoppingList,
                    as: 'shoppingList',
                    where: {
                        createdAt: { [Op.gte]: startDate },
                        status: { [Op.in]: ['completed', 'processing'] },
                    },
                    attributes: [],
                }],
                where: { productId },
                raw: true,
            }),

            Review.findAll({
                attributes: [
                    [fn('AVG', col('rating')), 'averageRating'],
                    [fn('COUNT', col('id')), 'reviewCount'],
                ],
                where: { productId },
                raw: true,
            }),
        ]);

        const orderData = orderStats[0] as any;
        const reviewData = reviewStats[0] as any;

        const totalOrders = parseInt(orderData?.totalOrders || '0');
        const totalRevenue = parseFloat(orderData?.totalRevenue || '0');
        const averageRating = parseFloat(reviewData?.averageRating || '0');
        const reviewCount = parseInt(reviewData?.reviewCount || '0');

        // Calculate trend (simplified)
        const trendDirection: 'up' | 'down' | 'stable' =
            totalOrders > 10 ? 'up' : totalOrders < 3 ? 'down' : 'stable';

        const recommendations = [];
        if (averageRating < 3.5 && reviewCount > 5) {
            recommendations.push('Consider reviewing product quality - ratings are below average');
        }
        if (totalOrders < 5) {
            recommendations.push('Low order volume - consider promotional pricing or better product visibility');
        }
        if (!product.isPinned && totalOrders > 20) {
            recommendations.push('High-performing product - consider featuring it for increased visibility');
        }

        return {
            productId,
            totalOrders,
            totalRevenue,
            averageRating,
            reviewCount,
            conversionRate: 0, // Would need view data to calculate
            trendDirection,
            recommendations,
        };
    }

    /**
     * Get smart product recommendations for market owners
     */
    static async getSmartProductRecommendations(marketId: string, limit: number = 10): Promise<SmartRecommendation[]> {
        // Analyze market's current product categories
        const currentProducts = await Product.findAll({
            where: { marketId, isAvailable: true },
            attributes: ['id', 'name', 'price'],
            raw: true,
        });

        // Analyze what products are popular in similar markets
        const market = await Market.findByPk(marketId, {
            include: [{
                model: Category,
                as: 'categories',
                through: { attributes: [] },
            }],
        });

        if (!market) {
            throw new NotFoundError('Market not found');
        }

        const categoryIds = market.categories?.map(cat => cat.id) || [];

        // Find trending products in similar categories
        const trendingProducts = await ShoppingListItem.findAll({
            attributes: [
                'name',
                [fn('COUNT', col('ShoppingListItem.id')), 'orderCount'],
                [fn('AVG', col('estimatedPrice')), 'avgPrice'],
            ],
            include: [{
                model: ShoppingList,
                as: 'shoppingList',
                where: {
                    createdAt: { [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
                    status: { [Op.in]: ['completed', 'processing'] },
                },
                include: [{
                    model: Market,
                    as: 'market',
                    where: { id: { [Op.ne]: marketId } },
                    include: [{
                        model: Category,
                        as: 'categories',
                        where: categoryIds.length > 0 ? { id: { [Op.in]: categoryIds } } : {},
                        through: { attributes: [] },
                        required: categoryIds.length > 0,
                    }],
                }],
            }],
            where: {
                name: { [Op.notIn]: currentProducts.map(p => p.name) },
            },
            group: ['name'],
            having: literal('COUNT(*) >= 5'),
            order: [[literal('orderCount'), 'DESC']],
            limit: limit * 2,
            raw: true,
        });

        // Generate recommendations
        const recommendations: SmartRecommendation[] = [];

        for (const trending of trendingProducts.slice(0, limit)) {
            const trendingData = trending as any;
            recommendations.push({
                category: 'trending',
                suggestedProducts: [trendingData.name],
                reason: `This product has ${trendingData.orderCount} orders in similar markets`,
                potentialRevenue: parseFloat(trendingData.avgPrice) * 10, // Estimated monthly revenue
                confidence: Math.min(parseInt(trendingData.orderCount) * 10, 100),
            });
        }

        return recommendations;
    }

    static async bulkAddProducts(products: IProduct[], ownerId: string): Promise<Product[]> {
        // Validate that all products belong to markets owned by this user
        const marketIds = [...new Set(products.map(p => p.marketId))];

        const ownedMarkets = await Market.count({
            where: {
                id: { [Op.in]: marketIds },
                ownerId,
            },
        });

        if (ownedMarkets !== marketIds.length) {
            throw new ForbiddenError(
                'You do not have permission to add products to all the specified markets',
            );
        }

        // Ensure all marketType can have catalog products.
        const marketTypes = await Market.findAll({
            attributes: ['id', 'marketType'],
            where: {
                id: { [Op.in]: marketIds },
            },
        });

        const localMarkets = marketTypes.filter(m => m.marketType === 'local_market');
        if (localMarkets.length > 0) {
            throw new BadRequestError('This type of market(local_market) cannot have products');
        }

        // Create all products
        const createdProducts = await Product.bulkCreate(products);

        // Return all created products with their markets
        return await Product.findAll({
            where: {
                id: { [Op.in]: createdProducts.map(p => p.id) },
            },
            include: [
                {
                    model: Market,
                    as: 'market',
                    attributes: ['id', 'name', 'marketType', 'address'],
                },
            ],
        });
    }
}