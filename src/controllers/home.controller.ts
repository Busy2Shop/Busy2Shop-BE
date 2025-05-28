import { Request, Response } from 'express';
import { HomeService } from '../services/home.service';

export default class HomeController {
    private homeService: HomeService;

    constructor() {
        this.homeService = new HomeService();
    }

    /**
     * Get featured products
     */
    getFeaturedProducts = async (req: Request, res: Response) => {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const products = await this.homeService.getFeaturedProducts(limit);
            return res.json({
                success: true,
                message: 'Featured products retrieved successfully',
                data: products,
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Error retrieving featured products',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };

    /**
     * Get featured markets
     */
    getFeaturedMarkets = async (req: Request, res: Response) => {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const markets = await this.homeService.getFeaturedMarkets(limit);
            return res.json({
                success: true,
                message: 'Featured markets retrieved successfully',
                data: markets,
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Error retrieving featured markets',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };

    /**
     * Get nearby markets based on location
     */
    getNearbyMarkets = async (req: Request, res: Response) => {
        try {
            const { latitude, longitude, radius, limit } = req.query;
            
            if (!latitude || !longitude) {
                return res.status(400).json({
                    success: false,
                    message: 'Latitude and longitude are required',
                });
            }

            const markets = await this.homeService.getNearbyMarkets(
                parseFloat(latitude as string),
                parseFloat(longitude as string),
                parseFloat(radius as string) || 5,
                parseInt(limit as string) || 10
            );

            return res.json({
                success: true,
                message: 'Nearby markets retrieved successfully',
                data: markets,
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Error retrieving nearby markets',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };

    /**
     * Get trending products
     */
    getTrendingProducts = async (req: Request, res: Response) => {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const products = await this.homeService.getTrendingProducts(limit);
            return res.json({
                success: true,
                message: 'Trending products retrieved successfully',
                data: products,
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Error retrieving trending products',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };

    /**
     * Get personalized recommendations
     */
    getRecommendations = async (req: Request, res: Response) => {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const userId = (req as any).user.id;
            const products = await this.homeService.getRecommendations(userId, limit);
            return res.json({
                success: true,
                message: 'Recommendations retrieved successfully',
                data: products,
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Error retrieving recommendations',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };

    /**
     * Get home page banners
     */
    getBanners = async (req: Request, res: Response) => {
        try {
            const banners = await this.homeService.getBanners();
            return res.json({
                success: true,
                message: 'Banners retrieved successfully',
                data: banners,
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Error retrieving banners',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };

    /**
     * Search across products, markets, and categories
     */
    search = async (req: Request, res: Response) => {
        try {
            const { query, type = 'all', limit } = req.query;

            if (!query) {
                return res.status(400).json({
                    success: false,
                    message: 'Search query is required',
                });
            }

            const results = await this.homeService.search(
                query as string,
                type as 'all' | 'products' | 'markets' | 'categories',
                parseInt(limit as string) || 10
            );

            return res.json({
                success: true,
                message: 'Search results retrieved successfully',
                data: results,
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: 'Error performing search',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };
} 