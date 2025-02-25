import { Router } from 'express';
import MarketController from '../controllers/market.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';
import { uploadMiddleware, UploadType } from '../middlewares/uploadMiddleware';

const router = Router();
const upload = uploadMiddleware(UploadType.Array, 'files', 5);

// Public routes
router.get('/', MarketController.getAllMarkets);
router.get('/:id', MarketController.getMarket);

// Protected routes
router.post('/',  basicAuth('access'), upload, AuthenticatedController(MarketController.createMarket));
router.put('/:id',  basicAuth('access'), upload, AuthenticatedController(MarketController.updateMarket));
router.delete('/:id',  basicAuth('access'), AuthenticatedController(MarketController.deleteMarket));
router.patch('/:id/pin',  basicAuth('access'), AuthenticatedController(MarketController.toggleMarketPin));
router.post('/category',  basicAuth('access'), AuthenticatedController(MarketController.addToCategory));
router.delete('/:marketId/category/:categoryId',  basicAuth('access'), AuthenticatedController(MarketController.removeFromCategory));

export default router;