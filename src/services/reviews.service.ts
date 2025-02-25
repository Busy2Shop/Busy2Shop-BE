import Review, { IReview } from '../models/review.model';
import { BadRequestError, NotFoundError } from '../utils/customErrors';


export default class ReviewsService {
    static async createReview(reviewData: IReview): Promise<Review> {
        // Validate the rating
        if (reviewData.rating < 1 || reviewData.rating > 5) {
            throw new BadRequestError('Rating must be between 1 and 5');
        }
        const review = await Review.create(reviewData);
        return review;
    }

    static async getReviewById(reviewId: string): Promise<Review> {
        const review = await Review.findByPk(reviewId);
        if (!review) throw new NotFoundError('review not found');
        return review;
    }
    static async deleteReview(reviewId: string): Promise<void> {
        const review = await this.getReviewById(reviewId);
        await review.destroy();
    }
}