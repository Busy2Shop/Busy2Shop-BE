import { col, FindAndCountOptions, fn, Op } from 'sequelize';
import Review, { IReview } from '../models/review.model';
import User from '../models/user.model';
import Market from '../models/market.model';
import Product from '../models/product.model';
import Order from '../models/order.model';
import ShoppingList from '../models/shoppingList.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/customErrors';
import Pagination, { IPaging } from '../utils/pagination';

export interface IViewReviewsQuery {
    page?: number;
    size?: number;
    rating?: number;
    marketId?: string;
    productId?: string;
    reviewerId?: string;
}

export interface IReviewableItemsQuery {
    page?: number;
    size?: number;
    marketType?: string;    // Optional filter by market type
    productName?: string;   // Optional search by product name
}

export default class ReviewService {
    static async addReview(reviewData: IReview): Promise<Review> {
        // Validate required fields
        if (!reviewData.comment || !reviewData.rating || !reviewData.reviewerId) {
            throw new BadRequestError('Comment, rating, and reviewer ID are required');
        }

        // Validate that either marketId or productId is provided, but not both
        if ((!reviewData.marketId && !reviewData.productId) || (reviewData.marketId && reviewData.productId)) {
            throw new BadRequestError('Either market ID or product ID must be provided (not both)');
        }

        // Validate rating range
        if (reviewData.rating < 1 || reviewData.rating > 5) {
            throw new BadRequestError('Rating must be between 1 and 5');
        }

        // If reviewing a market, check if it exists
        if (reviewData.marketId) {
            const market = await Market.findByPk(reviewData.marketId);
            if (!market) {
                throw new NotFoundError('Market not found');
            }

            // Check if the user has already reviewed this market
            const existingReview = await Review.findOne({
                where: {
                    marketId: reviewData.marketId,
                    reviewerId: reviewData.reviewerId,
                },
            });

            if (existingReview) {
                throw new BadRequestError('You have already reviewed this market');
            }
        }

        // If reviewing a product, check if it exists
        if (reviewData.productId) {
            const product = await Product.findByPk(reviewData.productId);
            if (!product) {
                throw new NotFoundError('Product not found');
            }

            // Check if the user has already reviewed this product
            const existingReview = await Review.findOne({
                where: {
                    productId: reviewData.productId,
                    reviewerId: reviewData.reviewerId,
                },
            });

            if (existingReview) {
                throw new BadRequestError('You have already reviewed this product');
            }
        }

        return await Review.create({ ...reviewData });
    }

    static async viewReviews(queryData?: IViewReviewsQuery): Promise<{ reviews: Review[], count: number, totalPages?: number }> {
        const { page, size, rating, marketId, productId, reviewerId } = queryData || {};

        const where: Record<string, unknown> = {};

        // Filter by rating
        if (rating) {
            where.rating = rating;
        }

        // Filter by market
        if (marketId) {
            where.marketId = marketId;
        }

        // Filter by product
        if (productId) {
            where.productId = productId;
        }

        // Filter by reviewer
        if (reviewerId) {
            where.reviewerId = reviewerId;
        }

        // Basic query options
        const queryOptions: FindAndCountOptions<Review> = {
            where,
            include: [
                {
                    model: User,
                    as: 'reviewer',
                    attributes: ['id', 'firstName', 'lastName', 'email'],
                },
                {
                    model: Market,
                    as: 'market',
                    attributes: ['id', 'name', 'marketType', 'address'],
                    required: false,
                },
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'price'],
                    required: false,
                },
            ],
            order: [['createdAt', 'DESC']],
        };

        // Handle pagination
        if (page && size && page > 0 && size > 0) {
            const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);
            queryOptions.limit = limit ?? 0;
            queryOptions.offset = offset ?? 0;
        }

        const { rows: reviews, count } = await Review.findAndCountAll(queryOptions);

        // Calculate pagination metadata if applicable
        if (page && size && reviews.length > 0) {
            const totalPages = Pagination.estimateTotalPage({ count, limit: size } as IPaging);
            return { reviews, count, ...totalPages };
        } else {
            return { reviews, count };
        }
    }

    static async getReview(id: string): Promise<Review> {
        const review = await Review.findByPk(id, {
            include: [
                {
                    model: User,
                    as: 'reviewer',
                    attributes: ['id', 'firstName', 'lastName', 'email'],
                },
                {
                    model: Market,
                    as: 'market',
                    attributes: ['id', 'name', 'marketType', 'address'],
                    required: false,
                },
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name', 'price'],
                    required: false,
                },
            ],
        });

        if (!review) {
            throw new NotFoundError('Review not found');
        }

        return review;
    }

    static async updateReview(id: string, reviewerId: string, dataToUpdate: Partial<IReview>): Promise<Review> {
        const review = await this.getReview(id);

        // Check if the user is the reviewer
        if (review.reviewerId !== reviewerId) {
            throw new ForbiddenError('You are not authorized to update this review');
        }

        // Cannot change the target of the review
        if (dataToUpdate.marketId || dataToUpdate.productId) {
            throw new BadRequestError('Cannot change the target of a review');
        }

        // Validate rating if provided
        if (dataToUpdate.rating && (dataToUpdate.rating < 1 || dataToUpdate.rating > 5)) {
            throw new BadRequestError('Rating must be between 1 and 5');
        }

        await review.update(dataToUpdate);

        return await this.getReview(id);
    }

    static async deleteReview(id: string, userId: string, isAdmin: boolean): Promise<void> {
        const review = await this.getReview(id);

        // Check if the user is the reviewer or an admin
        if (review.reviewerId !== userId && !isAdmin) {
            throw new ForbiddenError('You are not authorized to delete this review');
        }

        await review.destroy();
    }

    static async getMarketAverageRating(marketId: string): Promise<{ averageRating: number, totalReviews: number }> {
        const result = await Review.findAndCountAll({
            where: { marketId },
            attributes: [
                [fn('AVG', col('rating')), 'averageRating'],
            ],
        });

        return {
            averageRating: parseFloat(String(result.rows[0].get('averageRating')) || '0'),
            totalReviews: result.count,
        };
    }

    static async getProductAverageRating(productId: string): Promise<{ averageRating: number, totalReviews: number }> {
        const result = await Review.findAndCountAll({
            where: { productId },
            attributes: [
                [fn('AVG', col('rating')), 'averageRating'],
            ],
        });

        return {
            averageRating: parseFloat(String(result.rows[0].get('averageRating')) || '0'),
            totalReviews: result.count,
        };
    }

    static async canUserReviewMarket(userId: string, marketId: string): Promise<boolean> {
        // Check if the user has any completed orders from this market
        const completedOrders = await Order.count({
            where: {
                customerId: userId,
                status: 'completed',
            },
            include: [
                {
                    model: ShoppingList,
                    as: 'shoppingList',
                    where: {
                        marketId,
                    },
                },
            ],
        });

        // Check if the user has already reviewed this market
        const existingReview = await Review.findOne({
            where: {
                marketId,
                reviewerId: userId,
            },
        });

        // User can review if they have completed orders and haven't yet been reviewed
        return completedOrders > 0 && !existingReview;
    }

    static async canUserReviewProduct(userId: string, productId: string): Promise<boolean> {
        // Get the product to find its market
        const product = await Product.findByPk(productId);
        if (!product) {
            throw new NotFoundError('Product not found');
        }

        // Check if the user has any completed orders from this product's market
        const completedOrders = await Order.count({
            where: {
                customerId: userId,
                status: 'completed',
            },
            include: [
                {
                    model: ShoppingList,
                    as: 'shoppingList',
                    where: {
                        marketId: product.marketId,
                    },
                },
            ],
        });

        // Check if the user has already reviewed this product
        const existingReview = await Review.findOne({
            where: {
                productId,
                reviewerId: userId,
            },
        });

        // User can review if they have completed orders and haven't yet been reviewed
        return completedOrders > 0 && !existingReview;
    }

    static async getUserReviewableItems(
        customerId: string,
        queryData?: IReviewableItemsQuery
    ): Promise<{
        markets: Market[],
        products: Product[],
        marketCount: number,
        productCount: number,
        marketTotalPages?: number,
        productTotalPages?: number
    }> {
        const { page, size, marketType, productName } = queryData || {};

        // Find all markets the user has ordered from
        const completedShoppingLists = await ShoppingList.findAll({
            where: {
                customerId,
                status: 'completed',
            },
            attributes: ['marketId'],
            group: ['marketId'],
        });

        const marketIds = completedShoppingLists.map(list => list.marketId);

        // Find markets that haven't been reviewed yet
        const reviewedMarketIds = (await Review.findAll({
            where: {
                reviewerId: customerId,
                marketId: { [Op.in]: marketIds },
            },
            attributes: ['marketId'],
        })).map(review => review.marketId);

        const reviewableMarketIds = marketIds.filter(id => !reviewedMarketIds.includes(id));

        // Build market query options
        const marketWhere: Record<string, unknown> = {
            id: { [Op.in]: reviewableMarketIds },
        };

        // Add optional market type filter
        if (marketType) {
            marketWhere.marketType = marketType;
        }

        // Prepare market query options
        const marketQueryOptions: FindAndCountOptions<Market> = {
            where: marketWhere,
            order: [['name', 'ASC']],
        };

        // Handle pagination for markets
        if (page && size && page > 0 && size > 0) {
            const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);
            marketQueryOptions.limit = limit ?? 0;
            marketQueryOptions.offset = offset ?? 0;
        }

        // Get paginated reviewable markets
        const { rows: markets, count: marketCount } = await Market.findAndCountAll(marketQueryOptions);

        // Prepare product query options
        const productWhere: Record<string, unknown> = {
            marketId: { [Op.in]: marketIds },
        };

        // Add optional product name search
        if (productName) {
            productWhere.name = { [Op.iLike]: `%${productName}%` };
        }

        // Query to get all products from these markets
        const productQueryOptions: FindAndCountOptions<Product> = {
            where: productWhere,
            include: [
                {
                    model: Review,
                    as: 'reviews',
                    where: {
                        reviewerId: customerId,
                    },
                    required: false,
                },
            ],
            order: [['name', 'ASC']],
        };

        // Handle pagination for products
        if (page && size && page > 0 && size > 0) {
            const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);
            productQueryOptions.limit = limit ?? 0;
            productQueryOptions.offset = offset ?? 0;
        }

        // Get all products and count
        const { rows: allProducts, count: productCount } = await Product.findAndCountAll(productQueryOptions);

        // Filter out products that have already been reviewed
        const reviewableProducts = allProducts.filter(product => !product.reviews?.length);

        // Calculate pagination metadata
        let marketTotalPages: number | undefined;
        let productTotalPages: number | undefined;

        if (page && size && page > 0 && size > 0) {
            const marketPagination = Pagination.estimateTotalPage({
                count: marketCount,
                limit: size,
            } as IPaging);

            const productPagination = Pagination.estimateTotalPage({
                count: productCount,
                limit: size,
            } as IPaging);

            // Extract just the totalPages number from the returned objects
            marketTotalPages = marketPagination.totalPages;
            productTotalPages = productPagination.totalPages;
        }

        return {
            markets,
            products: reviewableProducts,
            marketCount,
            productCount,
            marketTotalPages,
            productTotalPages,
        };
    }
}