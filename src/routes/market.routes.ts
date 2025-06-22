import { Router } from 'express';
import MarketController from '../controllers/market.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';
import { uploadMiddleware, UploadType } from '../middlewares/uploadMiddleware';

const router = Router();
const upload = uploadMiddleware(UploadType.Array, 'files', 5);

// Public routes
router.get('/', MarketController.getAllMarkets);
router.get('/featured', MarketController.getFeaturedMarkets);
router.get('/search', MarketController.searchMarkets);
router.get('/:id', MarketController.getMarket);

// Market products routes
router.get('/:id/products', MarketController.getMarketProducts);
router.get('/:id/products/search', MarketController.searchMarketProducts);

// Market categories routes
router.get('/:id/categories', MarketController.getMarketCategories);

// Protected routes
router.post(
    '/',
    basicAuth('access'),
    upload,
    AuthenticatedController(MarketController.createMarket),
);
router.put(
    '/:id',
    basicAuth('access'),
    upload,
    AuthenticatedController(MarketController.updateMarket),
);
router.delete('/:id', basicAuth('access'), AuthenticatedController(MarketController.deleteMarket));
router.patch(
    '/:id/pin',
    basicAuth('access'),
    AuthenticatedController(MarketController.toggleMarketPin),
);
router.post(
    '/category',
    basicAuth('access'),
    AuthenticatedController(MarketController.addToCategory),
);
router.delete(
    '/:marketId/category/:categoryId',
    basicAuth('access'),
    AuthenticatedController(MarketController.removeFromCategory),
);

export default router;
