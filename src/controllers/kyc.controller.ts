import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { BadRequestError, ForbiddenError } from '../utils/customErrors';
import CloudinaryClientConfig from '../clients/cloudinary.config';
import VendorService from '../services/vendor.service';
import UserService from '../services/user.service';

export default class KycController {
    /**
     * Upload NIN document for vendor verification
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async uploadNIN(req: AuthenticatedRequest, res: Response) {
        const { nin } = req.body;
        const { id, status } = req.user;

        // Ensure user is a vendor
        if (status.userType !== 'vendor') {
            throw new ForbiddenError('Only vendors can upload NIN documents');
        }

        // Check if email is verified
        if (!status.emailVerified) {
            throw new ForbiddenError('Please verify your email before uploading KYC documents');
        }

        // Validate NIN format
        if (!nin || !/^\d{11}$/.test(nin)) {
            throw new BadRequestError('Invalid NIN format. Must be 11 digits');
        }

        // Update vendor metadata with NIN
        const updatedUser = await VendorService.updateVendorDocuments(id, { nin });

        res.status(200).json({
            status: 'success',
            message: 'NIN uploaded successfully',
            data: {
                user: updatedUser,
            },
        });
    }

    /**
     * Upload verification images for vendor
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async uploadVerificationImages(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;

        // Ensure user is a vendor
        if (status.userType !== 'vendor') {
            throw new ForbiddenError('Only vendors can upload verification images');
        }

        // Check if email is verified
        if (!status.emailVerified) {
            throw new ForbiddenError('Please verify your email before uploading KYC documents');
        }

        // Check if files were uploaded
        if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
            throw new BadRequestError('No images uploaded');
        }

        // eslint-disable-next-line no-undef
        const files = req.files as Express.Multer.File[];
        const imageUrls: string[] = [];

        // Upload each file to Cloudinary
        for (const file of files) {
            const result = await CloudinaryClientConfig.uploadtoCloudinary({
                fileBuffer: file.buffer,
                id: id,
                name: `verification_${Date.now()}_${file.originalname}`,
                type: 'verification',
            });

            if (result.url) {
                imageUrls.push(result.url);
            }
        }

        if (imageUrls.length === 0) {
            throw new BadRequestError('Failed to upload images');
        }

        // Update vendor metadata with images
        const updatedUser = await VendorService.updateVendorDocuments(id, { images: imageUrls });

        res.status(200).json({
            status: 'success',
            message: 'Verification images uploaded successfully',
            data: {
                user: updatedUser,
            },
        });
    }

    /**
     * Get vendor verification status
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getVerificationStatus(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;

        // Ensure user is a vendor
        if (status.userType !== 'vendor') {
            throw new ForbiddenError('Only vendors can check verification status');
        }

        // Check if email is verified
        if (!status.emailVerified) {
            throw new ForbiddenError('Please verify your email before checking KYC status');
        }

        const user = await UserService.viewSingleUser(id);
        const vendorMeta = user.vendorMeta || {};

        res.status(200).json({
            status: 'success',
            message: 'Verification status retrieved successfully',
            data: {
                isVerified: user.settings?.isKycVerified || false,
                documents: {
                    nin: vendorMeta.nin ? true : false,
                    images: vendorMeta.images && vendorMeta.images.length > 0 ? true : false,
                },
            },
        });
    }
}
