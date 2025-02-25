import express from 'express';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';
import ReviewController from '../controllers/reviews.controller';

const router = express.Router();

router.post('/', basicAuth('access'), AuthenticatedController(ReviewController.createReview));
router.delete('/deleteReview', basicAuth('access'), AuthenticatedController(ReviewController.deleteReview));

export default router; 

