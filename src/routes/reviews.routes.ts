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

// Protected routes - apply auth middleware to all protected routes
router.use(basicAuth('access'));

// Static paths first
router.post('/', upload, AuthenticatedController(ReviewController.createReview));
router.get('/reviewable/items', AuthenticatedController(ReviewController.getReviewableItems));

// Dynamic path patterns
router.get('/user/:userId', AuthenticatedController(ReviewController.getUserReviews));
router.put('/:id', upload, AuthenticatedController(ReviewController.updateReview));
router.delete('/:id', AuthenticatedController(ReviewController.deleteReview));

export default router;