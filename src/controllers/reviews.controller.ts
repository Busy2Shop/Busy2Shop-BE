import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { IReview } from '../models/review.model';
import ReviewsService from '../services/reviews.service';
import Validator from '../utils/validators';
import { BadRequestError } from '../utils/customErrors';


export default class ReviewController {
    static async createReview(req: AuthenticatedRequest, res: Response){
        const reviewData: IReview = req.body;

        const review = await ReviewsService.createReview(reviewData);
        
        res.status(200).json({
            status: 'success',
            message: 'Review created successfully',
            data: review,
        });
    }

    static async deleteReview(req: AuthenticatedRequest, res: Response) {
        const { id: reviewId } = req.query;
        const isValidUUid = Validator.isUUID(reviewId as string);
        if (!isValidUUid) {
            throw new BadRequestError('Invalid experience id format provided');
        }
        const deleteReview = await ReviewsService.deleteReview(reviewId as string);
        res.status(200).json({
            status: 'success',
            message: 'Review deleted successfully',
            data: deleteReview,
        });
    }
}