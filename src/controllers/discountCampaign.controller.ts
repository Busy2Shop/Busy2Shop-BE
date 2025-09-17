import { Request, Response } from 'express';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/customErrors';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import DiscountCampaignService from '../services/discountCampaign.service';
import PriceCalculatorService from '../services/priceCalculator.service';
import SystemSettingsService from '../services/systemSettings.service';
import { IDiscountCampaign, DiscountType, DiscountTargetType, CampaignStatus } from '../models/discountCampaign.model';

export default class DiscountCampaignController {
    // Admin endpoints for managing discount campaigns

    // Get all discount campaigns (Admin only)
    static async getAllCampaigns(req: AuthenticatedRequest, res: Response) {
        const { page, size, status, type, targetType, isActive } = req.query;

        // Check if user is admin
        if (req.user?.status?.userType !== 'agent') { // Assuming admins are marked as agents with special permissions
            throw new ForbiddenError('Access denied. Admin privileges required.');
        }

        const queryParams = {
            ...(page && size ? { page: Number(page), size: Number(size) } : {}),
            ...(status && { status: status as CampaignStatus }),
            ...(type && { type: type as DiscountType }),
            ...(targetType && { targetType: targetType as DiscountTargetType }),
            ...(isActive !== undefined && { isActive: isActive === 'true' }),
        };

        const campaigns = await DiscountCampaignService.getAllCampaigns(queryParams);
        
        res.status(200).json({
            status: 'success',
            message: 'Discount campaigns retrieved successfully',
            data: campaigns,
        });
    }

    // Get campaign by ID (Admin only)
    static async getCampaignById(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;

        if (!id) {
            throw new BadRequestError('Campaign ID is required');
        }

        // Check if user is admin
        if (req.user?.status?.userType !== 'agent') {
            throw new ForbiddenError('Access denied. Admin privileges required.');
        }

        const campaign = await DiscountCampaignService.getCampaignById(id);
        
        res.status(200).json({
            status: 'success',
            message: 'Discount campaign retrieved successfully',
            data: { campaign },
        });
    }

    // Create new discount campaign (Admin only)
    static async createCampaign(req: AuthenticatedRequest, res: Response) {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        // Check if user is admin
        if (req.user?.status?.userType !== 'agent') {
            throw new ForbiddenError('Access denied. Admin privileges required.');
        }

        const campaignData: IDiscountCampaign = {
            ...req.body,
            createdBy: userId,
        };

        // Validate required fields
        if (!campaignData.name || !campaignData.type || !campaignData.targetType || 
            !campaignData.value || !campaignData.startDate || !campaignData.endDate) {
            throw new BadRequestError('Name, type, targetType, value, startDate, and endDate are required');
        }

        const campaign = await DiscountCampaignService.createCampaign(campaignData);
        
        res.status(201).json({
            status: 'success',
            message: 'Discount campaign created successfully',
            data: { campaign },
        });
    }

    // Update discount campaign (Admin only)
    static async updateCampaign(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!id) {
            throw new BadRequestError('Campaign ID is required');
        }

        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        // Check if user is admin
        if (req.user?.status?.userType !== 'agent') {
            throw new ForbiddenError('Access denied. Admin privileges required.');
        }

        // Remove fields that shouldn't be updated directly
        const updateData = { ...req.body };
        delete updateData.id;
        delete updateData.createdBy;
        delete updateData.usageCount;

        const campaign = await DiscountCampaignService.updateCampaign(id, updateData);
        
        res.status(200).json({
            status: 'success',
            message: 'Discount campaign updated successfully',
            data: { campaign },
        });
    }

    // Delete discount campaign (Admin only)
    static async deleteCampaign(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;

        if (!id) {
            throw new BadRequestError('Campaign ID is required');
        }

        // Check if user is admin
        if (req.user?.status?.userType !== 'agent') {
            throw new ForbiddenError('Access denied. Admin privileges required.');
        }

        await DiscountCampaignService.deleteCampaign(id);
        
        res.status(200).json({
            status: 'success',
            message: 'Discount campaign deleted successfully',
        });
    }

    // Activate/Deactivate campaign (Admin only)
    static async toggleCampaignStatus(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { status } = req.body;

        if (!id) {
            throw new BadRequestError('Campaign ID is required');
        }

        if (!status || !Object.values(CampaignStatus).includes(status)) {
            throw new BadRequestError('Valid status is required');
        }

        // Check if user is admin
        if (req.user?.status?.userType !== 'agent') {
            throw new ForbiddenError('Access denied. Admin privileges required.');
        }

        const campaign = await DiscountCampaignService.updateCampaignStatus(id, status);
        
        res.status(200).json({
            status: 'success',
            message: 'Campaign status updated successfully',
            data: { campaign },
        });
    }

    // User endpoints for discount functionality

    // Get available discounts for user
    static async getAvailableDiscounts(req: AuthenticatedRequest, res: Response) {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const { orderAmount, marketId, productIds } = req.query;

        const filters = {
            userId,
            ...(orderAmount && { orderAmount: Number(orderAmount) }),
            ...(marketId && { marketId: marketId as string }),
            ...(productIds && { productIds: (productIds as string).split(',') }),
        };

        const discounts = await DiscountCampaignService.getAvailableDiscountsForUser(filters);
        
        res.status(200).json({
            status: 'success',
            message: 'Available discounts retrieved successfully',
            data: { discounts },
        });
    }

    // Validate discount code
    static async validateDiscountCode(req: AuthenticatedRequest, res: Response) {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const { code, orderAmount, marketId, productIds } = req.body;

        if (!code) {
            throw new BadRequestError('Discount code is required');
        }
        
        // Enhanced security validation using centralized constraints
        const minOrderValidation = await SystemSettingsService.validateDiscountConstraints(orderAmount, 0);
        if (!minOrderValidation.valid) {
            throw new BadRequestError(minOrderValidation.error || 'Order does not meet minimum requirements for discounts');
        }

        const validation = await DiscountCampaignService.validateDiscountCode({
            code,
            userId,
            orderAmount: orderAmount || 0,
            marketId,
            productIds: productIds || [],
        });

        // Comprehensive security validation using centralized constraints
        if (validation.isValid && validation.discountAmount) {
            const discountValidation = await SystemSettingsService.validateDiscountConstraints(
                orderAmount,
                validation.discountAmount
            );

            if (!discountValidation.valid) {
                // Apply cap if available, otherwise reject
                if (discountValidation.cappedAmount) {
                    validation.discountAmount = discountValidation.cappedAmount;
                    (validation as any).warnings = (validation as any).warnings || [];
                    (validation as any).warnings.push(`Discount capped to ₦${discountValidation.cappedAmount}`);
                } else {
                    throw new BadRequestError(discountValidation.error || 'Discount amount exceeds maximum allowed');
                }
            }

            // Additional PriceCalculator validation for consistency
            const priceCalculatorValidation = PriceCalculatorService.validateDiscountConstraints(
                orderAmount,
                validation.discountAmount
            );

            if (!priceCalculatorValidation.valid) {
                throw new BadRequestError(priceCalculatorValidation.error || 'Discount validation failed');
            }
        }
        
        res.status(200).json({
            status: 'success',
            message: 'Discount code validation completed',
            data: validation,
        });
    }

    // Apply discount to order
    static async applyDiscount(req: AuthenticatedRequest, res: Response) {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const { campaignId, orderId, shoppingListId, orderTotal, items } = req.body;

        if (!campaignId || !orderTotal) {
            throw new BadRequestError('Campaign ID and order total are required');
        }

        if (!orderId && !shoppingListId) {
            throw new BadRequestError('Either order ID or shopping list ID is required');
        }

        const result = await DiscountCampaignService.applyDiscount({
            campaignId,
            userId,
            orderId,
            shoppingListId,
            orderTotal,
            items: items || [],
        });
        
        res.status(200).json({
            status: 'success',
            message: 'Discount applied successfully',
            data: result,
        });
    }

    // Get discount usage history for user
    static async getUserDiscountHistory(req: AuthenticatedRequest, res: Response) {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const { page, size } = req.query;

        const queryParams = {
            userId,
            ...(page && size ? { page: Number(page), size: Number(size) } : {}),
        };

        const history = await DiscountCampaignService.getUserDiscountHistory(queryParams);
        
        res.status(200).json({
            status: 'success',
            message: 'Discount usage history retrieved successfully',
            data: history,
        });
    }

    // Calculate discount amount for preview
    static async calculateDiscountPreview(req: AuthenticatedRequest, res: Response) {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const { campaignId, orderTotal, items, marketId } = req.body;

        if (!campaignId || !orderTotal) {
            throw new BadRequestError('Campaign ID and order total are required');
        }
        
        // Comprehensive security validation using centralized constraints
        const minOrderValidation = await SystemSettingsService.validateDiscountConstraints(orderTotal, 0);
        if (!minOrderValidation.valid) {
            throw new BadRequestError(minOrderValidation.error || 'Order does not meet minimum requirements for discounts');
        }

        const preview = await DiscountCampaignService.calculateDiscountPreview({
            campaignId,
            userId,
            orderTotal,
            items: items || [],
            marketId,
        });

        // Enhanced security validation with proper constraints
        if (preview.isEligible && preview.discountAmount) {
            const discountValidation = await SystemSettingsService.validateDiscountConstraints(
                orderTotal,
                preview.discountAmount
            );

            if (!discountValidation.valid) {
                // Apply system-defined caps rather than hardcoded values
                if (discountValidation.cappedAmount) {
                    preview.discountAmount = discountValidation.cappedAmount;
                    preview.finalTotal = orderTotal - preview.discountAmount;
                    (preview as any).warnings = (preview as any).warnings || [];
                    (preview as any).warnings.push(`Discount capped to ₦${discountValidation.cappedAmount} due to system limits`);
                } else {
                    preview.isEligible = false;
                    preview.discountAmount = 0;
                    preview.finalTotal = orderTotal;
                    (preview as any).error = discountValidation.error;
                }
            }

            // Double-check with PriceCalculator constraints
            const priceCalculatorValidation = PriceCalculatorService.validateDiscountConstraints(
                orderTotal,
                preview.discountAmount
            );

            if (!priceCalculatorValidation.valid) {
                preview.isEligible = false;
                preview.discountAmount = 0;
                preview.finalTotal = orderTotal;
                (preview as any).error = priceCalculatorValidation.error;
            }
        }
        
        res.status(200).json({
            status: 'success',
            message: 'Discount preview calculated successfully',
            data: preview,
        });
    }

    // Get campaign statistics (Admin only)
    static async getCampaignStatistics(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;

        if (!id) {
            throw new BadRequestError('Campaign ID is required');
        }

        // Check if user is admin
        if (req.user?.status?.userType !== 'agent') {
            throw new ForbiddenError('Access denied. Admin privileges required.');
        }

        const statistics = await DiscountCampaignService.getCampaignStatistics(id);
        
        res.status(200).json({
            status: 'success',
            message: 'Campaign statistics retrieved successfully',
            data: statistics,
        });
    }
}