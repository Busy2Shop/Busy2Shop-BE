import { Op, literal, QueryTypes } from 'sequelize';
import Product from '../models/product.model';
import Market from '../models/market.model';
import Category from '../models/category.model';
import User from '../models/user.model';
import Order from '../models/order.model';
import ShoppingList from '../models/shoppingList.model';
import ShoppingListItem from '../models/shoppingListItem.model';
import Review from '../models/review.model';
import { BadRequestError } from '../utils/customErrors';
import { logger } from '../utils/logger';

export interface SearchResults {
    products?: Product[];
    markets?: Market[];
    categories?: Category[];
}

export interface Banner {
    id: string;
    title: string;
    description?: string;
    imageUrl: string;
    actionUrl?: string;
    isActive: boolean;
    displayOrder: number;
    createdAt: Date;
}

export interface ContentScore {
    id: string;
    score: number;
    reasons: string[];
}

export interface LocationContext {
    latitude?: number;
    longitude?: number;
    maxDistance?: number;
}

export interface UserContext {
    userId?: string;
    preferences?: string[];
    orderHistory?: string[];
}

export interface ContentFilters {
    priceRange?: { min: number; max: number };
    categories?: string[];
    marketTypes?: string[];
    includeOutOfStock?: boolean;
}

export class HomeService {
    /**
     * Calculate content score based on multiple factors
     * This is the core algorithm that determines content relevance
     */
    private calculateContentScore(item: any, context: {
        userContext?: UserContext;
        locationContext?: LocationContext;
        timeContext?: Date;
    }): ContentScore {
        let score = 0;
        const reasons: string[] = [];

        // Base score factors
        if (item.isPinned) {
            score += 50;
            reasons.push('Featured content');
        }

        // Recency factor (newer content gets higher score)
        const daysSinceCreation = Math.floor(
            (new Date().getTime() - new Date(item.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceCreation <= 7) {
            score += 20;
            reasons.push('Recently added');
        } else if (daysSinceCreation <= 30) {
            score += 10;
            reasons.push('Recent');
        }

        // Rating/Review factor (for products and markets)
        if (item.reviews && item.reviews.length > 0) {
            const avgRating = item.reviews.reduce((sum: number, review: any) => sum + review.rating, 0) / item.reviews.length;
            const reviewCount = item.reviews.length;

            score += Math.min(avgRating * 5, 25); // Max 25 points for rating

            if (reviewCount >= 10) {
                score += 15;
                reasons.push('Well-reviewed');
            } else if (reviewCount >= 5) {
                score += 10;
                reasons.push('Good reviews');
            }
        }

        // Popularity factor (based on order frequency)
        if (item.orderCount) {
            score += Math.min(item.orderCount * 2, 30);
            if (item.orderCount >= 10) {
                reasons.push('Popular choice');
            }
        }

        // Availability factor
        if (item.isAvailable !== false && item.isActive !== false) {
            score += 10;
        } else {
            score -= 20; // Penalty for unavailable items
        }

        // User context factors
        if (context.userContext) {
            // User's previous shopping history
            if (context.userContext.orderHistory?.includes(item.id) ||
                context.userContext.orderHistory?.includes(item.marketId)) {
                score += 25;
                reasons.push('Based on your history');
            }

            // User preferences
            if (context.userContext.preferences) {
                const hasPreferredCategory = context.userContext.preferences.some(pref =>
                    item.categories?.some((cat: any) => cat.name.toLowerCase().includes(pref.toLowerCase()))
                );
                if (hasPreferredCategory) {
                    score += 20;
                    reasons.push('Matches your interests');
                }
            }
        }

        // Location context factors
        if (context.locationContext && item.location) {
            // Distance-based scoring
            if (item.distance !== undefined) {
                if (item.distance <= 2) {
                    score += 25;
                    reasons.push('Very close to you');
                } else if (item.distance <= 5) {
                    score += 15;
                    reasons.push('Nearby');
                } else if (item.distance <= 10) {
                    score += 5;
                    reasons.push('Within area');
                }
            }
        }

        // Time context factors
        if (context.timeContext) {
            const hour = context.timeContext.getHours();

            // Boost food-related content during meal times
            if (item.marketType === 'supermarket' ||
                item.categories?.some((cat: any) =>
                    ['food', 'grocery', 'restaurant'].includes(cat.name.toLowerCase())
                )) {
                if ((hour >= 11 && hour <= 13) || (hour >= 18 && hour <= 20)) {
                    score += 15;
                    reasons.push('Perfect timing');
                }
            }
        }

        // Diversity factor to prevent same-type content domination
        if (Math.random() > 0.8) { // 20% chance for diversity boost
            score += 5;
            reasons.push('Diverse selection');
        }

        return {
            id: item.id,
            score: Math.max(0, score),
            reasons,
        };
    }

    /**
     * Get featured products with advanced scoring algorithm
     */
    async getFeaturedProducts(
        limit: number = 10,
        context?: {
            userContext?: UserContext;
            locationContext?: LocationContext;
            filters?: ContentFilters;
        }
    ): Promise<Product[]> {
        try {
            // Build dynamic query conditions
            const whereConditions: any = {
                isAvailable: true,
            };

            // Apply filters
            if (context?.filters) {
                if (context.filters.priceRange) {
                    whereConditions.price = {
                        [Op.between]: [context.filters.priceRange.min, context.filters.priceRange.max],
                    };
                }

                if (!context.filters.includeOutOfStock) {
                    whereConditions.stockQuantity = {
                        [Op.or]: [
                            { [Op.gt]: 0 },
                            { [Op.is]: null }, // Include products without stock tracking
                        ],
                    };
                }
            }

            // Build attributes configuration properly
            const attributesConfig: any = {
                include: [
                    // Get order frequency for popularity scoring
                    [
                        literal(`(
                        SELECT COUNT(*)
                        FROM "ShoppingListItems" sli
                        INNER JOIN "ShoppingLists" sl ON sli."shoppingListId" = sl.id
                        WHERE sli."productId" = "Product".id 
                        AND sl.status IN ('completed', 'processing')
                        AND sl."createdAt" >= NOW() - INTERVAL '30 days'
                    )`),
                        'orderCount',
                    ],
                ],
            };

            // Add distance calculation if location context provided
            if (context?.locationContext?.latitude && context?.locationContext?.longitude) {
                attributesConfig.include.push([
                    literal(`
                    (6371 * acos(
                        cos(radians(${context.locationContext.latitude})) * 
                        cos(radians(CAST(market.location->>'latitude' AS DECIMAL))) * 
                        cos(radians(CAST(market.location->>'longitude' AS DECIMAL)) - radians(${context.locationContext.longitude})) + 
                        sin(radians(${context.locationContext.latitude})) * 
                        sin(radians(CAST(market.location->>'latitude' AS DECIMAL)))
                    ))
                `),
                    'distance',
                ]);
            }

            // 1. Try pinned and available
            let products = await Product.findAll({
                where: { ...whereConditions, isPinned: true },
                include: [
                    {
                        model: Market,
                        as: 'market',
                        attributes: ['id', 'name', 'address', 'marketType', 'images', 'isPinned', 'location'],
                        where: {
                            isActive: true,
                            ...(context?.filters?.marketTypes && {
                                marketType: { [Op.in]: context.filters.marketTypes },
                            }),
                        },
                        include: [
                            {
                                model: Category,
                                as: 'categories',
                                attributes: ['id', 'name', 'icon'],
                                through: { attributes: [] },
                                where: context?.filters?.categories ?
                                    { id: { [Op.in]: context.filters.categories } } : undefined,
                                required: !!context?.filters?.categories,
                            },
                        ],
                    },
                    {
                        model: Review,
                        as: 'reviews',
                        attributes: ['rating', 'createdAt'],
                        separate: true,
                        limit: 100, // Limit for performance
                    },
                ],
                attributes: attributesConfig,
                limit: limit * 3, // Get more items to score and filter
                order: [
                    ['isPinned', 'DESC'],
                    ['createdAt', 'DESC'],
                ],
            });

            // 2. Fallback: available only
            if (!products || products.length === 0) {
                products = await Product.findAll({
                    where: { ...whereConditions },
                    include: [
                        {
                            model: Market,
                            as: 'market',
                            attributes: ['id', 'name', 'address', 'marketType', 'images', 'isPinned', 'location'],
                            where: {
                                isActive: true,
                                ...(context?.filters?.marketTypes && {
                                    marketType: { [Op.in]: context.filters.marketTypes },
                                }),
                            },
                            include: [
                                {
                                    model: Category,
                                    as: 'categories',
                                    attributes: ['id', 'name', 'icon'],
                                    through: { attributes: [] },
                                    where: context?.filters?.categories ?
                                        { id: { [Op.in]: context.filters.categories } } : undefined,
                                    required: !!context?.filters?.categories,
                                },
                            ],
                        },
                        {
                            model: Review,
                            as: 'reviews',
                            attributes: ['rating', 'createdAt'],
                            separate: true,
                            limit: 100, // Limit for performance
                        },
                    ],
                    attributes: attributesConfig,
                    limit: limit * 3, // Get more items to score and filter
                    order: [
                        ['createdAt', 'DESC'],
                    ],
                });
            }

            // 3. Fallback: any product with filters (remove isAvailable)
            if (!products || products.length === 0) {
                const baseWhere = { ...whereConditions };
                delete baseWhere.isAvailable;
                delete baseWhere.isPinned;
                products = await Product.findAll({
                    where: baseWhere,
                    include: [
                        {
                            model: Market,
                            as: 'market',
                            attributes: ['id', 'name', 'address', 'marketType', 'images', 'isPinned', 'location'],
                            where: {
                                isActive: true,
                                ...(context?.filters?.marketTypes && {
                                    marketType: { [Op.in]: context.filters.marketTypes },
                                }),
                            },
                            include: [
                                {
                                    model: Category,
                                    as: 'categories',
                                    attributes: ['id', 'name', 'icon'],
                                    through: { attributes: [] },
                                    where: context?.filters?.categories ?
                                        { id: { [Op.in]: context.filters.categories } } : undefined,
                                    required: !!context?.filters?.categories,
                                },
                            ],
                        },
                        {
                            model: Review,
                            as: 'reviews',
                            attributes: ['rating', 'createdAt'],
                            separate: true,
                            limit: 100, // Limit for performance
                        },
                    ],
                    attributes: attributesConfig,
                    limit: limit * 3, // Get more items to score and filter
                    order: [
                        ['createdAt', 'DESC'],
                    ],
                });
            }

            // 4. Fallback: any product, no filters
            if (!products || products.length === 0) {
                products = await Product.findAll({
                    include: [
                        {
                            model: Market,
                            as: 'market',
                            attributes: ['id', 'name', 'address', 'marketType', 'images', 'isPinned', 'location'],
                            where: { isActive: true },
                        },
                        {
                            model: Review,
                            as: 'reviews',
                            attributes: ['rating', 'createdAt'],
                            separate: true,
                            limit: 100, // Limit for performance
                        },
                    ],
                    attributes: attributesConfig,
                    limit: limit * 3, // Get more items to score and filter
                    order: [
                        ['createdAt', 'DESC'],
                    ],
                });
            }

            // Score and rank products
            const scoredProducts = products.map(product => {
                const score = this.calculateContentScore(product.get({ plain: true }), {
                    userContext: context?.userContext,
                    locationContext: context?.locationContext,
                    timeContext: new Date(),
                });

                return {
                    product,
                    score: score.score,
                    reasons: score.reasons,
                };
            });

            // Sort by score and return top products
            const rankedProducts = scoredProducts
                .sort((a, b) => b.score - a.score)
                .slice(0, limit)
                .map(item => {
                    // Add score metadata to product for debugging (optional)
                    (item.product as any).scoreDetails = {
                        score: item.score,
                        reasons: item.reasons,
                    };
                    return item.product;
                });

            return rankedProducts;
        } catch (error) {
            logger.error('Error fetching featured products:', error);
            throw new BadRequestError('Failed to fetch featured products');
        }
    }

    /**
     * Get featured markets with advanced scoring
     */
    async getFeaturedMarkets(
        limit: number = 10,
        context?: {
            userContext?: UserContext;
            locationContext?: LocationContext;
            filters?: ContentFilters;
        }
    ): Promise<Market[]> {
        try {
            const whereConditions: any = {
                isActive: true,
            };

            // Apply filters
            if (context?.filters?.marketTypes) {
                whereConditions.marketType = { [Op.in]: context.filters.marketTypes };
            }

            // Build attributes configuration properly
            const attributesConfig: any = {
                include: [
                    // Market popularity based on orders
                    [
                        literal(`(
                        SELECT COUNT(*)
                        FROM "ShoppingLists" sl
                        WHERE sl."marketId" = "Market".id 
                        AND sl.status IN ('completed', 'processing')
                        AND sl."createdAt" >= NOW() - INTERVAL '30 days'
                    )`),
                        'orderCount',
                    ],
                    // Product count in market
                    [
                        literal(`(
                        SELECT COUNT(*)
                        FROM "Products" p
                        WHERE p."marketId" = "Market".id 
                        AND p."isAvailable" = true
                    )`),
                        'productCount',
                    ],
                ],
            };

            // Add distance calculation if location context provided
            if (context?.locationContext?.latitude && context?.locationContext?.longitude) {
                attributesConfig.include.push([
                    literal(`
                    (6371 * acos(
                        cos(radians(${context.locationContext.latitude})) * 
                        cos(radians(CAST(location->>'latitude' AS DECIMAL))) * 
                        cos(radians(CAST(location->>'longitude' AS DECIMAL)) - radians(${context.locationContext.longitude})) + 
                        sin(radians(${context.locationContext.latitude})) * 
                        sin(radians(CAST(location->>'latitude' AS DECIMAL)))
                    ))
                `),
                    'distance',
                ]);
            }

            const markets = await Market.findAll({
                where: whereConditions,
                include: [
                    {
                        model: User,
                        as: 'owner',
                        attributes: ['id', 'firstName', 'lastName', 'email'],
                        required: false,
                    },
                    {
                        model: Category,
                        as: 'categories',
                        attributes: ['id', 'name', 'icon', 'isPinned'],
                        through: { attributes: [] },
                        where: context?.filters?.categories ?
                            { id: { [Op.in]: context.filters.categories } } : undefined,
                        required: false,
                    },
                    {
                        model: Review,
                        as: 'reviews',
                        attributes: ['rating', 'createdAt'],
                        separate: true,
                        limit: 100,
                    },
                ],
                attributes: attributesConfig,
                limit: limit * 3,
                order: [
                    ['isPinned', 'DESC'],
                    ['createdAt', 'DESC'],
                ],
            });

            // Score and rank markets
            const scoredMarkets = markets.map(market => {
                const marketData = market.get({ plain: true });

                // Add category boost for pinned categories
                let categoryBoost = 0;
                if (marketData.categories && Array.isArray(marketData.categories)) {
                    categoryBoost = marketData.categories.filter((cat: any) => cat.isPinned).length * 10;
                }

                const score = this.calculateContentScore(marketData, {
                    userContext: context?.userContext,
                    locationContext: context?.locationContext,
                    timeContext: new Date(),
                });

                return {
                    market,
                    score: score.score + categoryBoost,
                    reasons: [...score.reasons, ...(categoryBoost > 0 ? ['Featured categories'] : [])],
                };
            });

            return scoredMarkets
                .sort((a, b) => b.score - a.score)
                .slice(0, limit)
                .map(item => {
                    (item.market as any).scoreDetails = {
                        score: item.score,
                        reasons: item.reasons,
                    };
                    return item.market;
                });

        } catch (error) {
            logger.error('Error fetching featured markets:', error);
            throw new BadRequestError('Failed to fetch featured markets');
        }
    }

    /**
     * Get featured markets with their top products for supermarket products section
     * 
     * This method ensures consistent data presentation by:
     * 1. Excluding market types that don't have products (e.g., local_market)
     * 2. Guaranteeing exactly the requested number of products per market
     * 3. Padding markets with additional products or duplicates if needed
     * 4. Providing comprehensive scoring and ranking
     * 
     * @param limit - Number of markets to return (default: 6)
     * @param productsPerMarket - Exact number of products per market (default: 6)
     * @param context - Optional context for personalization and filtering
     * @returns Array of markets with exactly the specified number of products each
     */
    async getFeaturedMarketsWithProducts(
        limit: number = 6,
        productsPerMarket: number = 6,
        context?: {
            userContext?: UserContext;
            locationContext?: LocationContext;
            filters?: ContentFilters;
        }
    ): Promise<Market[]> {
        try {
            // Validate parameters
            if (limit <= 0 || limit > 50) {
                throw new BadRequestError('Limit must be between 1 and 50');
            }
            if (productsPerMarket <= 0 || productsPerMarket > 20) {
                throw new BadRequestError('Products per market must be between 1 and 20');
            }

            const whereConditions: any = {
                isActive: true,
                // Exclude market types that shouldn't have products (e.g., local_market)
                marketType: { [Op.ne]: 'local_market' },
            };

            // Apply filters
            if (context?.filters?.marketTypes) {
                // Filter out local_market from user-provided market types
                const validMarketTypes = context.filters.marketTypes.filter(type => type !== 'local_market');
                if (validMarketTypes.length > 0) {
                    whereConditions.marketType = { [Op.in]: validMarketTypes };
                }
            }

            // Get featured markets with their top products
            const markets = await Market.findAll({
                where: whereConditions,
                include: [
                    {
                        model: Product,
                        as: 'products',
                        where: {
                            isAvailable: true,
                        },
                        attributes: [
                            'id', 'name', 'price', 'discountPrice', 'images',
                            'stockQuantity', 'isPinned', 'createdAt',
                        ],
                        include: [
                            {
                                model: Review,
                                as: 'reviews',
                                attributes: ['rating'],
                                required: false,
                            },
                        ],
                        order: [
                            ['isPinned', 'DESC'],
                            ['createdAt', 'DESC'],
                        ],
                        limit: productsPerMarket,
                        required: false, // Changed to false to handle markets with no available products gracefully
                    },
                    {
                        model: Category,
                        as: 'categories',
                        attributes: ['id', 'name', 'icon'],
                        through: { attributes: [] },
                        required: false,
                    },
                ],
                attributes: [
                    'id', 'name', 'address', 'marketType', 'images', 'isPinned',
                    'location', 'isActive', 'createdAt', 'updatedAt',
                ],
                order: [
                    ['isPinned', 'DESC'],
                    ['createdAt', 'DESC'],
                ],
                limit: limit * 3, // Get more markets initially to account for filtering
            });

            // Filter markets to only include those with products
            const marketsWithProducts = markets.filter(market => {
                const marketData = market.get({ plain: true });
                const products = (marketData as any).products || [];
                return Array.isArray(products) && products.length > 0;
            });

            // If no markets have products, return empty array rather than causing an error
            if (marketsWithProducts.length === 0) {
                logger.warn('No markets found with available products', {
                    totalMarketsQueried: markets.length,
                    limit,
                    productsPerMarket,
                });
                return [];
            }

            // Ensure each market has exactly 6 products by padding with additional products if needed
            const marketsWithExactProducts = await Promise.all(marketsWithProducts.map(async (market) => {
                const marketData = market.get({ plain: true });
                let products = (marketData as any).products || [];

                if (products.length < productsPerMarket) {
                    // Get additional products from this market to fill the gap
                    const additionalProducts = await Product.findAll({
                        where: {
                            marketId: market.id,
                            isAvailable: true,
                            id: { [Op.notIn]: products.map((p: any) => p.id) },
                        },
                        include: [
                            {
                                model: Review,
                                as: 'reviews',
                                attributes: ['rating'],
                                required: false,
                            },
                        ],
                        attributes: [
                            'id', 'name', 'price', 'discountPrice', 'images',
                            'stockQuantity', 'isPinned', 'createdAt',
                        ],
                        order: [
                            ['isPinned', 'DESC'],
                            ['createdAt', 'DESC'],
                        ],
                        limit: productsPerMarket - products.length,
                    });

                    // Add the additional products
                    const additionalProductsData = additionalProducts.map(p => p.get({ plain: true }));
                    products = [...products, ...additionalProductsData];

                    // If still not enough products, duplicate existing ones to fill the grid
                    while (products.length < productsPerMarket && products.length > 0) {
                        const remainingSlots = productsPerMarket - products.length;
                        const productsToRepeat = products.slice(0, Math.min(remainingSlots, products.length));

                        // Create duplicates with modified IDs to avoid conflicts
                        const duplicatedProducts = productsToRepeat.map((product: any, index: number) => ({
                            ...product,
                            id: `${product.id}_dup_${Date.now()}_${index}`,
                            name: product.name,
                            isDuplicate: true,
                        }));

                        products = [...products, ...duplicatedProducts];
                    }

                    // Trim to exactly the required number
                    products = products.slice(0, productsPerMarket);

                    // Update the market data with the new products
                    (marketData as any).products = products;

                    logger.info(`Market "${market.name}" padded to ${products.length} products`, {
                        marketId: market.id,
                        originalCount: (marketData as any).products?.length || 0,
                        paddedCount: products.length,
                        targetCount: productsPerMarket,
                    });
                } else {
                    logger.info(`Market "${market.name}" already has sufficient products`, {
                        marketId: market.id,
                        productCount: products.length,
                        targetCount: productsPerMarket,
                    });
                }

                return market;
            }));

            // Score and rank markets with products
            const scoredMarkets = marketsWithExactProducts.map(market => {
                const marketData = market.get({ plain: true });

                const score = this.calculateContentScore(marketData, {
                    userContext: context?.userContext,
                    locationContext: context?.locationContext,
                    timeContext: new Date(),
                });

                // Add product quality boost
                let productQualityBoost = 0;
                const products = (marketData as any).products || [];

                if (Array.isArray(products)) {
                    productQualityBoost = products.reduce((boost: number, product: any) => {
                        let productScore = 0;
                        if (product.isPinned) productScore += 10;
                        if (product.discountPrice && product.discountPrice < product.price) productScore += 5;
                        if (product.reviews && Array.isArray(product.reviews) && product.reviews.length > 0) {
                            const avgRating = product.reviews.reduce((sum: number, review: any) => sum + (review.rating || 0), 0) / product.reviews.length;
                            productScore += avgRating * 2;
                        }
                        return boost + productScore;
                    }, 0);
                }

                // Add boost for having products
                const productCountBoost = Math.min(products.length * 5, 30);

                return {
                    market,
                    score: score.score + productQualityBoost + productCountBoost,
                    reasons: [
                        ...score.reasons,
                        ...(productQualityBoost > 0 ? ['Quality products available'] : []),
                        ...(productCountBoost > 0 ? [`${products.length} products available`] : []),
                    ],
                };
            });

            const finalMarkets = scoredMarkets
                .sort((a, b) => b.score - a.score)
                .slice(0, limit)
                .map(item => {
                    (item.market as any).scoreDetails = {
                        score: item.score,
                        reasons: item.reasons,
                    };
                    return item.market;
                });

            // Log final results
            logger.info('Featured markets with products - Final results', {
                totalMarketsReturned: finalMarkets.length,
                targetLimit: limit,
                productsPerMarket,
                marketBreakdown: finalMarkets.map(market => ({
                    marketId: market.id,
                    marketName: market.name,
                    productCount: (market as any).products?.length || 0,
                })),
            });

            return finalMarkets;

        } catch (error) {
            logger.error('Error fetching featured markets with products:', {
                error: error instanceof Error ? error.message : error,
                stack: error instanceof Error ? error.stack : undefined,
                limit,
                productsPerMarket,
                // whereConditions,
            });
            throw new BadRequestError('Failed to fetch featured markets with products');
        }
    }


    /**
     * Get featured categories with intelligent sorting
     */
    async getFeaturedCategories(
        limit: number = 10,
        context?: {
            userContext?: UserContext;
            locationContext?: LocationContext;
        }
    ): Promise<Category[]> {
        try {
            const categories = await Category.findAll({
                include: [
                    {
                        model: Market,
                        as: 'markets',
                        attributes: ['id', 'marketType', 'isActive'],
                        through: { attributes: [] },
                        where: {
                            isActive: true,
                            ...(context?.locationContext && {
                                location: { [Op.ne]: null },
                            }),
                        },
                        required: false,
                    },
                ],
                attributes: {
                    include: [
                        [
                            literal(`(
                                SELECT COUNT(*)
                                FROM "MarketCategories" mc
                                INNER JOIN "Markets" m ON mc."marketId" = m.id
                                WHERE mc."categoryId" = "Category".id
                                  AND m."isActive" = true
                            )`),
                            'marketCount',
                        ],
                        // Recent activity in category
                        [
                            literal(`(
                                SELECT COUNT(*)
                                FROM "ShoppingListItems" sli
                                INNER JOIN "Products" p ON sli."productId" = p.id
                                INNER JOIN "Markets" m ON p."marketId" = m.id
                                INNER JOIN "MarketCategories" mc ON m.id = mc."marketId"
                                INNER JOIN "ShoppingLists" sl ON sli."shoppingListId" = sl.id
                                WHERE mc."categoryId" = "Category".id
                                AND sl.status IN ('completed', 'processing')
                                AND sl."createdAt" >= NOW() - INTERVAL '7 days'
                            )`),
                            'recentActivity',
                        ],
                    ],
                },
                group: ['Category.id'],
                limit: limit * 2,
                order: [
                    ['isPinned', 'DESC'],
                    [literal(`(
                        SELECT COUNT(*)
                        FROM "ShoppingListItems" sli
                        INNER JOIN "Products" p ON sli."productId" = p.id
                        INNER JOIN "Markets" m ON p."marketId" = m.id
                        INNER JOIN "MarketCategories" mc ON m.id = mc."marketId"
                        INNER JOIN "ShoppingLists" sl ON sli."shoppingListId" = sl.id
                        WHERE mc."categoryId" = "Category".id
                          AND sl.status IN ('completed', 'processing')
                          AND sl."createdAt" >= NOW() - INTERVAL '7 days'
                    )`), 'DESC'],
                    [literal(`(
                        SELECT COUNT(*)
                        FROM "MarketCategories" mc
                        INNER JOIN "Markets" m ON mc."marketId" = m.id
                        WHERE mc."categoryId" = "Category".id
                          AND m."isActive" = true
                    )`), 'DESC'],
                ],
            });

            // Apply context-based scoring
            const scoredCategories = categories.map(category => {
                const categoryData = category.get({ plain: true });
                const score = this.calculateContentScore(categoryData, {
                    userContext: context?.userContext,
                    locationContext: context?.locationContext,
                    timeContext: new Date(),
                });

                // Boost score based on market count and activity
                const marketBoost = Math.min((categoryData as any).marketCount * 2, 20);
                const activityBoost = Math.min((categoryData as any).recentActivity * 3, 30);

                return {
                    category,
                    score: score.score + marketBoost + activityBoost,
                    reasons: [
                        ...score.reasons,
                        ...(marketBoost > 0 ? [`${(categoryData as any).marketCount} markets available`] : []),
                        ...(activityBoost > 0 ? ['Recent customer activity'] : []),
                    ],
                };
            });

            return scoredCategories
                .sort((a, b) => b.score - a.score)
                .slice(0, limit)
                .map(item => item.category);

        } catch (error) {
            logger.error('Error fetching featured categories:', error);
            throw new BadRequestError('Failed to fetch featured categories');
        }
    }

    /**
     * Get nearby markets with enhanced location intelligence
     */
    async getNearbyMarkets(
        latitude: number,
        longitude: number,
        radius: number = 5,
        limit: number = 10,
        context?: {
            userContext?: UserContext;
            filters?: ContentFilters;
        }
    ): Promise<Market[]> {
        try {
            const markets = await this.getFeaturedMarkets(limit * 2, {
                locationContext: { latitude, longitude, maxDistance: radius },
                userContext: context?.userContext,
                filters: context?.filters,
            });

            // Filter by actual distance and apply location-specific scoring
            const nearbyMarkets = markets.filter((market: any) => {
                const distance = market.get('distance');
                return distance !== undefined && distance <= radius;
            });

            // Sort by a combination of distance and score
            return nearbyMarkets
                .sort((a: any, b: any) => {
                    const distanceA = a.get('distance') || 0;
                    const distanceB = b.get('distance') || 0;
                    const scoreA = a.scoreDetails?.score || 0;
                    const scoreB = b.scoreDetails?.score || 0;

                    // Weighted combination: 70% score, 30% proximity
                    const weightedA = (scoreA * 0.7) + ((radius - distanceA) * 0.3 * 10);
                    const weightedB = (scoreB * 0.7) + ((radius - distanceB) * 0.3 * 10);

                    return weightedB - weightedA;
                })
                .slice(0, limit);

        } catch (error) {
            logger.error('Error fetching nearby markets:', error);
            return await this.getFeaturedMarkets(limit);
        }
    }

    /**
     * Get personalized recommendations with machine learning-like approach
     */
    async getRecommendations(
        userId: string,
        limit: number = 10,
        context?: {
            locationContext?: LocationContext;
            filters?: ContentFilters;
        }
    ): Promise<Product[]> {
        try {
            // Build user context from order history
            const userOrders = await ShoppingList.findAll({
                where: {
                    customerId: userId,
                    status: { [Op.in]: ['completed', 'processing'] },
                },
                include: [
                    {
                        model: ShoppingListItem,
                        as: 'items',
                        include: [
                            {
                                model: Product,
                                as: 'product',
                                attributes: ['id', 'name', 'marketId'],
                                required: false,
                            },
                        ],
                    },
                    {
                        model: Market,
                        as: 'market',
                        include: [
                            {
                                model: Category,
                                as: 'categories',
                                attributes: ['id', 'name'],
                                through: { attributes: [] },
                            },
                        ],
                    },
                ],
                limit: 50,
                order: [['createdAt', 'DESC']],
            });

            // Extract user preferences
            const userContext: UserContext = {
                userId,
                orderHistory: [],
                preferences: [],
            };

            const marketIds = new Set<string>();
            const categoryNames = new Set<string>();
            const productIds = new Set<string>();

            userOrders.forEach(order => {
                if (order.marketId) marketIds.add(order.marketId);

                order.items.forEach(item => {
                    if (item.product?.id) productIds.add(item.product.id);
                    if (item.product?.marketId) marketIds.add(item.product.marketId);
                });

                if (order.market?.categories) {
                    order.market.categories.forEach(category => {
                        categoryNames.add(category.name);
                    });
                }
            });

            userContext.orderHistory = [...marketIds, ...productIds];
            userContext.preferences = Array.from(categoryNames);

            // Get recommendations using enhanced algorithm
            return await this.getFeaturedProducts(limit, {
                userContext,
                locationContext: context?.locationContext,
                filters: context?.filters,
            });

        } catch (error) {
            logger.error('Error fetching recommendations:', error);
            return await this.getFeaturedProducts(limit);
        }
    }

    /**
     * Get trending products with time-series analysis
     */
    async getTrendingProducts(
        limit: number = 10,
        timeframe: 'daily' | 'weekly' | 'monthly' = 'weekly'
    ): Promise<Product[]> {
        try {
            const timeframeDays = {
                daily: 1,
                weekly: 7,
                monthly: 30,
            };

            const days = timeframeDays[timeframe];
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            // Simplified approach: Get products with most orders in the timeframe
            // and calculate trend based on frequency
            const trendingQuery = `
            SELECT 
                p.id as "productId",
                COUNT(sli.id) as "totalOrders",
                COUNT(sli.id)::float / ${days} as "dailyAverage",
                p.name,
                p.price,
                p."createdAt"
            FROM "Products" p
            INNER JOIN "ShoppingListItems" sli ON p.id = sli."productId"
            INNER JOIN "ShoppingLists" sl ON sli."shoppingListId" = sl.id
            WHERE sl."createdAt" >= $1
                AND sl.status IN ('completed', 'processing')
                AND p."isAvailable" = true
            GROUP BY p.id, p.name, p.price, p."createdAt"
            HAVING COUNT(sli.id) >= 2
            ORDER BY 
                COUNT(sli.id) DESC,
                COUNT(sli.id)::float / ${days} DESC,
                p."createdAt" DESC
            LIMIT $2
        `;

            // Execute raw query to get trending product IDs
            const trendingResults = await Product.sequelize!.query(trendingQuery, {
                bind: [startDate.toISOString(), limit * 2],
                type: QueryTypes.SELECT,
            }) as any[];

            if (!trendingResults || trendingResults.length === 0) {
                // Fallback to featured products if no trending data
                return await this.getFeaturedProducts(limit);
            }

            // Get the product IDs from the trending results
            const productIds = trendingResults.map((item: any) => item.productId);

            // Get full product details with relationships
            const products = await Product.findAll({
                where: {
                    id: { [Op.in]: productIds },
                    isAvailable: true,
                },
                include: [
                    {
                        model: Market,
                        as: 'market',
                        attributes: ['id', 'name', 'address', 'marketType', 'images'],
                        where: { isActive: true },
                    },
                    {
                        model: Review,
                        as: 'reviews',
                        attributes: ['rating', 'createdAt'],
                        separate: true,
                        limit: 10, // Limit reviews for performance
                    },
                ],
                attributes: {
                    include: [
                        // Add trending metadata
                        [
                            literal(`(
                            SELECT COUNT(*)
                            FROM "ShoppingListItems" sli
                            INNER JOIN "ShoppingLists" sl ON sli."shoppingListId" = sl.id
                            WHERE sli."productId" = "Product".id 
                            AND sl.status IN ('completed', 'processing')
                            AND sl."createdAt" >= '${startDate.toISOString()}'
                        )`),
                            'trendingScore',
                        ],
                    ],
                },
            });

            // Sort products by the order from trending results and add trend metadata
            const sortedProducts = productIds
                .map(id => {
                    const product = products.find(p => p.id === id);
                    if (product) {
                        const trendData = trendingResults.find((t: any) => t.productId === id);
                        if (trendData) {
                            // Add trending metadata to the product
                            (product as any).trendingMetadata = {
                                totalOrders: parseInt(trendData.totalOrders),
                                dailyAverage: parseFloat(trendData.dailyAverage),
                                timeframe,
                                rank: productIds.indexOf(id) + 1,
                            };
                        }
                    }
                    return product;
                })
                .filter(p => p)
                .slice(0, limit);

            return sortedProducts as Product[];

        } catch (error) {
            logger.error('Error fetching trending products:', error);
            // Fallback to featured products with high activity
            try {
                return await this.getFeaturedProducts(limit, {
                    filters: { includeOutOfStock: false },
                });
            } catch (fallbackError) {
                logger.error('Error fetching fallback featured products:', fallbackError);
                return [];
            }
        }
    }

    /**
     * Enhanced search with intelligent ranking
     */
    async search(
        query: string,
        type: 'all' | 'products' | 'markets' | 'categories' = 'all',
        limit: number = 10,
        context?: {
            userContext?: UserContext;
            locationContext?: LocationContext;
            filters?: ContentFilters;
        }
    ): Promise<SearchResults> {
        try {
            const searchQuery = query.trim().toLowerCase();
            const results: SearchResults = {};

            // Enhanced search with relevance scoring
            if (type === 'all' || type === 'products') {
                const products = await Product.findAll({
                    where: {
                        [Op.and]: [
                            {
                                [Op.or]: [
                                    { name: { [Op.iLike]: `%${searchQuery}%` } },
                                    { description: { [Op.iLike]: `%${searchQuery}%` } },
                                    { barcode: { [Op.iLike]: `%${searchQuery}%` } },
                                ],
                            },
                            { isAvailable: true },
                        ],
                    },
                    include: [
                        {
                            model: Market,
                            as: 'market',
                            attributes: ['id', 'name', 'address', 'marketType', 'images'],
                            where: { isActive: true },
                            include: [
                                {
                                    model: Category,
                                    as: 'categories',
                                    attributes: ['id', 'name'],
                                    through: { attributes: [] },
                                },
                            ],
                        },
                    ],
                    attributes: {
                        include: [
                            // Base relevance score
                            [
                                literal(`
                                    CASE 
                                        WHEN LOWER("Product"."name") = '${searchQuery}' THEN 100
                                        WHEN LOWER("Product"."name") LIKE '${searchQuery}%' THEN 80
                                        WHEN LOWER("Product"."name") LIKE '%${searchQuery}%' THEN 60
                                        WHEN LOWER("Product"."description") LIKE '%${searchQuery}%' THEN 40
                                        WHEN "Product"."barcode" LIKE '%${searchQuery}%' THEN 30
                                        ELSE 10
                                    END
                                `),
                                'baseRelevanceScore',
                            ],
                            // Market reputation score
                            [
                                literal(`(
                                    SELECT COALESCE(AVG(r.rating), 0)
                                    FROM "Reviews" r
                                    WHERE r."marketId" = "Product"."marketId"
                                )`),
                                'marketRating',
                            ],
                            // Recent activity score
                            [
                                literal(`(
                                    SELECT COUNT(*)
                                    FROM "ShoppingListItems" sli
                                    INNER JOIN "ShoppingLists" sl ON sli."shoppingListId" = sl.id
                                    WHERE sli."productId" = "Product"."id"
                                    AND sl.status IN ('completed', 'processing')
                                    AND sl."createdAt" >= NOW() - INTERVAL '30 days'
                                )`),
                                'recentOrders',
                            ],
                        ],
                    },
                    limit: limit * 2,
                    order: [
                        [literal(`
                            CASE 
                                WHEN LOWER("Product"."name") = '${searchQuery}' THEN 100
                                WHEN LOWER("Product"."name") LIKE '${searchQuery}%' THEN 80
                                WHEN LOWER("Product"."name") LIKE '%${searchQuery}%' THEN 60
                                WHEN LOWER("Product"."description") LIKE '%${searchQuery}%' THEN 40
                                WHEN "Product"."barcode" LIKE '%${searchQuery}%' THEN 30
                                ELSE 10
                            END
                        `), 'DESC'],
                        ['isPinned', 'DESC'],
                        [literal(`(
                            SELECT COALESCE(AVG(r.rating), 0)
                            FROM "Reviews" r
                            WHERE r."marketId" = "Product"."marketId"
                        )`), 'DESC'],
                        [literal(`(
                            SELECT COUNT(*)
                            FROM "ShoppingListItems" sli
                            INNER JOIN "ShoppingLists" sl ON sli."shoppingListId" = sl.id
                            WHERE sli."productId" = "Product"."id"
                            AND sl.status IN ('completed', 'processing')
                            AND sl."createdAt" >= NOW() - INTERVAL '30 days'
                        )`), 'DESC'],
                        ['createdAt', 'DESC'],
                    ],
                });

                // Apply context scoring to search results
                const scoredProducts = products.map(product => {
                    const productData = product.get({ plain: true });
                    const contextScore = this.calculateContentScore(productData, {
                        userContext: context?.userContext,
                        locationContext: context?.locationContext,
                        timeContext: new Date(),
                    });

                    // Calculate final score with weighted components
                    const baseScore = Number(product.get('baseRelevanceScore')) || 0;
                    const marketScore = Number(product.get('marketRating')) || 0;
                    const activityScore = Number(product.get('recentOrders')) || 0;
                    const contextScoreValue = contextScore.score;

                    // Weighted scoring formula
                    const finalScore = (
                        baseScore * 0.4 +           // Base relevance (40%)
                        marketScore * 0.2 +         // Market reputation (20%)
                        activityScore * 0.2 +       // Recent activity (20%)
                        contextScoreValue * 0.2     // Context score (20%)
                    );

                    return {
                        product,
                        finalScore,
                        scoreDetails: {
                            baseScore,
                            marketScore,
                            activityScore,
                            contextScore: contextScoreValue,
                            reasons: contextScore.reasons,
                        },
                    };
                });

                results.products = scoredProducts
                    .sort((a, b) => b.finalScore - a.finalScore)
                    .slice(0, limit)
                    .map(item => {
                        // Add score metadata to product
                        (item.product as any).scoreDetails = item.scoreDetails;
                        return item.product;
                    });
            }

            // Similar enhanced logic for markets and categories...
            if (type === 'all' || type === 'markets') {
                results.markets = await Market.findAll({
                    where: {
                        [Op.and]: [
                            {
                                [Op.or]: [
                                    { name: { [Op.iLike]: `%${searchQuery}%` } },
                                    { description: { [Op.iLike]: `%${searchQuery}%` } },
                                    { address: { [Op.iLike]: `%${searchQuery}%` } },
                                ],
                            },
                            { isActive: true },
                        ],
                    },
                    include: [
                        {
                            model: User,
                            as: 'owner',
                            attributes: ['id', 'firstName', 'lastName'],
                            required: false,
                        },
                    ],
                    limit,
                    order: [
                        ['isPinned', 'DESC'],
                        ['name', 'ASC'],
                    ],
                });
            }

            if (type === 'all' || type === 'categories') {
                results.categories = await Category.findAll({
                    where: {
                        [Op.or]: [
                            { name: { [Op.iLike]: `%${searchQuery}%` } },
                            { description: { [Op.iLike]: `%${searchQuery}%` } },
                        ],
                    },
                    limit,
                    order: [
                        ['isPinned', 'DESC'],
                        ['name', 'ASC'],
                    ],
                });
            }

            return results;

        } catch (error) {
            logger.error('Error performing search:', error);
            throw new BadRequestError('Search failed');
        }
    }

    /**
     * Get banners with dynamic content
     */
    async getBanners(): Promise<Banner[]> {
        try {
            // Get dynamic banners based on featured content
            const [featuredMarkets, , featuredCategories] = await Promise.all([
                this.getFeaturedMarkets(3),
                this.getFeaturedProducts(3),
                this.getFeaturedCategories(3),
            ]);

            const banners: Banner[] = [];

            // Create banners from featured markets
            featuredMarkets.forEach((market, index) => {
                banners.push({
                    id: `market-${market.id}`,
                    title: `Shop at ${market.name}`,
                    description: market.description || `Discover quality products at ${market.name}`,
                    imageUrl: market.images?.[0] || '/images/default-market.jpg',
                    actionUrl: `/markets/${market.id}`,
                    isActive: true,
                    displayOrder: index + 1,
                    createdAt: market.createdAt,
                });
            });

            // Create banners from featured categories
            featuredCategories.slice(0, 2).forEach((category, index) => {
                banners.push({
                    id: `category-${category.id}`,
                    title: `Explore ${category.name}`,
                    description: category.description || `Find the best ${category.name.toLowerCase()} products`,
                    imageUrl: category.images?.[0] || `/images/categories/${category.name.toLowerCase()}.jpg`,
                    actionUrl: `/categories/${category.id}`,
                    isActive: true,
                    displayOrder: featuredMarkets.length + index + 1,
                    createdAt: category.createdAt,
                });
            });

            return banners.sort((a, b) => a.displayOrder - b.displayOrder);

        } catch (error) {
            logger.error('Error fetching banners:', error);
            return [];
        }
    }

    /**
     * Get comprehensive market statistics
     */
    async getMarketStats(): Promise<{
        totalMarkets: number;
        activeMarkets: number;
        featuredMarkets: number;
        totalProducts: number;
        featuredProducts: number;
        totalCategories: number;
        featuredCategories: number;
        totalOrders: number;
        recentOrders: number;
    }> {
        try {
            const [
                totalMarkets,
                activeMarkets,
                featuredMarkets,
                totalProducts,
                featuredProducts,
                totalCategories,
                featuredCategories,
                totalOrders,
                recentOrders,
            ] = await Promise.all([
                Market.count(),
                Market.count({ where: { isActive: true } }),
                Market.count({ where: { isActive: true, isPinned: true } }),
                Product.count({ where: { isAvailable: true } }),
                Product.count({ where: { isAvailable: true, isPinned: true } }),
                Category.count(),
                Category.count({ where: { isPinned: true } }),
                Order.count(),
                Order.count({
                    where: {
                        createdAt: {
                            [Op.gte]: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
                        },
                    },
                }),
            ]);

            return {
                totalMarkets,
                activeMarkets,
                featuredMarkets,
                totalProducts,
                featuredProducts,
                totalCategories,
                featuredCategories,
                totalOrders,
                recentOrders,
            };
        } catch (error) {
            logger.error('Error fetching market statsss:', error);
            return {
                totalMarkets: 0,
                activeMarkets: 0,
                featuredMarkets: 0,
                totalProducts: 0,
                featuredProducts: 0,
                totalCategories: 0,
                featuredCategories: 0,
                totalOrders: 0,
                recentOrders: 0,
            };
        }
    }
}