import { Router } from 'express';
import HomeController from '../controllers/home.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router = Router();

// Public routes
router.get('/featured/products', HomeController.getFeaturedProducts);
router.get('/featured/markets', HomeController.getFeaturedMarkets);
router.get('/nearby/markets', HomeController.getNearbyMarkets);
router.get('/trending/products', HomeController.getTrendingProducts);
router.get('/banners', HomeController.getBanners);
router.get('/search', HomeController.search);

// Protected routes
router.get(
    '/recommendations',
    basicAuth('access'),
    AuthenticatedController(HomeController.getRecommendations),
);

export default router; 