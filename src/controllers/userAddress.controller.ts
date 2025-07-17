import { Request, Response } from 'express';
import { BadRequestError, NotFoundError } from '../utils/customErrors';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import UserAddressService from '../services/userAddress.service';
import { IUserAddress, AddressType } from '../models/userAddress.model';

export default class UserAddressController {
    // Get all addresses for authenticated user
    static async getUserAddresses(req: AuthenticatedRequest, res: Response) {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const addresses = await UserAddressService.getUserAddresses(userId);
        
        res.status(200).json({
            status: 'success',
            message: 'User addresses retrieved successfully',
            data: { addresses },
        });
    }

    // Get single address by ID
    static async getAddressById(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!id) {
            throw new BadRequestError('Address ID is required');
        }

        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const address = await UserAddressService.getAddressById(id, userId);
        
        res.status(200).json({
            status: 'success',
            message: 'Address retrieved successfully',
            data: { address },
        });
    }

    // Create new address
    static async createAddress(req: AuthenticatedRequest, res: Response) {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const addressData: IUserAddress = {
            ...req.body,
            userId,
        };

        // Validate required fields
        if (!addressData.title || !addressData.address || !addressData.city || !addressData.state) {
            throw new BadRequestError('Title, address, city, and state are required');
        }

        const address = await UserAddressService.createAddress(addressData);
        
        res.status(201).json({
            status: 'success',
            message: 'Address created successfully',
            data: { address },
        });
    }

    // Update existing address
    static async updateAddress(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!id) {
            throw new BadRequestError('Address ID is required');
        }

        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        // Remove userId from update data to prevent unauthorized changes
        const updateData = { ...req.body };
        delete updateData.userId;
        delete updateData.id;

        const address = await UserAddressService.updateAddress(id, userId, updateData);
        
        res.status(200).json({
            status: 'success',
            message: 'Address updated successfully',
            data: { address },
        });
    }

    // Delete address
    static async deleteAddress(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!id) {
            throw new BadRequestError('Address ID is required');
        }

        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        await UserAddressService.deleteAddress(id, userId);
        
        res.status(200).json({
            status: 'success',
            message: 'Address deleted successfully',
        });
    }

    // Set address as default
    static async setDefaultAddress(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!id) {
            throw new BadRequestError('Address ID is required');
        }

        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const address = await UserAddressService.setDefaultAddress(id, userId);
        
        res.status(200).json({
            status: 'success',
            message: 'Default address updated successfully',
            data: { address },
        });
    }

    // Get default address for user
    static async getDefaultAddress(req: AuthenticatedRequest, res: Response) {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const address = await UserAddressService.getDefaultAddress(userId);
        
        res.status(200).json({
            status: 'success',
            message: 'Default address retrieved successfully',
            data: { address },
        });
    }

    // Validate address (geocoding, etc.)
    static async validateAddress(req: AuthenticatedRequest, res: Response) {
        const { address, city, state, country } = req.body;

        if (!address || !city || !state) {
            throw new BadRequestError('Address, city, and state are required for validation');
        }

        const validationResult = await UserAddressService.validateAddress({
            address,
            city,
            state,
            country: country || 'Nigeria',
        });
        
        res.status(200).json({
            status: 'success',
            message: 'Address validation completed',
            data: validationResult,
        });
    }

    // Create address from Google Places data
    static async createFromGooglePlace(req: AuthenticatedRequest, res: Response) {
        const userId = req.user?.id;
        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const { googlePlaceData, title } = req.body;

        if (!googlePlaceData) {
            throw new BadRequestError('Google Place data is required');
        }

        const address = await UserAddressService.createAddressFromGooglePlace(
            userId,
            googlePlaceData,
            title
        );
        
        res.status(201).json({
            status: 'success',
            message: 'Address created from Google Place successfully',
            data: { address },
        });
    }

    // Mark address as used (when selected for delivery)
    static async markAsUsed(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const userId = req.user?.id;

        if (!id) {
            throw new BadRequestError('Address ID is required');
        }

        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const address = await UserAddressService.markAddressAsUsed(id, userId);
        
        res.status(200).json({
            status: 'success',
            message: 'Address marked as used',
            data: { address },
        });
    }
}