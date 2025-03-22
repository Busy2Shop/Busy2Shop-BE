/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, Response } from 'express';
import { AdminAuthenticatedRequest, AuthenticatedRequest } from '../middlewares/authMiddleware';
import ProductService from '../services/product.service';
import MarketService from '../services/market.service';
import { BadRequestError, ForbiddenError } from '../utils/customErrors';
import CloudinaryClientConfig from '../clients/cloudinary.config';

export default class ProductController {
    static async createProduct(req: Request, res: Response) {
        // Determine if this is a regular user or admin request
        const isAdminRequest = 'adminType' in req;
        const userId = isAdminRequest ? (req as AdminAuthenticatedRequest).adminId : (req as AuthenticatedRequest).user.id;
    
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
    
        // Check permission for the market
        if (isAdminRequest && (req as AdminAuthenticatedRequest).adminType === 'vendor') {
            // Vendor admin check - must match their assigned supermarket
            if ((req as AdminAuthenticatedRequest).supermarketId !== marketId) {
                throw new ForbiddenError('You do not have permission to add products to this market');
            }
        } else {
            // Regular user check - must own the market
            const market = await MarketService.viewSingleMarket(marketId);
            if (market.ownerId !== userId) {
                throw new ForbiddenError('You do not have permission to add products to this market');
            }
        }
    
        // Handle product images upload
        const files = req.files as Express.Multer.File[] | undefined;
        const imageUrls: string[] = [];
    
        if (!userId) {
            throw new BadRequestError('User ID is required');
        }
    
        if (files && files.length > 0) {
            // Upload each image to Cloudinary
            for (const file of files) {
                const result = await CloudinaryClientConfig.uploadtoCloudinary({
                    fileBuffer: file.buffer,
                    id: userId,
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
            createdBy: userId, // Track who created it
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

    static async updateProduct(req: Request, res: Response) {
        // Determine if this is a regular user or admin request
        const isAdminRequest = 'adminType' in req;
        const userId = isAdminRequest ? (req as AdminAuthenticatedRequest).adminId : (req as AuthenticatedRequest).user.id;
    
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
    
        // Get the product to check permission
        const product = await ProductService.getProduct(id);
        
        // Check permission for the product's market
        if (isAdminRequest && (req as AdminAuthenticatedRequest).adminType === 'vendor') {
            // Vendor admin check - must match their assigned supermarket
            if ((req as AdminAuthenticatedRequest).supermarketId !== product.marketId) {
                throw new ForbiddenError('You do not have permission to update products in this market');
            }
        } else {
            // Regular user check - must own the market
            const market = await MarketService.viewSingleMarket(product.marketId);
            if (market.ownerId !== userId) {
                throw new ForbiddenError('You do not have permission to update products in this market');
            }
        }
    
        // Handle product images upload
        const files = req.files as Express.Multer.File[] | undefined;
        const imageUrls: string[] = [];
    
        if (files && files.length > 0) {
            // Upload each new image to Cloudinary
            for (const file of files) {
                if (!userId) {
                    throw new BadRequestError('User ID is required');
                }
                const result = await CloudinaryClientConfig.uploadtoCloudinary({
                    fileBuffer: file.buffer,
                    id: userId, // Use the determined userId
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

        if (!userId) {
            throw new BadRequestError('User ID is required');
        }
    
        // Only update images if new ones were uploaded
        if (imageUrls.length > 0) {
            // Check if we should append or replace images
            const appendImages = req.body.appendImages === 'true';
    
            if (appendImages) {
                updateData.images = [...(product.images || []), ...imageUrls];
            } else {
                updateData.images = imageUrls;
            }
        }
    
        // Use a single service method that can handle both user types
        const updatedProduct = await ProductService.updateProduct(id, userId, updateData);
    
        res.status(200).json({
            status: 'success',
            message: 'Product updated successfully',
            data: updatedProduct,
        });
    }

    static async deleteProduct(req: Request, res: Response) {
        // Determine if this is a regular user or admin request
        const isAdminRequest = 'adminType' in req;
        const userId = isAdminRequest ? (req as AdminAuthenticatedRequest).adminId : (req as AuthenticatedRequest).user.id;
        
        const { id } = req.params;
        
        // Get the product to check market permission
        const product = await ProductService.getProduct(id);
        
        // Check permission for the product's market
        if (isAdminRequest && (req as AdminAuthenticatedRequest).adminType === 'vendor') {
            // Vendor admin check - must match their assigned supermarket
            if ((req as AdminAuthenticatedRequest).supermarketId !== product.marketId) {
                throw new ForbiddenError('You do not have permission to delete products in this market');
            }
        } else {
            // Regular user check - must own the market
            const market = await MarketService.viewSingleMarket(product.marketId);
            if (market.ownerId !== userId) {
                throw new ForbiddenError('You do not have permission to delete products in this market');
            }
        }
        
        if (!userId) {
            throw new BadRequestError('User ID is required');
        }
    
        // Use the same service method with the determined userId
        await ProductService.deleteProduct(id, userId);
    
        res.status(200).json({
            status: 'success',
            message: 'Product deleted successfully',
            data: null,
        });
    }

    static async toggleProductAvailability(req: Request, res: Response) {
        // Determine if this is a regular user or admin request
        const isAdminRequest = 'adminType' in req;
        const userId = isAdminRequest ? (req as AdminAuthenticatedRequest).adminId : (req as AuthenticatedRequest).user.id;
        
        const { id } = req.params;
        
        // Get the product to check market permission
        const product = await ProductService.getProduct(id);
        
        // Check permission for the product's market
        if (isAdminRequest && (req as AdminAuthenticatedRequest).adminType === 'vendor') {
            // Vendor admin check - must match their assigned supermarket
            if ((req as AdminAuthenticatedRequest).supermarketId !== product.marketId) {
                throw new ForbiddenError('You do not have permission to modify products in this market');
            }
        } else {
            // Regular user check - must own the market
            const market = await MarketService.viewSingleMarket(product.marketId);
            if (market.ownerId !== userId) {
                throw new ForbiddenError('You do not have permission to modify products in this market');
            }
        }
        
        if (!userId) {
            throw new BadRequestError('User ID is required');
        }
    
        // Use the same service method with the determined userId
        const updatedProduct = await ProductService.toggleProductAvailability(id, userId);
    
        res.status(200).json({
            status: 'success',
            message: `Product ${updatedProduct.isAvailable ? 'enabled' : 'disabled'} successfully`,
            data: updatedProduct,
        });
    }

    static async bulkCreateProducts(req: Request, res: Response) {
        // Determine if this is a regular user or admin request
        const isAdminRequest = 'adminType' in req;
        const userId = isAdminRequest ? (req as AdminAuthenticatedRequest).adminId : (req as AuthenticatedRequest).user.id;
        
        const { products } = req.body;
    
        if (!products || !Array.isArray(products) || products.length === 0) {
            throw new BadRequestError('Please provide an array of products');
        }
    
        // Validate required fields and market permissions for each product
        for (const product of products) {
            if (!product.name || !product.price || !product.marketId) {
                throw new BadRequestError('Product name, price, and market ID are required for all products');
            }
            
            // Check permission for the market
            if (isAdminRequest && (req as AdminAuthenticatedRequest).adminType === 'vendor') {
                // Vendor admin check - must match their assigned supermarket
                if ((req as AdminAuthenticatedRequest).supermarketId !== product.marketId) {
                    throw new ForbiddenError(`You do not have permission to add products to market ${product.marketId}`);
                }
            } else {
                // Regular user check - must own the market
                const market = await MarketService.viewSingleMarket(product.marketId);
                if (market.ownerId !== userId) {
                    throw new ForbiddenError(`You do not have permission to add products to market ${product.marketId}`);
                }
            }
            
            // Set the creator for this product
            product.createdBy = userId;
        }
        
        if (!userId) {
            throw new BadRequestError('User ID is required');
        }
    
        // Use the same service method with the determined userId
        const createdProducts = await ProductService.bulkAddProducts(products, userId);
    
        res.status(201).json({
            status: 'success',
            message: `${createdProducts.length} products created successfully`,
            data: createdProducts,
        });
    }
}