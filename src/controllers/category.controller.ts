/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-undef */
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import CategoryService from '../services/category.service';
import { BadRequestError } from '../utils/customErrors';
import CloudinaryClientConfig from '../clients/cloudinary.config';

export default class CategoryController {
    //Admin
    static async createCategory(req: AuthenticatedRequest, res: Response) {
        // Only admins can create categories
        // if (req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('Only admins can create categories');
        // }

        const { name, description, icon } = req.body;

        if (!name) {
            throw new BadRequestError('Category name is required');
        }

        // Handle category images upload
        const files = req.files as Express.Multer.File[] | undefined;
        const imageUrls: string[] = [];

        if (files && files.length > 0) {
            // Upload each image to Cloudinary
            for (const file of files) {
                const result = await CloudinaryClientConfig.uploadtoCloudinary({
                    fileBuffer: file.buffer,
                    id: req.user.id,
                    name: file.originalname,
                    type: 'category',
                });
                imageUrls.push(result.url as string);
            }
        }

        // Create the category
        const newCategory = await CategoryService.addCategory({
            name,
            description,
            icon,
            images: imageUrls,
        });

        res.status(201).json({
            status: 'success',
            message: 'Category created successfully',
            data: newCategory,
        });
    }

    static async getAllCategories(req: Request, res: Response) {
        const { page, size, q, isPinned } = req.query;

        const queryParams: Record<string, unknown> = {};

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (q) queryParams.q = q as string;

        if (isPinned !== undefined) {
            queryParams.isPinned = isPinned === 'true';
        }

        const categories = await CategoryService.viewCategories(queryParams);

        res.status(200).json({
            status: 'success',
            message: 'Categories retrieved successfully',
            data: { ...categories },
        });
    }

    static async getCategory(req: Request, res: Response) {
        const { id } = req.params;

        const category = await CategoryService.viewSingleCategory(id);

        res.status(200).json({
            status: 'success',
            message: 'Category retrieved successfully',
            data: category,
        });
    }

    static async updateCategory(req: AuthenticatedRequest, res: Response) {
        // Only admins can update categories
        // if (req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('Only admins can update categories');
        // }

        const { id } = req.params;
        const { name, description, icon } = req.body;

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
                    type: 'category',
                });
                imageUrls.push(result.url as string);
            }
        }

        // Prepare update data
        const updateData: Record<string, any> = {};
        if (name) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (icon !== undefined) updateData.icon = icon;

        // Only update images if new ones were uploaded
        if (imageUrls.length > 0) {
            // Check if we should append or replace images
            const appendImages = req.body.appendImages === 'true';

            if (appendImages) {
                const category = await CategoryService.viewSingleCategory(id);
                updateData.images = [...(category.images || []), ...imageUrls];
            } else {
                updateData.images = imageUrls;
            }
        }

        const updatedCategory = await CategoryService.updateCategory(id, updateData);

        res.status(200).json({
            status: 'success',
            message: 'Category updated successfully',
            data: updatedCategory,
        });
    }

    static async deleteCategory(req: AuthenticatedRequest, res: Response) {
        // Only admins can delete categories
        // if (req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('Only admins can delete categories');
        // }

        const { id } = req.params;

        await CategoryService.deleteCategory(id);

        res.status(200).json({
            status: 'success',
            message: 'Category deleted successfully',
            data: null,
        });
    }

    static async toggleCategoryPin(req: AuthenticatedRequest, res: Response) {
        // Only admins can pin/unpin categories
        // if (req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('Only admins can pin/unpin categories');
        // }

        const { id } = req.params;

        const category = await CategoryService.toggleCategoryPinned(id);

        res.status(200).json({
            status: 'success',
            message: `Category ${category.isPinned ? 'pinned' : 'unpinned'} successfully`,
            data: category,
        });
    }

    static async getMarketsByCategory(req: Request, res: Response) {
        const { id } = req.params;
        const { page, size } = req.query;

        let pagination;
        if (page && size) {
            pagination = {
                page: Number(page),
                size: Number(size),
            };
        }

        const markets = await CategoryService.getMarketsByCategory(id, pagination);

        res.status(200).json({
            status: 'success',
            message: 'Markets retrieved successfully',
            data: { ...markets },
        });
    }
}