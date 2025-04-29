/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-undef */
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import ReviewService from '../services/reviews.service';
import { BadRequestError } from '../utils/customErrors';
import CloudinaryClientConfig from '../clients/cloudinary.config';

export default class ReviewController {
    static async createReview(req: AuthenticatedRequest, res: Response) {
        const { comment, rating } = req.body;

        // More comprehensive handling of empty/null values
        const productId = !req.body.productId || req.body.productId === '' || req.body.productId === 'null'
            ? null
            : req.body.productId;

        const marketId = !req.body.marketId || req.body.marketId === '' || req.body.marketId === 'null'
            ? null
            : req.body.marketId;

        // Replace the values in the request or use these variables directly
        req.body.productId = productId;
        req.body.marketId = marketId;

        if (!comment || !rating) {
            throw new BadRequestError('Comment and rating are required');
        }

        // Validate that either marketId or productId is provided, but not both
        if ((!marketId && !productId) || (marketId && productId)) {
            throw new BadRequestError('Either market ID or product ID must be provided (not both)');
        }

        // Check if the user is eligible to review this item
        if (marketId) {
            const canReview = await ReviewService.canUserReviewMarket(req.user.id, marketId);
            if (!canReview) {
                throw new BadRequestError('You are not eligible to review this market. You must have completed an order from this market and not reviewed it yet.');
            }
        } else if (productId) {
            const canReview = await ReviewService.canUserReviewProduct(req.user.id, productId);
            if (!canReview) {
                throw new BadRequestError('You are not eligible to review this product. You must have completed an order from this product\'s market and not reviewed it yet.');
            }
        }

        // Handle review images upload
        const files = req.files as Express.Multer.File[] | undefined;
        const imageUrls: string[] = [];

        if (files && files.length > 0) {
            // Upload each image to Cloudinary
            for (const file of files) {
                const result = await CloudinaryClientConfig.uploadtoCloudinary({
                    fileBuffer: file.buffer,
                    id: req.user.id,
                    name: file.originalname,
                    type: 'review',
                });
                imageUrls.push(result.url as string);
            }
        }

        // Create the review
        const newReview = await ReviewService.addReview({
            comment,
            rating: parseInt(rating),
            marketId,
            productId,
            reviewerId: req.user.id,
            images: imageUrls,
        });

        res.status(201).json({
            status: 'success',
            message: 'Review created successfully',
            data: newReview,
        });
    }

    static async getAllReviews(req: Request, res: Response) {
        const { page, size, rating, marketId, productId, reviewerId } = req.query;

        const queryParams: Record<string, unknown> = {};

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (rating) queryParams.rating = Number(rating);
        if (marketId) queryParams.marketId = marketId as string;
        if (productId) queryParams.productId = productId as string;
        if (reviewerId) queryParams.reviewerId = reviewerId as string;

        const reviews = await ReviewService.viewReviews(queryParams);

        res.status(200).json({
            status: 'success',
            message: 'Reviews retrieved successfully',
            data: { ...reviews },
        });
    }

    static async getMarketReviews(req: Request, res: Response) {
        const { marketId } = req.params;
        const { page, size, rating } = req.query;

        const queryParams: Record<string, unknown> = {
            marketId,
        };

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (rating) queryParams.rating = Number(rating);

        const reviews = await ReviewService.viewReviews(queryParams);

        // Also get the average rating
        const averageRating = await ReviewService.getMarketAverageRating(marketId);

        res.status(200).json({
            status: 'success',
            message: 'Market reviews retrieved successfully',
            data: {
                ...reviews,
                averageRating: averageRating.averageRating,
                totalReviews: averageRating.totalReviews,
            },
        });
    }

    static async getProductReviews(req: Request, res: Response) {
        const { productId } = req.params;
        const { page, size, rating } = req.query;

        const queryParams: Record<string, unknown> = {
            productId,
        };

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (rating) queryParams.rating = Number(rating);

        const reviews = await ReviewService.viewReviews(queryParams);

        // Also get the average rating
        const averageRating = await ReviewService.getProductAverageRating(productId);

        res.status(200).json({
            status: 'success',
            message: 'Product reviews retrieved successfully',
            data: {
                ...reviews,
                averageRating: averageRating.averageRating,
                totalReviews: averageRating.totalReviews,
            },
        });
    }

    // admin only
    static async getUserReviews(req: AuthenticatedRequest, res: Response) {
        const userId = req.params.userId || req.user.id;
        const { page, size } = req.query;

        // Only admins or the user themselves can see their reviews
        // if (userId !== req.user.id && req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('You are not authorised to view these reviews');
        // }

        const queryParams: Record<string, unknown> = {
            reviewerId: userId,
        };

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        const reviews = await ReviewService.viewReviews(queryParams);

        res.status(200).json({
            status: 'success',
            message: 'User reviews retrieved successfully',
            data: { ...reviews },
        });
    }

    static async getReviewableItems(req: AuthenticatedRequest, res: Response) {
        const userId = req.user.id;
        const { page, size, marketType, productName } = req.query;

        const queryParams: Record<string, unknown> = {};

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (marketType) queryParams.marketType = marketType as string;
        if (productName) queryParams.productName = productName as string;

        const reviewableItems = await ReviewService.getUserReviewableItems(userId, queryParams);

        res.status(200).json({
            status: 'success',
            message: 'Reviewable items retrieved successfully',
            data: reviewableItems,
        });
    }

    static async getReview(req: Request, res: Response) {
        const { id } = req.params;

        const review = await ReviewService.getReview(id);

        res.status(200).json({
            status: 'success',
            message: 'Review retrieved successfully',
            data: review,
        });
    }

    static async updateReview(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { comment, rating } = req.body;

        // Prepare update data
        const updateData: Record<string, any> = {};
        if (comment) updateData.comment = comment;
        if (rating) updateData.rating = parseInt(rating);

        // Handle new images upload
        const files = req.files as Express.Multer.File[] | undefined;
        const imageUrls: string[] = [];

        if (files && files.length > 0) {
            // Upload each new image to Cloudinary
            for (const file of files) {
                const result = await CloudinaryClientConfig.uploadtoCloudinary({
                    fileBuffer: file.buffer,
                    id: req.user.id,
                    name: file.originalname,
                    type: 'review',
                });
                imageUrls.push(result.url as string);
            }

            // Check if we should append or replace images
            const appendImages = req.body.appendImages === 'true';

            if (appendImages) {
                const review = await ReviewService.getReview(id);
                updateData.images = [...(review.images || []), ...imageUrls];
            } else {
                updateData.images = imageUrls;
            }
        }

        const updatedReview = await ReviewService.updateReview(id, req.user.id, updateData);

        res.status(200).json({
            status: 'success',
            message: 'Review updated successfully',
            data: updatedReview,
        });
    }

    // admin only

    static async deleteReview(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        // const isAdmin = req.user.status.userType === 'ADMIN';
        const isAdmin = true;

        await ReviewService.deleteReview(id, req.user.id, isAdmin);

        res.status(200).json({
            status: 'success',
            message: 'Review deleted successfully',
            data: null,
        });
    }
}