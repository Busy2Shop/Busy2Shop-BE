import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { HomeService } from '../services/home.service';
import { BadRequestError } from '../utils/customErrors';
import { logger } from '../utils/logger';

export default class HomeController {
    /**
     * Get featured products
     */
    static async getFeaturedProducts(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 10;

            // Validate limit
            if (limit < 1 || limit > 100) {
                throw new BadRequestError('Limit must be between 1 and 100');
            }

            const homeService = new HomeService();
            const products = await homeService.getFeaturedProducts(limit);

            res.status(200).json({
                status: 'success',
                message: 'Featured products retrieved successfully',
                data: {
                    products,
                    count: products.length,
                },
            });
        } catch (error) {
            logger.error('Error in getFeaturedProducts:', error);

            if (error instanceof BadRequestError) {
                throw error;
            }

            res.status(500).json({
                status: 'error',
                error: true,
                message: 'Failed to retrieve featured products',
            });
        }
    }

    /**
     * Get featured markets
     */
    static async getFeaturedMarkets(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 10;

            // Validate limit
            if (limit < 1 || limit > 100) {
                throw new BadRequestError('Limit must be between 1 and 100');
            }

            const homeService = new HomeService();
            const markets = await homeService.getFeaturedMarkets(limit);

            res.status(200).json({
                status: 'success',
                message: 'Featured markets retrieved successfully',
                data: {
                    markets,
                    count: markets.length,
                },
            });
        } catch (error) {
            logger.error('Error in getFeaturedMarkets:', error);

            if (error instanceof BadRequestError) {
                throw error;
            }

            res.status(500).json({
                status: 'error',
                error: true,
                message: 'Failed to retrieve featured markets',
            });
        }
    }

    /**
     * Get nearby markets based on location
     */
    static async getNearbyMarkets(req: Request, res: Response) {
        try {
            const { latitude, longitude, radius, limit } = req.query;

            if (!latitude || !longitude) {
                throw new BadRequestError('Latitude and longitude are required');
            }

            const lat = parseFloat(latitude as string);
            const lng = parseFloat(longitude as string);
            const radiusKm = parseFloat(radius as string) || 5;
            const limitNum = parseInt(limit as string) || 10;

            // Validate coordinates
            if (isNaN(lat) || isNaN(lng)) {
                throw new BadRequestError('Invalid latitude or longitude values');
            }

            if (lat < -90 || lat > 90) {
                throw new BadRequestError('Latitude must be between -90 and 90');
            }

            if (lng < -180 || lng > 180) {
                throw new BadRequestError('Longitude must be between -180 and 180');
            }

            // Validate radius
            if (radiusKm < 0.1 || radiusKm > 100) {
                throw new BadRequestError('Radius must be between 0.1 and 100 kilometers');
            }

            // Validate limit
            if (limitNum < 1 || limitNum > 100) {
                throw new BadRequestError('Limit must be between 1 and 100');
            }

            const homeService = new HomeService();
            const markets = await homeService.getNearbyMarkets(lat, lng, radiusKm, limitNum);

            res.status(200).json({
                status: 'success',
                message: 'Nearby markets retrieved successfully',
                data: {
                    markets,
                    count: markets.length,
                    searchParams: {
                        latitude: lat,
                        longitude: lng,
                        radius: radiusKm,
                    },
                },
            });
        } catch (error) {
            logger.error('Error in getNearbyMarkets:', error);

            if (error instanceof BadRequestError) {
                throw error;
            }

            res.status(500).json({
                status: 'error',
                error: true,
                message: 'Failed to retrieve nearby markets',
            });
        }
    }

    /**
     * Get trending products
     */
    static async getTrendingProducts(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 10;

            // Validate limit
            if (limit < 1 || limit > 100) {
                throw new BadRequestError('Limit must be between 1 and 100');
            }

            const homeService = new HomeService();
            const products = await homeService.getTrendingProducts(limit);

            res.status(200).json({
                status: 'success',
                message: 'Trending products retrieved successfully',
                data: {
                    products,
                    count: products.length,
                },
            });
        } catch (error) {
            logger.error('Error in getTrendingProducts:', error);

            if (error instanceof BadRequestError) {
                throw error;
            }

            res.status(500).json({
                status: 'error',
                error: true,
                message: 'Failed to retrieve trending products',
            });
        }
    }

    /**
     * Get personalized recommendations (requires authentication)
     */
    static async getRecommendations(req: AuthenticatedRequest, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const userId = req.user.id;

            // Validate limit
            if (limit < 1 || limit > 100) {
                throw new BadRequestError('Limit must be between 1 and 100');
            }

            const homeService = new HomeService();
            const products = await homeService.getRecommendations(userId, limit);

            res.status(200).json({
                status: 'success',
                message: 'Personalized recommendations retrieved successfully',
                data: {
                    products,
                    count: products.length,
                },
            });
        } catch (error) {
            logger.error('Error in getRecommendations:', error);

            if (error instanceof BadRequestError) {
                throw error;
            }

            res.status(500).json({
                status: 'error',
                error: true,
                message: 'Failed to retrieve recommendations',
            });
        }
    }

    /**
     * Get home page banners
     */
    static async getBanners(req: Request, res: Response) {
        try {
            const homeService = new HomeService();
            const banners = await homeService.getBanners();

            res.status(200).json({
                status: 'success',
                message: 'Banners retrieved successfully',
                data: {
                    banners,
                    count: banners.length,
                },
            });
        } catch (error) {
            logger.error('Error in getBanners:', error);

            res.status(500).json({
                status: 'error',
                error: true,
                message: 'Failed to retrieve banners',
            });
        }
    }

    /**
     * Search across products, markets, and categories
     */
    static async search(req: Request, res: Response) {
        try {
            const { query, type = 'all', limit } = req.query;

            if (!query || typeof query !== 'string' || query.trim().length < 2) {
                throw new BadRequestError('Search query must be at least 2 characters long');
            }

            const searchType = type as 'all' | 'products' | 'markets' | 'categories';
            const limitNum = parseInt(limit as string) || 10;

            // Validate search type
            const validTypes = ['all', 'products', 'markets', 'categories'];
            if (!validTypes.includes(searchType)) {
                throw new BadRequestError('Invalid search type. Must be one of: all, products, markets, categories');
            }

            // Validate limit
            if (limitNum < 1 || limitNum > 100) {
                throw new BadRequestError('Limit must be between 1 and 100');
            }

            const homeService = new HomeService();
            const results = await homeService.search(query.trim(), searchType, limitNum);

            // Calculate total results
            const totalResults =
                (results.products?.length || 0) +
                (results.markets?.length || 0) +
                (results.categories?.length || 0);

            res.status(200).json({
                status: 'success',
                message: 'Search completed successfully',
                data: {
                    ...results,
                    totalResults,
                    searchQuery: query.trim(),
                    searchType: searchType,
                },
            });
        } catch (error) {
            logger.error('Error in search:', error);

            if (error instanceof BadRequestError) {
                throw error;
            }

            res.status(500).json({
                status: 'error',
                error: true,
                message: 'Search failed',
            });
        }
    }

    /**
     * Get popular categories
     */
    static async getPopularCategories(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 10;

            // Validate limit
            if (limit < 1 || limit > 50) {
                throw new BadRequestError('Limit must be between 1 and 50');
            }

            const homeService = new HomeService();
            const categories = await homeService.getPopularCategories(limit);

            res.status(200).json({
                status: 'success',
                message: 'Popular categories retrieved successfully',
                data: {
                    categories,
                    count: categories.length,
                },
            });
        } catch (error) {
            logger.error('Error in getPopularCategories:', error);

            if (error instanceof BadRequestError) {
                throw error;
            }

            res.status(500).json({
                status: 'error',
                error: true,
                message: 'Failed to retrieve popular categories',
            });
        }
    }

    /**
     * Get dashboard statistics
     */
    static async getDashboardStats(req: Request, res: Response) {
        try {
            const homeService = new HomeService();
            const stats = await homeService.getMarketStats();

            res.status(200).json({
                status: 'success',
                message: 'Dashboard statistics retrieved successfully',
                data: stats,
            });
        } catch (error) {
            logger.error('Error in getDashboardStats:', error);

            res.status(500).json({
                status: 'error',
                error: true,
                message: 'Failed to retrieve dashboard statistics',
            });
        }
    }

    /**
     * Get home page data (combined endpoint for initial page load)
     */
    static async getHomePage(req: Request, res: Response) {
        try {
            const homeService = new HomeService();

            // Get all home page data in parallel
            const [
                featuredProducts,
                featuredMarkets,
                trendingProducts,
                popularCategories,
                banners,
            ] = await Promise.all([
                homeService.getFeaturedProducts(8),
                homeService.getFeaturedMarkets(6),
                homeService.getTrendingProducts(8),
                homeService.getPopularCategories(6),
                homeService.getBanners(),
            ]);

            res.status(200).json({
                status: 'success',
                message: 'Home page data retrieved successfully',
                data: {
                    featuredProducts: {
                        items: featuredProducts,
                        count: featuredProducts.length,
                    },
                    featuredMarkets: {
                        items: featuredMarkets,
                        count: featuredMarkets.length,
                    },
                    trendingProducts: {
                        items: trendingProducts,
                        count: trendingProducts.length,
                    },
                    popularCategories: {
                        items: popularCategories,
                        count: popularCategories.length,
                    },
                    banners: {
                        items: banners,
                        count: banners.length,
                    },
                },
            });
        } catch (error) {
            logger.error('Error in getHomePage:', error);

            res.status(500).json({
                status: 'error',
                error: true,
                message: 'Failed to retrieve home page data',
            });
        }
    }
}