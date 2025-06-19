import { Router } from 'express';
import HomeController from '../controllers/home.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router = Router();

// Main home page endpoint with intelligent content curation
router.get('/', HomeController.getHomePage);

// Featured content endpoints with advanced algorithms
router.get('/featured/products', HomeController.getFeaturedProducts);
router.get('/featured/markets', HomeController.getFeaturedMarkets);
router.get('/featured/markets-with-products', HomeController.getFeaturedMarketsWithProducts);
router.get('/featured/categories', HomeController.getFeaturedCategories);
router.get('/featured/data', HomeController.getFeaturedData);

// Location-based discovery
router.get('/nearby/markets', HomeController.getNearbyMarkets);

// Trending and popular content
router.get('/trending/products', HomeController.getTrendingProducts);

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
router.get('/banners', HomeController.getBanners);

// Enhanced search with intelligent ranking
router.get('/search', HomeController.search);

// Analytics and statistics
router.get('/stats', HomeController.getDashboardStats);

// Suggested shopping lists
router.get('/suggested-lists', HomeController.getSuggestedShoppingLists);

export default router;