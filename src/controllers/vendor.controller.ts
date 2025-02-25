import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import VendorService from '../services/vendor.service';
import { BadRequestError } from '../utils/customErrors';

export default class VendorController {
    static async getAllVendors(req: Request, res: Response) {
        const { page, size, q, isActive, lat, lng, distance } = req.query;

        const queryParams: Record<string, unknown> = {};

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (q) queryParams.q = q as string;

        if (isActive !== undefined) {
            queryParams.isActive = isActive === 'true';
        }

        // Handle location-based search if coordinates are provided
        if (lat && lng) {
            queryParams.lat = Number(lat);
            queryParams.lng = Number(lng);
            queryParams.distance = distance ? Number(distance) : 5; // Default 5km radius

            const vendors = await VendorService.getNearbyVendors(
                Number(lat),
                Number(lng),
                queryParams.distance as number,
                queryParams
            );

            res.status(200).json({
                status: 'success',
                message: 'Nearby vendors retrieved successfully',
                data: { ...vendors },
            });
        } else {
            // Regular search without location
            const vendors = await VendorService.getVendors(queryParams);

            res.status(200).json({
                status: 'success',
                message: 'Vendors retrieved successfully',
                data: { ...vendors },
            });
        }
    }

    static async getVendorProfile(req: Request, res: Response) {
        const { id } = req.params;

        const vendor = await VendorService.getVendorById(id);

        res.status(200).json({
            status: 'success',
            message: 'Vendor profile retrieved successfully',
            data: vendor,
        });
    }

    // admin only
    static async getVendorStats(req: AuthenticatedRequest, res: Response) {
        // If a specific vendor ID is provided and user is admin, use that
        // Otherwise use the authenticated user's ID
        const { id } = req.params;
        let vendorId = req.user.id;

        if (id && id !== req.user.id) {
            // Only admins can view other vendors' stats
            // if (req.user.status.userType !== 'admin') {
            //     throw new ForbiddenError('You are not authorized to view this vendor\'s stats');
            // }
            vendorId = id;
        }

        // Check if the user is a vendor
        // if (req.user.status.userType !== 'vendor' && req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('Only vendors and admins can access vendor stats');
        // }

        const stats = await VendorService.getVendorStats(vendorId);

        res.status(200).json({
            status: 'success',
            message: 'Vendor stats retrieved successfully',
            data: stats,
        });
    }

    static async getAvailableVendorsForOrder(req: AuthenticatedRequest, res: Response) {
        // Only admins can see available vendors for an order
        // if (req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('Only admins can view available vendors for orders');
        // }

        const { shoppingListId } = req.params;

        if (!shoppingListId) {
            throw new BadRequestError('Shopping list ID is required');
        }

        const vendors = await VendorService.getAvailableVendorsForOrder(shoppingListId);

        res.status(200).json({
            status: 'success',
            message: 'Available vendors retrieved successfully',
            data: vendors,
        });
    }

    static async assignOrderToVendor(req: AuthenticatedRequest, res: Response) {
        // Only admins can manually assign orders to vendors
        // if (req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('Only admins can manually assign orders to vendors');
        // }

        const { orderId } = req.params;
        const { vendorId } = req.body;

        if (!vendorId) {
            throw new BadRequestError('Vendor ID is required');
        }

        const order = await VendorService.assignOrderToVendor(orderId, vendorId);

        res.status(200).json({
            status: 'success',
            message: 'Order assigned to vendor successfully',
            data: order,
        });
    }
}