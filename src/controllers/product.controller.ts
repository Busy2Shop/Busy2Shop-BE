/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import ProductService from '../services/product.service';
import MarketService from '../services/market.service';
import { BadRequestError, ForbiddenError } from '../utils/customErrors';
import CloudinaryClientConfig from '../clients/cloudinary.config';

export default class ProductController {
    // TEST METHOD - BYPASS AUTHENTICATION
    static async testCreateProduct(req: Request, res: Response) {
        const {
            name,
            description,
            price,
            discountPrice,
            marketId,
            barcode,
            sku,
            stockQuantity,
            attributes,
            isPinned = false,
            isAvailable = false,
        } = req.body;

        if (!name || !price || !marketId) {
            throw new BadRequestError('Product name, price, and market ID are required');
        }

        // Skip market ownership check for testing
        const newProduct = await ProductService.addProduct({
            name,
            description,
            price: parseFloat(price),
            discountPrice: discountPrice ? parseFloat(discountPrice) : undefined,
            marketId,
            barcode,
            sku,
            stockQuantity: stockQuantity ? parseInt(stockQuantity) : undefined,
            attributes: typeof attributes === 'string' ? JSON.parse(attributes) : attributes,
            images: [],
            isAvailable: isAvailable === true || isAvailable === 'true',
            isPinned: isPinned === true || isPinned === 'true',
        });

        res.status(201).json({
            status: 'success',
            message: 'Test product created successfully',
            data: newProduct,
        });
    }

    // TEST METHOD - BULK CREATE WITHOUT AUTHENTICATION
    static async testBulkCreateProducts(req: Request, res: Response) {
        const { products } = req.body;

        if (!products || !Array.isArray(products) || products.length === 0) {
            throw new BadRequestError('Please provide an array of products');
        }

        // Validate required fields for each product
        for (const product of products) {
            if (!product.name || !product.price || !product.marketId) {
                throw new BadRequestError(
                    'Product name, price, and market ID are required for all products',
                );
            }
        }

        // Convert attributes if they're strings
        const processedProducts = products.map(product => ({
            ...product,
            attributes: typeof product.attributes === 'string' ? JSON.parse(product.attributes) : product.attributes,
            isAvailable: product.isAvailable === true || product.isAvailable === 'true',
            isPinned: product.isPinned === true || product.isPinned === 'true',
        }));

        // Using test method to skip validations
        const createdProducts = await ProductService.testBulkAddProducts(processedProducts);

        res.status(201).json({
            status: 'success',
            message: `${createdProducts.length} test products created successfully`,
            data: createdProducts,
        });
    }

    static async createProduct(req: AuthenticatedRequest, res: Response) {
        const {
            name,
            description,
            price,
            discountPrice,
            marketId,
            barcode,
            sku,
            stockQuantity,
            attributes,
            isPinned = false, // Allow setting isPinned during creation
            isAvailable = false, // Default to false for review workflow
        } = req.body;

        if (!name || !price || !marketId) {
            throw new BadRequestError('Product name, price, and market ID are required');
        }

        // Verify the user owns the market
        const market = await MarketService.viewSingleMarket(marketId);
        if (market.ownerId !== req.user.id) {
            throw new ForbiddenError('You do not have permission to add products to this market');
        }

        // Handle product images upload
        const files = req.files as Express.Multer.File[] | undefined;
        const imageUrls: string[] = [];

        if (files && files.length > 0) {
            // Upload each image to Cloudinary
            for (const file of files) {
                const result = await CloudinaryClientConfig.uploadtoCloudinary({
                    fileBuffer: file.buffer,
                    id: req.user.id,
                    name: file.originalname,
                    type: 'product',
                });
                imageUrls.push(result.url as string);
            }
        }

        // Create the product
        const newProduct = await ProductService.addProduct({
            name,
            description,
            price: parseFloat(price),
            discountPrice: discountPrice ? parseFloat(discountPrice) : undefined,
            marketId,
            barcode,
            sku,
            stockQuantity: stockQuantity ? parseInt(stockQuantity) : undefined,
            attributes,
            images: imageUrls,
            isAvailable: isAvailable === true || isAvailable === 'true', // Respect frontend setting
            isPinned: isPinned === true || isPinned === 'true', // Allow admin to pin during creation
        });

        res.status(201).json({
            status: 'success',
            message: 'Product created successfully',
            data: newProduct,
        });
    }

    static async getAllProducts(req: Request, res: Response) {
        const {
            page,
            size,
            q,
            marketId,
            minPrice,
            maxPrice,
            isAvailable,
            isPinned,
            sortBy = 'relevance',
        } = req.query;

        const queryParams: Record<string, unknown> = {};

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (q) queryParams.q = q as string;
        if (marketId) queryParams.marketId = marketId as string;

        if (minPrice) queryParams.minPrice = parseFloat(minPrice as string);
        if (maxPrice) queryParams.maxPrice = parseFloat(maxPrice as string);

        if (isAvailable !== undefined) {
            queryParams.isAvailable = isAvailable === 'true';
        }

        if (isPinned !== undefined) {
            queryParams.isPinned = isPinned === 'true';
        }

        queryParams.sortBy = sortBy as string;

        const products = await ProductService.viewProducts(queryParams);

        res.status(200).json({
            status: 'success',
            message: 'Products retrieved successfully',
            data: {
                ...products,
                filters: {
                    isPinned: isPinned === 'true',
                    isAvailable: isAvailable === 'true',
                    priceRange: minPrice || maxPrice ? { min: minPrice, max: maxPrice } : null,
                    sortBy,
                },
            },
        });
    }

    static async getMarketProducts(req: Request, res: Response) {
        const { marketId } = req.params;
        const {
            page,
            size,
            q,
            minPrice,
            maxPrice,
            isAvailable,
            isPinned,
            sortBy = 'featured_first',
        } = req.query;

        const queryParams: Record<string, unknown> = {};

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (q) queryParams.q = q as string;

        if (minPrice) queryParams.minPrice = parseFloat(minPrice as string);
        if (maxPrice) queryParams.maxPrice = parseFloat(maxPrice as string);

        if (isAvailable !== undefined) {
            queryParams.isAvailable = isAvailable === 'true';
        }

        if (isPinned !== undefined) {
            queryParams.isPinned = isPinned === 'true';
        }

        queryParams.sortBy = sortBy as string;

        const products = await ProductService.viewMarketProducts(marketId, queryParams);

        res.status(200).json({
            status: 'success',
            message: 'Market products retrieved successfully',
            data: {
                ...products,
                marketId,
                filters: {
                    isPinned: isPinned === 'true',
                    isAvailable: isAvailable === 'true',
                    priceRange: minPrice || maxPrice ? { min: minPrice, max: maxPrice } : null,
                    sortBy,
                },
            },
        });
    }

    static async getFeaturedProducts(req: Request, res: Response) {
        const {
            page,
            size,
            marketId,
            categoryId,
            minPrice,
            maxPrice,
        } = req.query;

        const queryParams: Record<string, unknown> = {
            isPinned: true, // Only get pinned/featured products
            isAvailable: true, // Only available products
            sortBy: 'featured_priority',
        };

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (marketId) queryParams.marketId = marketId as string;
        if (categoryId) queryParams.categoryId = categoryId as string;

        if (minPrice) queryParams.minPrice = parseFloat(minPrice as string);
        if (maxPrice) queryParams.maxPrice = parseFloat(maxPrice as string);

        const products = await ProductService.viewProducts(queryParams);

        res.status(200).json({
            status: 'success',
            message: 'Featured products retrieved successfully',
            data: {
                ...products,
                featured: true,
                algorithm: 'pinned_products_priority',
            },
        });
    }

    static async getProduct(req: Request, res: Response) {
        const { id } = req.params;

        const product = await ProductService.getProduct(id);

        res.status(200).json({
            status: 'success',
            message: 'Product retrieved successfully',
            data: product,
        });
    }

    static async updateProduct(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const {
            name,
            description,
            price,
            discountPrice,
            barcode,
            sku,
            stockQuantity,
            attributes,
            isAvailable,
            isPinned, // Allow updating pin status
        } = req.body;

        // Handle product images upload
        const files = req.files as Express.Multer.File[] | undefined;
        const imageUrls: string[] = [];

        if (files && files.length > 0) {
            // Upload each new image to Cloudinary
            for (const file of files) {
                const result = await CloudinaryClientConfig.uploadtoCloudinary({
                    fileBuffer: file.buffer,
                    id: req.user.id,
                    name: file.originalname,
                    type: 'product',
                });
                imageUrls.push(result.url as string);
            }
        }

        // Prepare update data
        const updateData: Record<string, any> = {};
        if (name) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (price) updateData.price = parseFloat(price);
        if (discountPrice !== undefined) {
            updateData.discountPrice = discountPrice ? parseFloat(discountPrice) : null;
        }
        if (barcode !== undefined) updateData.barcode = barcode;
        if (sku !== undefined) updateData.sku = sku;
        if (stockQuantity !== undefined) updateData.stockQuantity = parseInt(stockQuantity);
        if (attributes !== undefined) updateData.attributes = attributes;
        if (isAvailable !== undefined) updateData.isAvailable = isAvailable === 'true';
        if (isPinned !== undefined) updateData.isPinned = isPinned === 'true';

        // Only update images if new ones were uploaded
        if (imageUrls.length > 0) {
            // Check if we should append or replace images
            const appendImages = req.body.appendImages === 'true';

            if (appendImages) {
                const product = await ProductService.getProduct(id);
                updateData.images = [...(product.images || []), ...imageUrls];
            } else {
                updateData.images = imageUrls;
            }
        }

        const updatedProduct = await ProductService.updateProduct(id, req.user.id, updateData);

        res.status(200).json({
            status: 'success',
            message: 'Product updated successfully',
            data: updatedProduct,
        });
    }

    static async deleteProduct(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;

        await ProductService.deleteProduct(id, req.user.id);

        res.status(200).json({
            status: 'success',
            message: 'Product deleted successfully',
            data: null,
        });
    }

    static async toggleProductAvailability(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;

        const product = await ProductService.toggleProductAvailability(id, req.user.id);

        res.status(200).json({
            status: 'success',
            message: `Product ${product.isAvailable ? 'enabled' : 'disabled'} successfully`,
            data: product,
        });
    }

    /**
     * Toggle product pin status (Admin only)
     */
    static async toggleProductPin(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;

        // Only admins should be able to pin/unpin products
        // if (req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('Only admins can pin/unpin products');
        // }

        const product = await ProductService.toggleProductPin(id);

        res.status(200).json({
            status: 'success',
            message: `Product ${product.isPinned ? 'pinned as featured' : 'unpinned'} successfully`,
            data: product,
            action: product.isPinned ? 'pinned' : 'unpinned',
        });
    }

    /**
     * Bulk pin/unpin products (Admin only)
     */
    static async bulkToggleProductPin(req: AuthenticatedRequest, res: Response) {
        const { productIds, action } = req.body;

        // Only admins should be able to bulk pin/unpin products
        // if (req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('Only admins can bulk pin/unpin products');
        // }

        if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
            throw new BadRequestError('Product IDs array is required');
        }

        if (!action || !['pin', 'unpin'].includes(action)) {
            throw new BadRequestError('Action must be either "pin" or "unpin"');
        }

        const isPinned = action === 'pin';
        const updatedProducts = await ProductService.bulkUpdateProductPin(productIds, isPinned);

        res.status(200).json({
            status: 'success',
            message: `${updatedProducts.length} products ${action}ned successfully`,
            data: {
                updatedProducts,
                count: updatedProducts.length,
                action: action,
            },
        });
    }

    /**
     * Get pinned/featured products analytics (Admin only)
     */
    static async getFeaturedProductsAnalytics(req: AuthenticatedRequest, res: Response) {
        // Only admins should access analytics
        // if (req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('Only admins can access product analytics');
        // }

        const analytics = await ProductService.getFeaturedProductsAnalytics();

        res.status(200).json({
            status: 'success',
            message: 'Featured products analytics retrieved successfully',
            data: analytics,
            meta: {
                generatedAt: new Date().toISOString(),
                type: 'featured_products_analytics',
            },
        });
    }

    static async bulkCreateProducts(req: AuthenticatedRequest, res: Response) {
        const { products } = req.body;

        if (!products || !Array.isArray(products) || products.length === 0) {
            throw new BadRequestError('Please provide an array of products');
        }

        // Validate required fields for each product
        for (const product of products) {
            if (!product.name || !product.price || !product.marketId) {
                throw new BadRequestError(
                    'Product name, price, and market ID are required for all products',
                );
            }
        }

        const createdProducts = await ProductService.bulkAddProducts(products, req.user.id);

        res.status(201).json({
            status: 'success',
            message: `${createdProducts.length} products created successfully`,
            data: createdProducts,
        });
    }

    /**
     * Get product performance metrics (for market owners)
     */
    static async getProductPerformance(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { timeframe = '30d' } = req.query;

        const performance = await ProductService.getProductPerformance(id, req.user.id, timeframe as string);

        res.status(200).json({
            status: 'success',
            message: 'Product performance metrics retrieved successfully',
            data: {
                ...performance,
                timeframe,
                productId: id,
            },
        });
    }

    /**
     * Smart product recommendations for market owners
     */
    static async getProductRecommendationsForMarket(req: AuthenticatedRequest, res: Response) {
        const { marketId } = req.params;
        const { limit = 10 } = req.query;

        // Verify the user owns the market
        const market = await MarketService.viewSingleMarket(marketId);
        if (market.ownerId !== req.user.id) {
            throw new ForbiddenError('You do not have permission to view recommendations for this market');
        }

        const recommendations = await ProductService.getSmartProductRecommendations(
            marketId,
            parseInt(limit as string)
        );

        res.status(200).json({
            status: 'success',
            message: 'Smart product recommendations retrieved successfully',
            data: {
                recommendations,
                count: recommendations.length,
                marketId,
                algorithm: 'market_gap_analysis_with_demand_prediction',
            },
        });
    }

    /**
     * Get product statistics (Admin function)
     */
    static async getProductStats(req: Request, res: Response) {
        const stats = await ProductService.getProductStats();

        res.status(200).json({
            status: 'success',
            message: 'Product statistics retrieved successfully',
            data: stats,
        });
    }
}