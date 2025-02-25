import { Router } from 'express';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';
import ReviewController from '../controllers/reviews.controller';
import { uploadMiddleware, UploadType } from '../middlewares/uploadMiddleware';

const router = Router();
const upload = uploadMiddleware(UploadType.Array, 'files', 5);

// Public routes
router.get('/', ReviewController.getAllReviews);
router.get('/market/:marketId', ReviewController.getMarketReviews);
router.get('/product/:productId', ReviewController.getProductReviews);
router.get('/:id', ReviewController.getReview);

// Protected routes
router.post('/', basicAuth('access'), upload, AuthenticatedController(ReviewController.createReview));
router.get('/user/:userId', basicAuth('access'), AuthenticatedController(ReviewController.getUserReviews));
router.get('/reviewable/items', AuthenticatedController(ReviewController.getReviewableItems));
router.put('/:id', basicAuth('access'), upload, AuthenticatedController(ReviewController.updateReview));
router.delete('/:id', basicAuth('access'), AuthenticatedController(ReviewController.deleteReview));

export default router;

