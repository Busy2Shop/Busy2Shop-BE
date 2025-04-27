/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-undef */
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import MarketService from '../services/market.service';
import { BadRequestError, ForbiddenError } from '../utils/customErrors';
import CloudinaryClientConfig from '../clients/cloudinary.config';

export default class MarketController {
    static async createMarket(req: AuthenticatedRequest, res: Response) {
        const {
            name,
            address,
            location,
            phoneNumber,
            marketType,
            description,
            operatingHours,
            categoryIds,
        } = req.body;

        // Handle market images upload
        const files = req.files as Express.Multer.File[] | undefined;
        const imageUrls: string[] = [];

        if (files && files.length > 0) {
            // Upload each image to Cloudinary
            for (const file of files) {
                const result = await CloudinaryClientConfig.uploadtoCloudinary({
                    fileBuffer: file.buffer,
                    id: req.user.id,
                    name: file.originalname,
                    type: 'market',
                });
                imageUrls.push(result.url as string);
            }
        }

        // Create the market
        const newMarket = await MarketService.addMarket({
            name,
            address,
            location,
            phoneNumber,
            marketType,
            description,
            images: imageUrls,
            operatingHours,
            ownerId: req.user.id,
        }, categoryIds);

        res.status(201).json({
            status: 'success',
            message: 'Market created successfully',
            data: newMarket,
        });
    }

    static async getAllMarkets(req: Request, res: Response) {
        const {
            page,
            size,
            q,
            categoryId,
            marketType,
            isPinned,
            lat,
            lng,
            distance,
        } = req.query;

        const queryParams: Record<string, unknown> = {};

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (q) queryParams.q = q as string;
        if (categoryId) queryParams.categoryId = categoryId as string;
        if (marketType) queryParams.marketType = marketType as string;

        if (isPinned !== undefined) {
            queryParams.isPinned = isPinned === 'true';
        }

        // Add location parameters if provided
        if (lat && lng) {
            queryParams.lat = Number(lat);
            queryParams.lng = Number(lng);

            // Default distance to 5 km if not specified
            queryParams.distance = distance ? Number(distance) : 5;
        }

        const markets = await MarketService.viewMarkets(queryParams);

        res.status(200).json({
            status: 'success',
            message: 'Markets retrieved successfully',
            data: { ...markets },
        });
    }

    static async getMarket(req: Request, res: Response) {
        const { id } = req.params;

        const market = await MarketService.viewSingleMarket(id);

        res.status(200).json({
            status: 'success',
            message: 'Market retrieved successfully',
            data: market,
        });
    }

    static async updateMarket(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const {
            name,
            address,
            location,
            phoneNumber,
            description,
            operatingHours,
        } = req.body;

        // Check if the user is the owner of the market
        const market = await MarketService.viewSingleMarket(id);

        if (market.ownerId !== req.user.id) {
            throw new ForbiddenError('You are not authorized to update this market');
        }

        // Handle image uploads if any
        const files = req.files as Express.Multer.File[] | undefined;
        const imageUrls: string[] = [];

        if (files && files.length > 0) {
            // Upload each new image to Cloudinary
            for (const file of files) {
                const result = await CloudinaryClientConfig.uploadtoCloudinary({
                    fileBuffer: file.buffer,
                    id: req.user.id,
                    name: file.originalname,
                    type: 'market',
                });
                imageUrls.push(result.url as string);
            }
        }

        // Prepare update data
        const updateData: Record<string, any> = {};
        if (name) updateData.name = name;
        if (address) updateData.address = address;
        if (location) updateData.location = location;
        if (phoneNumber) updateData.phoneNumber = phoneNumber;
        if (description) updateData.description = description;
        if (operatingHours) updateData.operatingHours = operatingHours;

        // Only update images if new ones were uploaded
        if (imageUrls.length > 0) {
            // Check if we should append or replace images
            const appendImages = req.body.appendImages === 'true';

            if (appendImages && market.images) {
                updateData.images = [...market.images, ...imageUrls];
            } else {
                updateData.images = imageUrls;
            }
        }

        const updatedMarket = await MarketService.updateMarket(id, updateData);

        res.status(200).json({
            status: 'success',
            message: 'Market updated successfully',
            data: updatedMarket,
        });
    }

    static async deleteMarket(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;

        // Check if the user is the owner of the market
        const market = await MarketService.viewSingleMarket(id);

        if (market.ownerId !== req.user.id) {
            throw new ForbiddenError('You are not authorized to delete this market');
        }

        await MarketService.deleteMarket(id);

        res.status(200).json({
            status: 'success',
            message: 'Market deleted successfully',
            data: null,
        });
    }

    //Admin only
    static async toggleMarketPin(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;

        // Only admins should be able to pin/unpin markets
        // if (req.user.status.userType !== 'ADMIN') {
        //     throw new ForbiddenError('Only admins can pin/unpin markets');
        // }

        const market = await MarketService.toggleMarketPinned(id);

        res.status(200).json({
            status: 'success',
            message: `Market ${market.isPinned ? 'pinned' : 'unpinned'} successfully`,
            data: market,
        });
    }

    static async addToCategory(req: AuthenticatedRequest, res: Response) {
        const { marketId, categoryId } = req.body;

        if (!marketId || !categoryId) {
            throw new BadRequestError('Market ID and Category ID are required');
        }

        // Check if the user is the owner of the market
        // const market = await MarketService.viewSingleMarket(marketId);

        // if (market.ownerId !== req.user.id && req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('You are not authorized to update this market');
        // }

        await MarketService.addMarketToCategory(marketId, categoryId);

        res.status(200).json({
            status: 'success',
            message: 'Market added to category successfully',
            data: null,
        });
    }

    static async removeFromCategory(req: AuthenticatedRequest, res: Response) {
        const { marketId, categoryId } = req.params;

        if (!marketId || !categoryId) {
            throw new BadRequestError('Market ID and Category ID are required');
        }

        // Check if the user is the owner of the market
        // const market = await MarketService.viewSingleMarket(marketId);

        // if (market.ownerId !== req.user.id && req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('You are not authorized to update this market');
        // }

        await MarketService.removeMarketFromCategory(marketId, categoryId);

        res.status(200).json({
            status: 'success',
            message: 'Market removed from category successfully',
            data: null,
        });
    }
}