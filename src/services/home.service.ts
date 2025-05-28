import { Op, Sequelize, literal } from 'sequelize';
import Product from '../models/product.model';
import Market from '../models/market.model';
import Category from '../models/category.model';
import User from '../models/user.model';
import Order from '../models/order.model';
import ShoppingList from '../models/shoppingList.model';
import ShoppingListItem from '../models/shoppingListItem.model';
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

export class HomeService {
    /**
     * Get featured products based on isPinned flag or recent products
     */
    async getFeaturedProducts(limit: number = 10): Promise<Product[]> {
        try {
            // First try to get pinned/featured products
            let products = await Product.findAll({
                where: {
                    isAvailable: true,
                },
                include: [
                    {
                        model: Market,
                        as: 'market',
                        attributes: ['id', 'name', 'address', 'marketType', 'images'],
                        where: {
                            isActive: true,
                            isPinned: true, // Get products from featured markets
                        },
                        required: false,
                    },
                ],
                limit,
                order: [['createdAt', 'DESC']],
            });

            // If no featured products from pinned markets, get latest available products
            if (products.length === 0) {
                products = await Product.findAll({
                    where: {
                        isAvailable: true,
                    },
                    include: [
                        {
                            model: Market,
                            as: 'market',
                            attributes: ['id', 'name', 'address', 'marketType', 'images'],
                            where: {
                                isActive: true,
                            },
                            required: true,
                        },
                    ],
                    limit,
                    order: [['createdAt', 'DESC']],
                });
            }

            return products;
        } catch (error) {
            logger.error('Error fetching featured products:', error);
            throw new BadRequestError('Failed to fetch featured products');
        }
    }

    /**
     * Get featured markets based on isPinned flag
     */
    async getFeaturedMarkets(limit: number = 10): Promise<Market[]> {
        try {
            // First try to get pinned/featured markets
            let markets = await Market.findAll({
                where: {
                    isPinned: true,
                    isActive: true,
                },
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
                        attributes: ['id', 'name', 'icon'],
                        through: { attributes: [] },
                        required: false,
                    },
                ],
                limit,
                order: [['createdAt', 'DESC']],
            });

            // If no featured markets, get latest active markets
            if (markets.length === 0) {
                markets = await Market.findAll({
                    where: {
                        isActive: true,
                    },
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
                            attributes: ['id', 'name', 'icon'],
                            through: { attributes: [] },
                            required: false,
                        },
                    ],
                    limit,
                    order: [['createdAt', 'DESC']],
                });
            }

            return markets;
        } catch (error) {
            logger.error('Error fetching featured markets:', error);
            throw new BadRequestError('Failed to fetch featured markets');
        }
    }

    /**
     * Get nearby markets using Haversine formula for distance calculation
     */
    async getNearbyMarkets(
        latitude: number,
        longitude: number,
        radius: number = 5,
        limit: number = 10,
    ): Promise<Market[]> {
        try {
            // Validate coordinates
            if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
                throw new BadRequestError('Invalid coordinates provided');
            }

            // Using Haversine formula for distance calculation
            const markets = await Market.findAll({
                where: {
                    isActive: true,
                    location: {
                        [Op.ne]: null,
                    },
                },
                attributes: {
                    include: [
                        [
                            literal(`
                                (6371 * acos(
                                    cos(radians(${latitude})) * 
                                    cos(radians(CAST(location->>'latitude' AS DECIMAL))) * 
                                    cos(radians(CAST(location->>'longitude' AS DECIMAL)) - radians(${longitude})) + 
                                    sin(radians(${latitude})) * 
                                    sin(radians(CAST(location->>'latitude' AS DECIMAL)))
                                ))
                            `),
                            'distance',
                        ],
                    ],
                },
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
                        attributes: ['id', 'name', 'icon'],
                        through: { attributes: [] },
                        required: false,
                    },
                ],
                having: literal(`(6371 * acos(
                    cos(radians(${latitude})) * 
                    cos(radians(CAST(location->>'latitude' AS DECIMAL))) * 
                    cos(radians(CAST(location->>'longitude' AS DECIMAL)) - radians(${longitude})) + 
                    sin(radians(${latitude})) * 
                    sin(radians(CAST(location->>'latitude' AS DECIMAL)))
                )) <= ${radius}`),
                order: literal('distance'),
                limit,
            });

            // If no nearby markets, fallback to featured markets
            if (markets.length === 0) {
                return await this.getFeaturedMarkets(limit);
            }

            return markets;
        } catch (error) {
            logger.error('Error fetching nearby markets:', error);
            // Fallback to featured markets on error
            return await this.getFeaturedMarkets(limit);
        }
    }

    /**
     * Get trending products based on recent orders
     */
    async getTrendingProducts(limit: number = 10): Promise<Product[]> {
        try {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            // Get products that appear most in recent shopping lists
            const trendingProductIds = await ShoppingListItem.findAll({
                attributes: [
                    'productId',
                    [Sequelize.fn('COUNT', Sequelize.col('ShoppingListItem.id')), 'orderCount'],
                ],
                include: [
                    {
                        model: ShoppingList,
                        as: 'shoppingList',
                        where: {
                            createdAt: {
                                [Op.gte]: thirtyDaysAgo,
                            },
                            status: {
                                [Op.in]: ['completed', 'processing'],
                            },
                        },
                        attributes: [],
                    },
                ],
                where: {
                    productId: {
                        [Op.ne]: null,
                    },
                },
                group: ['productId'],
                order: [[literal('orderCount'), 'DESC']],
                limit,
                raw: true,
            });

            let products: Product[] = [];

            if (trendingProductIds.length > 0) {
                const productIds = trendingProductIds.map((item: any) => item.productId);
                products = await Product.findAll({
                    where: {
                        id: {
                            [Op.in]: productIds,
                        },
                        isAvailable: true,
                    },
                    include: [
                        {
                            model: Market,
                            as: 'market',
                            attributes: ['id', 'name', 'address', 'marketType', 'images'],
                            where: {
                                isActive: true,
                            },
                        },
                    ],
                });
            }

            // If no trending products, fallback to featured products
            if (products.length === 0) {
                products = await this.getFeaturedProducts(limit);
            }

            return products;
        } catch (error) {
            logger.error('Error fetching trending products:', error);
            // Fallback to featured products on error
            return await this.getFeaturedProducts(limit);
        }
    }

    /**
     * Get personalized recommendations based on user's order history
     */
    async getRecommendations(userId: string, limit: number = 10): Promise<Product[]> {
        try {
            // Get user's recent shopping list items to understand preferences
            const userShoppingItems = await ShoppingListItem.findAll({
                include: [
                    {
                        model: ShoppingList,
                        as: 'shoppingList',
                        where: {
                            customerId: userId,
                            status: {
                                [Op.in]: ['completed', 'processing'],
                            },
                        },
                        attributes: ['marketId'],
                    },
                    {
                        model: Product,
                        as: 'product',
                        attributes: ['marketId'],
                        required: false,
                    },
                ],
                limit: 50, // Get recent items to analyze patterns
                order: [['createdAt', 'DESC']],
            });

            let products: Product[] = [];

            if (userShoppingItems.length > 0) {
                // Get unique market IDs from user's shopping history
                const userMarketIds = [
                    ...new Set([
                        ...userShoppingItems
                            .map(item => item.shoppingList?.marketId)
                            .filter(Boolean),
                        ...userShoppingItems
                            .map(item => item.product?.marketId)
                            .filter(Boolean),
                    ]),
                ];

                if (userMarketIds.length > 0) {
                    // Get products from markets the user has shopped from
                    products = await Product.findAll({
                        where: {
                            marketId: {
                                [Op.in]: userMarketIds,
                            },
                            isAvailable: true,
                        },
                        include: [
                            {
                                model: Market,
                                as: 'market',
                                attributes: ['id', 'name', 'address', 'marketType', 'images'],
                                where: {
                                    isActive: true,
                                },
                            },
                        ],
                        limit,
                        order: [['createdAt', 'DESC']],
                    });
                }
            }

            // If no recommendations based on history, get trending products
            if (products.length === 0) {
                products = await this.getTrendingProducts(limit);
            }

            return products;
        } catch (error) {
            logger.error('Error fetching recommendations:', error);
            // Fallback to trending products on error
            return await this.getTrendingProducts(limit);
        }
    }

    /**
     * Get banners (placeholder implementation - would need Banner model)
     */
    async getBanners(): Promise<Banner[]> {
        try {
            // Since there's no Banner model in the current codebase,
            // return a placeholder or implement based on requirements
            const placeholderBanners: Banner[] = [
                {
                    id: '1',
                    title: 'Welcome to Busy2Shop',
                    description: 'Shop from your favorite local markets',
                    imageUrl: '/images/banner1.jpg',
                    actionUrl: '/markets',
                    isActive: true,
                    displayOrder: 1,
                    createdAt: new Date(),
                },
                {
                    id: '2',
                    title: 'Fresh Products Daily',
                    description: 'Get fresh products delivered to your doorstep',
                    imageUrl: '/images/banner2.jpg',
                    actionUrl: '/products',
                    isActive: true,
                    displayOrder: 2,
                    createdAt: new Date(),
                },
            ];

            return placeholderBanners;
        } catch (error) {
            logger.error('Error fetching banners:', error);
            return [];
        }
    }

    /**
     * Search across products, markets, and categories
     */
    async search(
        query: string,
        type: 'all' | 'products' | 'markets' | 'categories' = 'all',
        limit: number = 10,
    ): Promise<SearchResults> {
        try {
            if (!query || query.trim().length === 0) {
                throw new BadRequestError('Search query cannot be empty');
            }

            const searchQuery = query.trim();
            const results: SearchResults = {};

            if (type === 'all' || type === 'products') {
                results.products = await Product.findAll({
                    where: {
                        [Op.or]: [
                            { name: { [Op.iLike]: `%${searchQuery}%` } },
                            { description: { [Op.iLike]: `%${searchQuery}%` } },
                            { barcode: { [Op.iLike]: `%${searchQuery}%` } },
                        ],
                        isAvailable: true,
                    },
                    include: [
                        {
                            model: Market,
                            as: 'market',
                            attributes: ['id', 'name', 'address', 'marketType', 'images'],
                            where: {
                                isActive: true,
                            },
                        },
                    ],
                    limit,
                    order: [['createdAt', 'DESC']],
                });
            }

            if (type === 'all' || type === 'markets') {
                results.markets = await Market.findAll({
                    where: {
                        [Op.or]: [
                            { name: { [Op.iLike]: `%${searchQuery}%` } },
                            { description: { [Op.iLike]: `%${searchQuery}%` } },
                            { address: { [Op.iLike]: `%${searchQuery}%` } },
                        ],
                        isActive: true,
                    },
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
                            attributes: ['id', 'name', 'icon'],
                            through: { attributes: [] },
                            required: false,
                        },
                    ],
                    limit,
                    order: [['createdAt', 'DESC']],
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
                    include: [
                        {
                            model: Market,
                            as: 'markets',
                            attributes: ['id', 'name', 'marketType'],
                            through: { attributes: [] },
                            required: false,
                            limit: 5, // Limit markets per category for performance
                        },
                    ],
                    limit,
                    order: [['name', 'ASC']],
                });
            }

            return results;
        } catch (error) {
            logger.error('Error performing search:', error);
            throw new BadRequestError('Search failed');
        }
    }

    /**
     * Get popular categories based on market associations
     */
    async getPopularCategories(limit: number = 10): Promise<Category[]> {
        try {
            const categories = await Category.findAll({
                include: [
                    {
                        model: Market,
                        as: 'markets',
                        attributes: ['id'],
                        through: { attributes: [] },
                        where: {
                            isActive: true,
                        },
                        required: true,
                    },
                ],
                attributes: {
                    include: [
                        [
                            Sequelize.fn('COUNT', Sequelize.col('markets.id')),
                            'marketCount',
                        ],
                    ],
                },
                group: ['Category.id'],
                order: [[literal('marketCount'), 'DESC']],
                limit,
            });

            return categories;
        } catch (error) {
            logger.error('Error fetching popular categories:', error);
            // Fallback to all categories
            return await Category.findAll({
                limit,
                order: [['name', 'ASC']],
            });
        }
    }

    /**
     * Get market statistics for analytics
     */
    async getMarketStats(): Promise<{
        totalMarkets: number;
        activeMarkets: number;
        totalProducts: number;
        totalOrders: number;
    }> {
        try {
            const [totalMarkets, activeMarkets, totalProducts, totalOrders] = await Promise.all([
                Market.count(),
                Market.count({ where: { isActive: true } }),
                Product.count({ where: { isAvailable: true } }),
                Order.count(),
            ]);

            return {
                totalMarkets,
                activeMarkets,
                totalProducts,
                totalOrders,
            };
        } catch (error) {
            logger.error('Error fetching market stats:', error);
            return {
                totalMarkets: 0,
                activeMarkets: 0,
                totalProducts: 0,
                totalOrders: 0,
            };
        }
    }
}