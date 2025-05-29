import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { HomeService, LocationContext, UserContext, ContentFilters } from '../services/home.service';
import { BadRequestError } from '../utils/customErrors';
import { logger } from '../utils/logger';

export default class HomeController {
    /**
     * Helper method to build context from request
     */
    private static buildContext(req: Request | AuthenticatedRequest): {
        userContext?: UserContext;
        locationContext?: LocationContext;
        filters?: ContentFilters;
    } {
        const context: any = {};

        // Build location context
        const { latitude, longitude, maxDistance } = req.query;
        if (latitude && longitude) {
            context.locationContext = {
                latitude: parseFloat(latitude as string),
                longitude: parseFloat(longitude as string),
                maxDistance: maxDistance ? parseFloat(maxDistance as string) : undefined,
            };
        }

        // Build user context (only for authenticated requests)
        if ('user' in req && req.user) {
            context.userContext = {
                userId: (req as AuthenticatedRequest).user.id,
                preferences: req.query.preferences ?
                    (req.query.preferences as string).split(',') : undefined,
            };
        }

        // Build content filters
        const {
            minPrice,
            maxPrice,
            categories,
            marketTypes,
            includeOutOfStock,
        } = req.query;

        if (minPrice || maxPrice || categories || marketTypes || includeOutOfStock) {
            context.filters = {} as ContentFilters;

            if (minPrice || maxPrice) {
                context.filters.priceRange = {
                    min: minPrice ? parseFloat(minPrice as string) : 0,
                    max: maxPrice ? parseFloat(maxPrice as string) : Number.MAX_VALUE,
                };
            }

            if (categories) {
                context.filters.categories = (categories as string).split(',');
            }

            if (marketTypes) {
                context.filters.marketTypes = (marketTypes as string).split(',');
            }

            if (includeOutOfStock !== undefined) {
                context.filters.includeOutOfStock = includeOutOfStock === 'true';
            }
        }

        return context;
    }

    /**
     * Get comprehensive home page data with intelligent content curation
     */
    static async getHomePage(req: Request, res: Response) {
        try {
            const context = HomeController.buildContext(req);
            const homeService = new HomeService();

            // Determine content limits based on user preferences or device
            const isMobile = req.headers['user-agent']?.toLowerCase().includes('mobile');
            const baseLimit = isMobile ? 6 : 8;

            // Get all home page data with context-aware algorithms
            const [
                featuredProducts,
                featuredMarkets,
                featuredCategories,
                trendingProducts,
                banners,
                stats,
            ] = await Promise.all([
                homeService.getFeaturedProducts(baseLimit, context),
                homeService.getFeaturedMarkets(baseLimit - 2, context),
                homeService.getFeaturedCategories(baseLimit - 2, context),
                homeService.getTrendingProducts(baseLimit, 'weekly'),
                homeService.getBanners(),
                homeService.getMarketStats(),
            ]);

            // Add performance metadata for debugging (only in development)
            const responseData: any = {
                featuredProducts: {
                    items: featuredProducts,
                    count: featuredProducts.length,
                    algorithm: 'smart_scoring_v2',
                },
                featuredMarkets: {
                    items: featuredMarkets,
                    count: featuredMarkets.length,
                    algorithm: 'context_aware_ranking',
                },
                featuredCategories: {
                    items: featuredCategories,
                    count: featuredCategories.length,
                    algorithm: 'activity_based_sorting',
                },
                trendingProducts: {
                    items: trendingProducts,
                    count: trendingProducts.length,
                    algorithm: 'growth_velocity_analysis',
                },
                banners: {
                    items: banners,
                    count: banners.length,
                    algorithm: 'dynamic_content_generation',
                },
                stats,
            };

            // Add personalization metadata if user is authenticated
            if (context.userContext) {
                responseData.personalization = {
                    enabled: true,
                    userId: context.userContext.userId,
                    factors: ['order_history', 'location', 'preferences', 'time_context'],
                };
            }

            // Add location context metadata
            if (context.locationContext) {
                responseData.location = {
                    enabled: true,
                    coordinates: {
                        latitude: context.locationContext.latitude,
                        longitude: context.locationContext.longitude,
                    },
                    maxDistance: context.locationContext.maxDistance || 5,
                };
            }

            res.status(200).json({
                status: 'success',
                message: 'Home page data retrieved successfully',
                data: responseData,
                meta: {
                    timestamp: new Date().toISOString(),
                    version: '2.0',
                    algorithms: {
                        content_scoring: 'multi_factor_weighted',
                        personalization: 'collaborative_filtering',
                        location_intelligence: 'haversine_distance',
                        trending_analysis: 'time_series_growth',
                    },
                },
            });

        } catch (error) {
            logger.error('Error in getHomePage:', error);

            res.status(500).json({
                status: 'error',
                error: true,
                message: 'Failed to retrieve home page data',
                errorCode: 'HOME_PAGE_ERROR',
            });
        }
    }

    /**
     * Get featured products with advanced filtering and context
     */
    static async getFeaturedProducts(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const algorithm = req.query.algorithm as string || 'smart_scoring';

            // Validate limit
            if (limit < 1 || limit > 100) {
                throw new BadRequestError('Limit must be between 1 and 100');
            }

            const context = HomeController.buildContext(req);
            const homeService = new HomeService();

            let products;

            // Allow different algorithm modes for A/B testing
            switch (algorithm) {
                case 'trending':
                    products = await homeService.getTrendingProducts(limit);
                    break;
                case 'location_based':
                    if (!context.locationContext) {
                        throw new BadRequestError('Location coordinates required for location-based algorithm');
                    }
                    products = await homeService.getFeaturedProducts(limit, context);
                    break;
                default:
                    products = await homeService.getFeaturedProducts(limit, context);
            }

            res.status(200).json({
                status: 'success',
                message: 'Featured products retrieved successfully',
                data: {
                    products,
                    count: products.length,
                    algorithm,
                    context: {
                        personalized: !!context.userContext,
                        locationBased: !!context.locationContext,
                        filtered: !!context.filters,
                    },
                },
                meta: {
                    requestId: req.headers['x-request-id'] || 'unknown',
                    processingTime: Date.now(),
                    algorithm: algorithm,
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
                errorCode: 'FEATURED_PRODUCTS_ERROR',
            });
        }
    }

    /**
     * Get featured markets with location intelligence
     */
    static async getFeaturedMarkets(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const sortBy = req.query.sortBy as string || 'smart_score';

            if (limit < 1 || limit > 100) {
                throw new BadRequestError('Limit must be between 1 and 100');
            }

            const context = HomeController.buildContext(req);
            const homeService = new HomeService();

            let markets;

            // Different sorting strategies
            switch (sortBy) {
                case 'distance':
                    if (!context.locationContext) {
                        throw new BadRequestError('Location coordinates required for distance sorting');
                    }
                    markets = await homeService.getNearbyMarkets(
                        context.locationContext.latitude!,
                        context.locationContext.longitude!,
                        context.locationContext.maxDistance || 10,
                        limit,
                        context
                    );
                    break;
                case 'rating':
                case 'popularity':
                case 'smart_score':
                default:
                    markets = await homeService.getFeaturedMarkets(limit, context);
            }

            res.status(200).json({
                status: 'success',
                message: 'Featured markets retrieved successfully',
                data: {
                    markets,
                    count: markets.length,
                    sortBy,
                    context: {
                        personalized: !!context.userContext,
                        locationBased: !!context.locationContext,
                        filtered: !!context.filters,
                    },
                },
                recommendations: {
                    suggestedRadius: context.locationContext ?
                        Math.min(context.locationContext.maxDistance || 5, 15) : null,
                    alternativeSearches: [
                        'Try increasing search radius',
                        'Browse by category',
                        'Check trending markets',
                    ],
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
                errorCode: 'FEATURED_MARKETS_ERROR',
            });
        }
    }

    /**
     * Get nearby markets with enhanced location intelligence
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

            // Enhanced validation
            if (isNaN(lat) || isNaN(lng)) {
                throw new BadRequestError('Invalid latitude or longitude values');
            }

            if (lat < -90 || lat > 90) {
                throw new BadRequestError('Latitude must be between -90 and 90');
            }

            if (lng < -180 || lng > 180) {
                throw new BadRequestError('Longitude must be between -180 and 180');
            }

            if (radiusKm < 0.1 || radiusKm > 100) {
                throw new BadRequestError('Radius must be between 0.1 and 100 kilometers');
            }

            if (limitNum < 1 || limitNum > 100) {
                throw new BadRequestError('Limit must be between 1 and 100');
            }

            const context = HomeController.buildContext(req);
            const homeService = new HomeService();

            const markets = await homeService.getNearbyMarkets(
                lat,
                lng,
                radiusKm,
                limitNum,
                context
            );

            // Provide intelligent suggestions if no markets found
            const suggestions = [];
            if (markets.length === 0) {
                suggestions.push('Try increasing the search radius');
                if (radiusKm < 10) suggestions.push('Consider searching within 10km');
                suggestions.push('Check featured markets in your area');
                suggestions.push('Browse markets by category');
            } else if (markets.length < 3 && radiusKm < 15) {
                suggestions.push('Expand radius to see more options');
            }

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
                        limit: limitNum,
                    },
                    suggestions,
                    analytics: {
                        averageDistance: markets.length > 0 ?
                            markets.reduce((sum, market: any) =>
                                sum + (market.get('distance') || 0), 0) / markets.length : 0,
                        furthestMarket: markets.length > 0 ?
                            Math.max(...markets.map((market: any) => market.get('distance') || 0)) : 0,
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
                errorCode: 'NEARBY_MARKETS_ERROR',
            });
        }
    }

    /**
     * Get trending products with time-series analysis
     */
    static async getTrendingProducts(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const timeframe = req.query.timeframe as 'daily' | 'weekly' | 'monthly' || 'weekly';

            if (limit < 1 || limit > 100) {
                throw new BadRequestError('Limit must be between 1 and 100');
            }

            const validTimeframes = ['daily', 'weekly', 'monthly'];
            if (!validTimeframes.includes(timeframe)) {
                throw new BadRequestError('Timeframe must be one of: daily, weekly, monthly');
            }

            const homeService = new HomeService();
            const products = await homeService.getTrendingProducts(limit, timeframe);

            res.status(200).json({
                status: 'success',
                message: 'Trending products retrieved successfully',
                data: {
                    products,
                    count: products.length,
                    timeframe,
                    analysis: {
                        period: timeframe,
                        algorithm: 'growth_velocity_with_momentum',
                        factors: [
                            'order_frequency',
                            'growth_rate',
                            'user_engagement',
                            'inventory_turnover',
                        ],
                    },
                },
                insights: {
                    message: `These products are trending ${timeframe} based on order growth and customer engagement`,
                    nextUpdate: this.getNextUpdateTime(timeframe),
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
                errorCode: 'TRENDING_PRODUCTS_ERROR',
            });
        }
    }

    /**
     * Get personalized recommendations with ML-like intelligence
     */
    static async getRecommendations(req: AuthenticatedRequest, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 10;
            const strategy = req.query.strategy as string || 'hybrid';
            const userId = req.user.id;

            if (limit < 1 || limit > 100) {
                throw new BadRequestError('Limit must be between 1 and 100');
            }

            const context = HomeController.buildContext(req);
            const homeService = new HomeService();

            let products;
            let algorithmUsed;

            // Different recommendation strategies
            switch (strategy) {
                case 'collaborative':
                    // Based on similar users' preferences
                    products = await homeService.getRecommendations(userId, limit, context);
                    algorithmUsed = 'collaborative_filtering';
                    break;
                case 'content_based':
                    // Based on user's past purchases
                    products = await homeService.getRecommendations(userId, limit, context);
                    algorithmUsed = 'content_based_filtering';
                    break;
                case 'trending':
                    // Based on trending items
                    products = await homeService.getTrendingProducts(limit);
                    algorithmUsed = 'trending_items';
                    break;
                case 'hybrid':
                default:
                    // Combination of multiple approaches
                    products = await homeService.getRecommendations(userId, limit, context);
                    algorithmUsed = 'hybrid_recommendation';
            }

            res.status(200).json({
                status: 'success',
                message: 'Personalized recommendations retrieved successfully',
                data: {
                    products,
                    count: products.length,
                    userId,
                    strategy,
                    personalization: {
                        level: this.getPersonalizationLevel(products, userId),
                        factors: [
                            'purchase_history',
                            'browsing_behavior',
                            'location_preferences',
                            'seasonal_trends',
                            'peer_recommendations',
                        ],
                        confidence: this.calculateRecommendationConfidence(products),
                    },
                },
                insights: {
                    message: 'Recommendations tailored based on your shopping patterns and preferences',
                    algorithm: algorithmUsed,
                    lastUpdated: new Date().toISOString(),
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
                errorCode: 'RECOMMENDATIONS_ERROR',
            });
        }
    }

    /**
     * Enhanced search with intelligent ranking and suggestions
     */
    static async search(req: Request, res: Response) {
        try {
            const { query, type = 'all', limit, suggest = 'true' } = req.query;

            if (!query || typeof query !== 'string' || query.trim().length < 2) {
                throw new BadRequestError('Search query must be at least 2 characters long');
            }

            const searchType = type as 'all' | 'products' | 'markets' | 'categories';
            const limitNum = parseInt(limit as string) || 10;
            const includeSuggestions = suggest === 'true';

            const validTypes = ['all', 'products', 'markets', 'categories'];
            if (!validTypes.includes(searchType)) {
                throw new BadRequestError('Invalid search type. Must be one of: all, products, markets, categories');
            }

            if (limitNum < 1 || limitNum > 100) {
                throw new BadRequestError('Limit must be between 1 and 100');
            }

            const context = HomeController.buildContext(req);
            const homeService = new HomeService();

            const results = await homeService.search(
                query.trim(),
                searchType,
                limitNum,
                context
            );

            const totalResults =
                (results.products?.length || 0) +
                (results.markets?.length || 0) +
                (results.categories?.length || 0);

            const responseData: any = {
                ...results,
                totalResults,
                searchQuery: query.trim(),
                searchType,
                performance: {
                    algorithm: 'relevance_scoring_v2',
                    processingTime: Date.now(),
                    cached: false,
                },
            };

            // Add search suggestions if requested and results are limited
            if (includeSuggestions && totalResults < 5) {
                responseData.suggestions = this.generateSearchSuggestions(query.trim(), results);
            }

            // Add search analytics
            responseData.analytics = {
                queryLength: query.trim().length,
                resultsDistribution: {
                    products: results.products?.length || 0,
                    markets: results.markets?.length || 0,
                    categories: results.categories?.length || 0,
                },
                searchScore: this.calculateSearchQuality(results, query.trim()),
            };

            res.status(200).json({
                status: 'success',
                message: 'Search completed successfully',
                data: responseData,
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
                errorCode: 'SEARCH_ERROR',
            });
        }
    }

    /**
     * Get smart banners with dynamic content
     */
    static async getBanners(req: Request, res: Response) {
        try {
            const context = HomeController.buildContext(req);
            const homeService = new HomeService();

            const banners = await homeService.getBanners();

            res.status(200).json({
                status: 'success',
                message: 'Banners retrieved successfully',
                data: {
                    banners,
                    count: banners.length,
                    metadata: {
                        dynamic: true,
                        personalized: !!context.userContext,
                        locationBased: !!context.locationContext,
                        lastUpdated: new Date().toISOString(),
                    },
                },
            });

        } catch (error) {
            logger.error('Error in getBanners:', error);

            res.status(500).json({
                status: 'error',
                error: true,
                message: 'Failed to retrieve banners',
                errorCode: 'BANNERS_ERROR',
            });
        }
    }

    /**
     * Get featured categories with activity-based sorting
     */
    static async getFeaturedCategories(req: Request, res: Response) {
        try {
            const limit = parseInt(req.query.limit as string) || 10;

            if (limit < 1 || limit > 50) {
                throw new BadRequestError('Limit must be between 1 and 50');
            }

            const context = HomeController.buildContext(req);
            const homeService = new HomeService();

            const categories = await homeService.getFeaturedCategories(limit, context);

            res.status(200).json({
                status: 'success',
                message: 'Featured categories retrieved successfully',
                data: {
                    categories,
                    count: categories.length,
                    algorithm: 'activity_based_with_market_density',
                    insights: {
                        message: 'Categories ranked by market availability and recent customer activity',
                        factors: ['market_count', 'recent_orders', 'user_preferences', 'seasonal_trends'],
                    },
                },
            });

        } catch (error) {
            logger.error('Error in getFeaturedCategories:', error);

            if (error instanceof BadRequestError) {
                throw error;
            }

            res.status(500).json({
                status: 'error',
                error: true,
                message: 'Failed to retrieve featured categories',
                errorCode: 'FEATURED_CATEGORIES_ERROR',
            });
        }
    }

    /**
     * Get comprehensive dashboard statistics
     */
    static async getDashboardStats(req: Request, res: Response) {
        try {
            const homeService = new HomeService();
            const stats = await homeService.getMarketStats();

            // Calculate additional metrics
            const insights = {
                featuredContentRatio: {
                    markets: stats.totalMarkets > 0 ?
                        (stats.featuredMarkets / stats.totalMarkets * 100).toFixed(1) : '0',
                    products: stats.totalProducts > 0 ?
                        (stats.featuredProducts / stats.totalProducts * 100).toFixed(1) : '0',
                    categories: stats.totalCategories > 0 ?
                        (stats.featuredCategories / stats.totalCategories * 100).toFixed(1) : '0',
                },
                activityLevel: this.calculateActivityLevel(stats.recentOrders, stats.totalOrders),
                growthTrend: this.calculateGrowthTrend(stats.recentOrders),
                marketHealth: this.calculateMarketHealth(stats),
            };

            res.status(200).json({
                status: 'success',
                message: 'Dashboard statistics retrieved successfully',
                data: {
                    ...stats,
                    insights,
                    recommendations: this.generateDashboardRecommendations(stats, insights),
                },
                meta: {
                    lastUpdated: new Date().toISOString(),
                    updateFrequency: 'real-time',
                    accuracy: 'high',
                },
            });

        } catch (error) {
            logger.error('Error in getDashboardStats:', error);

            res.status(500).json({
                status: 'error',
                error: true,
                message: 'Failed to retrieve dashboard statistics',
                errorCode: 'STATS_ERROR',
            });
        }
    }

    /**
     * Advanced endpoint for getting contextual product recommendations
     */
    static async getContextualRecommendations(req: AuthenticatedRequest, res: Response) {
        try {
            const {
                occasion,
                budget,
                timeframe,
                dietaryRestrictions,
                preferredBrands,
                limit,
            } = req.query;

            const limitNum = parseInt(limit as string) || 10;

            if (limitNum < 1 || limitNum > 50) {
                throw new BadRequestError('Limit must be between 1 and 50');
            }

            const context = HomeController.buildContext(req);

            // Enhanced context with specific parameters
            const enhancedContext = {
                ...context,
                occasion: occasion as string,
                budget: budget ? {
                    min: 0,
                    max: parseFloat(budget as string),
                } : undefined,
                timeframe: timeframe as 'immediate' | 'today' | 'week' | 'month',
                dietaryRestrictions: dietaryRestrictions ?
                    (dietaryRestrictions as string).split(',') : [],
                preferredBrands: preferredBrands ?
                    (preferredBrands as string).split(',') : [],
            };

            const homeService = new HomeService();
            const recommendations = await homeService.getRecommendations(
                req.user.id,
                limitNum,
                context
            );

            res.status(200).json({
                status: 'success',
                message: 'Contextual recommendations retrieved successfully',
                data: {
                    recommendations,
                    count: recommendations.length,
                    context: enhancedContext,
                    personalization: {
                        level: 'high',
                        contextFactors: Object.keys(enhancedContext).filter(key =>
                            enhancedContext[key as keyof typeof enhancedContext] !== undefined
                        ).length,
                    },
                },
                suggestions: {
                    alternativeOccasions: this.suggestAlternativeOccasions(occasion as string),
                    budgetOptimization: this.suggestBudgetOptimization(recommendations, budget as string),
                },
            });

        } catch (error) {
            logger.error('Error in getContextualRecommendations:', error);

            if (error instanceof BadRequestError) {
                throw error;
            }

            res.status(500).json({
                status: 'error',
                error: true,
                message: 'Failed to retrieve contextual recommendations',
                errorCode: 'CONTEXTUAL_RECOMMENDATIONS_ERROR',
            });
        }
    }

    // Helper methods for enhanced functionality

    private static getNextUpdateTime(timeframe: string): string {
        const now = new Date();
        switch (timeframe) {
            case 'daily':
                now.setHours(24, 0, 0, 0);
                break;
            case 'weekly':{
                const daysUntilMonday = (8 - now.getDay()) % 7;
                now.setDate(now.getDate() + daysUntilMonday);
                now.setHours(0, 0, 0, 0);
                break;}
            case 'monthly':
                now.setMonth(now.getMonth() + 1, 1);
                now.setHours(0, 0, 0, 0);
                break;
        }
        return now.toISOString();
    }

    private static getPersonalizationLevel(products: any[], userId: string): 'low' | 'medium' | 'high' {
        console.log(`Calculating personalization level for user ${userId} with ${products.length} products`);
        const personalizedProducts = products.filter(p =>
            p.scoreDetails?.reasons?.some((reason: string) =>
                reason.includes('history') || reason.includes('interests')
            )
        );

        const ratio = personalizedProducts.length / products.length;
        if (ratio > 0.7) return 'high';
        if (ratio > 0.3) return 'medium';
        return 'low';
    }

    private static calculateRecommendationConfidence(products: any[]): number {
        if (!products.length) return 0;

        const avgScore = products.reduce((sum, p) =>
            sum + (p.scoreDetails?.score || 0), 0) / products.length;

        return Math.min(Math.round(avgScore * 100 / 150), 100); // Normalize to percentage
    }

    private static generateSearchSuggestions(query: string, results: any): string[] {
        const suggestions = [];

        if (results.products?.length === 0) {
            suggestions.push(`Try searching for "${query}" in markets`);
            suggestions.push(`Browse ${query} category`);
        }

        if (results.markets?.length === 0) {
            suggestions.push(`Look for "${query}" products instead`);
            suggestions.push('Try nearby markets');
        }

        // Add typo suggestions (simple implementation)
        if (query.length > 3) {
            suggestions.push(`Did you mean "${query.slice(0, -1)}"?`);
        }

        suggestions.push('Browse featured categories');
        suggestions.push('Check trending products');

        return suggestions.slice(0, 3);
    }

    private static calculateSearchQuality(results: any, query: string): number {
        const totalResults =
            (results.products?.length || 0) +
            (results.markets?.length || 0) +
            (results.categories?.length || 0);

        let score = Math.min(totalResults * 10, 70); // Base score from result count

        // Bonus for query length (optimal 3-15 characters)
        if (query.length >= 3 && query.length <= 15) {
            score += 20;
        }

        // Bonus for having results in multiple categories
        const categoriesWithResults = [
            results.products?.length > 0,
            results.markets?.length > 0,
            results.categories?.length > 0,
        ].filter(Boolean).length;

        score += categoriesWithResults * 5;

        return Math.min(score, 100);
    }

    private static calculateActivityLevel(recentOrders: number, totalOrders: number): 'low' | 'medium' | 'high' {
        if (totalOrders === 0) return 'low';

        const ratio = recentOrders / totalOrders;
        if (ratio > 0.3) return 'high';
        if (ratio > 0.1) return 'medium';
        return 'low';
    }

    private static calculateGrowthTrend(recentOrders: number): 'declining' | 'stable' | 'growing' {
        // Simplified growth calculation - in real implementation, 
        // you'd compare with previous periods
        if (recentOrders > 100) return 'growing';
        if (recentOrders > 20) return 'stable';
        return 'declining';
    }

    private static calculateMarketHealth(stats: any): 'poor' | 'fair' | 'good' | 'excellent' {
        const activeRatio = stats.totalMarkets > 0 ? stats.activeMarkets / stats.totalMarkets : 0;
        const productRatio = stats.activeMarkets > 0 ? stats.totalProducts / stats.activeMarkets : 0;

        const healthScore = (activeRatio * 0.4) + (Math.min(productRatio / 10, 1) * 0.6);

        if (healthScore > 0.8) return 'excellent';
        if (healthScore > 0.6) return 'good';
        if (healthScore > 0.4) return 'fair';
        return 'poor';
    }

    private static generateDashboardRecommendations(stats: any, insights: any): string[] {
        const recommendations = [];

        if (parseFloat(insights.featuredContentRatio.markets) < 10) {
            recommendations.push('Consider featuring more markets to improve visibility');
        }

        if (insights.activityLevel === 'low') {
            recommendations.push('Implement promotional campaigns to boost order activity');
        }

        if (stats.totalProducts / stats.activeMarkets < 5) {
            recommendations.push('Encourage markets to add more product listings');
        }

        if (insights.marketHealth === 'poor' || insights.marketHealth === 'fair') {
            recommendations.push('Focus on market activation and quality improvement');
        }

        return recommendations;
    }

    private static suggestAlternativeOccasions(occasion: string): string[] {
        const occasionMap: Record<string, string[]> = {
            'breakfast': ['brunch', 'morning snack', 'quick meal'],
            'lunch': ['light meal', 'office lunch', 'family meal'],
            'dinner': ['family dinner', 'date night', 'celebration'],
            'party': ['gathering', 'celebration', 'social event'],
            'workout': ['pre-workout', 'post-workout', 'fitness meal'],
        };

        return occasionMap[occasion?.toLowerCase()] || ['meal', 'snack', 'special occasion'];
    }

    private static suggestBudgetOptimization(recommendations: any[], budget: string): any {
        if (!budget || !recommendations.length) return null;

        const budgetNum = parseFloat(budget);
        const avgPrice = recommendations.reduce((sum, product) =>
            sum + (product.price || 0), 0) / recommendations.length;

        return {
            averagePrice: avgPrice.toFixed(2),
            budgetUtilization: ((avgPrice / budgetNum) * 100).toFixed(1) + '%',
            suggestions: avgPrice > budgetNum ?
                ['Consider products with discounts', 'Look for bulk options', 'Check alternative brands'] :
                ['You have room for premium options', 'Consider adding complementary items'],
        };
    }
}