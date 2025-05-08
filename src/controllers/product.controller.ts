/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import ProductService from '../services/product.service';
import MarketService from '../services/market.service';
import { BadRequestError, ForbiddenError } from '../utils/customErrors';
import CloudinaryClientConfig from '../clients/cloudinary.config';

export default class ProductController {
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
            isAvailable: true,
        });

        res.status(201).json({
            status: 'success',
            message: 'Product created successfully',
            data: newProduct,
        });
    }

    static async getAllProducts(req: Request, res: Response) {
        const { page, size, q, marketId, minPrice, maxPrice, isAvailable } = req.query;

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

        const products = await ProductService.viewProducts(queryParams);

        res.status(200).json({
            status: 'success',
            message: 'Products retrieved successfully',
            data: { ...products },
        });
    }

    static async getMarketProducts(req: Request, res: Response) {
        const { marketId } = req.params;
        const { page, size, q, minPrice, maxPrice, isAvailable } = req.query;

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

        const products = await ProductService.viewMarketProducts(marketId, queryParams);

        res.status(200).json({
            status: 'success',
            message: 'Market products retrieved successfully',
            data: { ...products },
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
}
