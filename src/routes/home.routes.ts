import { Router } from 'express';
import HomeController from '../controllers/home.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router = Router();

router.get('/', HomeController.getHomePage);

router.get('/featured/products', HomeController.getFeaturedProducts);

router.get('/featured/markets', HomeController.getFeaturedMarkets);

router.get('/nearby/markets', HomeController.getNearbyMarkets);

router.get('/banners', HomeController.getBanners);

router.get('/search', HomeController.search);

router.get('/stats', HomeController.getDashboardStats);

router.get(
    '/recommendations',
    basicAuth('access'),
    AuthenticatedController(HomeController.getRecommendations),
);

export default router;