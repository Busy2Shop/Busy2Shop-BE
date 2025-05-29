import { Router } from 'express';
import HomeController from '../controllers/home.controller';
import { AuthenticatedController, basicAuth, optionalAuth } from '../middlewares/authMiddleware';

const router = Router();

// Main home page endpoint with intelligent content curation
router.get('/', optionalAuth, HomeController.getHomePage);

// Featured content endpoints with advanced algorithms
router.get('/featured/products', optionalAuth, HomeController.getFeaturedProducts);
router.get('/featured/markets', optionalAuth, HomeController.getFeaturedMarkets);
router.get('/featured/categories', optionalAuth, HomeController.getFeaturedCategories);

// Location-based discovery
router.get('/nearby/markets', optionalAuth, HomeController.getNearbyMarkets);

// Trending and popular content
router.get('/trending/products', optionalAuth, HomeController.getTrendingProducts);

// Personalized content (requires authentication)
router.get(
    '/recommendations',
    basicAuth('access'),
    AuthenticatedController(HomeController.getRecommendations),
);

// Advanced contextual recommendations
router.get(
    '/recommendations/contextual',
    basicAuth('access'),
    AuthenticatedController(HomeController.getContextualRecommendations),
);

// Dynamic banners and promotional content
router.get('/banners', optionalAuth, HomeController.getBanners);

// Enhanced search with intelligent ranking
router.get('/search', optionalAuth, HomeController.search);

// Analytics and statistics
router.get('/stats', HomeController.getDashboardStats);


export default router;