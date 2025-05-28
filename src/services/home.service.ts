import { Product } from '../models/product.model';
import { Market } from '../models/market.model';
import { Category } from '../models/category.model';
import { Banner } from '../models/banner.model';
import { Order } from '../models/order.model';
import { User } from '../models/user.model';
import { Op } from 'sequelize';
import { sequelize } from '../config/database';

export class HomeService {
    async getFeaturedProducts(limit: number = 10) {
        // First try to get featured products
        let products = await Product.findAll({
            where: {
                is_featured: true,
                is_available: true,
                is_active: true,
            },
            include: [
                {
                    model: Market,
                    attributes: ['id', 'name', 'logo', 'address', 'city', 'state'],
                },
                {
                    model: Category,
                    attributes: ['id', 'name', 'image'],
                },
            ],
            limit,
            order: [['created_at', 'DESC']],
        });

        // If no featured products, get latest active products
        if (products.length === 0) {
            products = await Product.findAll({
                where: {
                    is_available: true,
                    is_active: true,
                },
                include: [
                    {
                        model: Market,
                        attributes: ['id', 'name', 'logo', 'address', 'city', 'state'],
                    },
                    {
                        model: Category,
                        attributes: ['id', 'name', 'image'],
                    },
                ],
                limit,
                order: [['created_at', 'DESC']],
            });
        }

        return products;
    }

    async getFeaturedMarkets(limit: number = 10) {
        // First try to get featured markets
        let markets = await Market.findAll({
            where: {
                is_featured: true,
                is_active: true,
            },
            limit,
            order: [['created_at', 'DESC']],
        });

        // If no featured markets, get latest active markets
        if (markets.length === 0) {
            markets = await Market.findAll({
                where: {
                    is_active: true,
                },
                limit,
                order: [['created_at', 'DESC']],
            });
        }

        return markets;
    }

    async getNearbyMarkets(latitude: number, longitude: number, radius: number = 5, limit: number = 10) {
        // First try to get nearby markets
        let markets = await Market.findAll({
            where: {
                is_active: true,
            },
            attributes: {
                include: [
                    [
                        sequelize.literal(`
                            (6371 * acos(
                                cos(radians(${latitude})) * 
                                cos(radians(latitude)) * 
                                cos(radians(longitude) - radians(${longitude})) + 
                                sin(radians(${latitude})) * 
                                sin(radians(latitude))
                            ))
                        `),
                        'distance',
                    ],
                ],
            },
            having: sequelize.literal(`distance <= ${radius}`),
            order: sequelize.literal('distance'),
            limit,
        });

        // If no nearby markets, get featured markets
        if (markets.length === 0) {
            markets = await Market.findAll({
                where: {
                    is_featured: true,
                    is_active: true,
                },
                limit,
                order: [['created_at', 'DESC']],
            });
        }

        // If still no markets, get any active markets
        if (markets.length === 0) {
            markets = await Market.findAll({
                where: {
                    is_active: true,
                },
                limit,
                order: [['created_at', 'DESC']],
            });
        }

        return markets;
    }

    async getTrendingProducts(limit: number = 10) {
        // Get products with most orders in the last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const trendingProducts = await Order.findAll({
            attributes: [
                'product_id',
                [sequelize.fn('COUNT', sequelize.col('id')), 'order_count'],
            ],
            where: {
                created_at: {
                    [Op.gte]: thirtyDaysAgo,
                },
            },
            group: ['product_id'],
            order: [[sequelize.literal('order_count'), 'DESC']],
            limit,
        });

        let products = [];
        if (trendingProducts.length > 0) {
            const productIds = trendingProducts.map(p => p.product_id);
            products = await Product.findAll({
                where: {
                    id: {
                        [Op.in]: productIds,
                    },
                    is_available: true,
                    is_active: true,
                },
                include: [
                    {
                        model: Market,
                        attributes: ['id', 'name', 'logo', 'address', 'city', 'state'],
                    },
                    {
                        model: Category,
                        attributes: ['id', 'name', 'image'],
                    },
                ],
            });
        }

        // If no trending products, get featured products
        if (products.length === 0) {
            products = await Product.findAll({
                where: {
                    is_featured: true,
                    is_available: true,
                    is_active: true,
                },
                include: [
                    {
                        model: Market,
                        attributes: ['id', 'name', 'logo', 'address', 'city', 'state'],
                    },
                    {
                        model: Category,
                        attributes: ['id', 'name', 'image'],
                    },
                ],
                limit,
                order: [['created_at', 'DESC']],
            });
        }

        // If still no products, get latest active products
        if (products.length === 0) {
            products = await Product.findAll({
                where: {
                    is_available: true,
                    is_active: true,
                },
                include: [
                    {
                        model: Market,
                        attributes: ['id', 'name', 'logo', 'address', 'city', 'state'],
                    },
                    {
                        model: Category,
                        attributes: ['id', 'name', 'image'],
                    },
                ],
                limit,
                order: [['created_at', 'DESC']],
            });
        }

        return products;
    }

    async getRecommendations(userId: number, limit: number = 10) {
        // Get user's order history
        const userOrders = await Order.findAll({
            where: { user_id: userId },
            include: [{
                model: Product,
                include: [{
                    model: Category,
                }],
            }],
        });

        let products = [];
        if (userOrders.length > 0) {
            // Get categories from user's order history
            const categoryIds = [...new Set(
                userOrders.flatMap(order =>
                    order.product.category_id ? [order.product.category_id] : []
                )
            )];

            // Get products from same categories
            products = await Product.findAll({
                where: {
                    category_id: {
                        [Op.in]: categoryIds,
                    },
                    is_available: true,
                    is_active: true,
                },
                include: [
                    {
                        model: Market,
                        attributes: ['id', 'name', 'logo', 'address', 'city', 'state'],
                    },
                    {
                        model: Category,
                        attributes: ['id', 'name', 'image'],
                    },
                ],
                limit,
                order: [['created_at', 'DESC']],
            });
        }

        // If no recommendations, get trending products
        if (products.length === 0) {
            products = await this.getTrendingProducts(limit);
        }

        // If still no products, get featured products
        if (products.length === 0) {
            products = await this.getFeaturedProducts(limit);
        }

        return products;
    }

    async getBanners() {
        // Get active banners
        const banners = await Banner.findAll({
            where: {
                is_active: true,
            },
            order: [['created_at', 'DESC']],
        });

        // If no banners, return empty array (banners are optional)
        return banners;
    }

    async search(query: string, type: 'all' | 'products' | 'markets' | 'categories', limit: number = 10) {
        const searchQuery = {
            [Op.or]: [
                { name: { [Op.iLike]: `%${query}%` } },
                { description: { [Op.iLike]: `%${query}%` } },
            ],
        };

        const results: any = {};

        if (type === 'all' || type === 'products') {
            results.products = await Product.findAll({
                where: {
                    ...searchQuery,
                    is_available: true,
                    is_active: true,
                },
                include: [
                    {
                        model: Market,
                        attributes: ['id', 'name', 'logo', 'address', 'city', 'state'],
                    },
                    {
                        model: Category,
                        attributes: ['id', 'name', 'image'],
                    },
                ],
                limit,
            });

            // If no products found, get featured products
            if (results.products.length === 0) {
                results.products = await this.getFeaturedProducts(limit);
            }
        }

        if (type === 'all' || type === 'markets') {
            results.markets = await Market.findAll({
                where: {
                    ...searchQuery,
                    is_active: true,
                },
                limit,
            });

            // If no markets found, get featured markets
            if (results.markets.length === 0) {
                results.markets = await this.getFeaturedMarkets(limit);
            }
        }

        if (type === 'all' || type === 'categories') {
            results.categories = await Category.findAll({
                where: {
                    ...searchQuery,
                    is_active: true,
                },
                limit,
            });

            // If no categories found, get all active categories
            if (results.categories.length === 0) {
                results.categories = await Category.findAll({
                    where: {
                        is_active: true,
                    },
                    limit,
                    order: [['created_at', 'DESC']],
                });
            }
        }

        return results;
    }
} 