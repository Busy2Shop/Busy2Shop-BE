import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { BadRequestError, ForbiddenError } from '../utils/customErrors';
import CloudinaryClientConfig from '../clients/cloudinary.config';
import AgentService from '../services/agent.service';
import UserService from '../services/user.service';
import UserSettings, { IAgentMeta } from '../models/userSettings.model';

export default class KycController {
    /**
     * Upload NIN document for agent verification
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async uploadNIN(req: AuthenticatedRequest, res: Response) {
        const { nin } = req.body;
        const { id, status } = req.user;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can upload NIN documents');
        }

        // Check if the email is verified
        if (!status.emailVerified) {
            throw new ForbiddenError('Please verify your email before uploading KYC documents');
        }

        // Validate NIN format
        if (!nin || !/^\d{11}$/.test(nin)) {
            throw new BadRequestError('Invalid NIN format. Must be 11 digits');
        }

        // Update agent metadata with NIN
        const updatedUser = await AgentService.updateAgentDocuments(id, { nin });

        res.status(200).json({
            status: 'success',
            message: 'NIN uploaded successfully',
            data: {
                user: updatedUser,
            },
        });
    }

    /**
     * Upload verification images for agent
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async uploadVerificationImages(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can upload verification images');
        }

        // Check if the email is verified
        if (!status.emailVerified) {
            throw new ForbiddenError('Please verify your email before uploading KYC documents');
        }

        // Check if files were uploaded
        if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
            throw new BadRequestError('No images uploaded');
        }

        // eslint-disable-next-line no-undef
        const files = req.files;
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

        // Update agent metadata with images
        const updatedUser = await AgentService.updateAgentDocuments(id, { images: imageUrls });

        res.status(200).json({
            status: 'success',
            message: 'Verification images uploaded successfully',
            data: {
                user: updatedUser,
            },
        });
    }

    /**
     * Get agent verification status
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getVerificationStatus(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can check verification status');
        }

        // Check if the email is verified
        if (!status.emailVerified) {
            throw new ForbiddenError('Please verify your email before checking KYC status');
        }

        // Get fresh data directly from the database to avoid any caching issues
        const userSettings = await UserSettings.findOne({
            where: { userId: id },
            attributes: ['isKycVerified', 'agentMetaData'],
        });

        if (!userSettings) {
            throw new BadRequestError('User settings not found');
        }

        const agentMeta: IAgentMeta = userSettings.agentMetaData || {
            nin: '',
            images: [],
            currentStatus: 'offline',
            lastStatusUpdate: new Date().toISOString(),
            isAcceptingOrders: false,
        };

        res.status(200).json({
            status: 'success',
            message: 'Verification status retrieved successfully',
            data: {
                isVerified: userSettings.isKycVerified || false,
                documents: {
                    nin: !!agentMeta.nin,
                    images: agentMeta.images && agentMeta.images.length > 0,
                },
            },
        });
    }

    /**
     * Approve KYC verification for an agent
     * @param req AuthenticatedRequest
     * @param res Response
     */
    //Todo: Implement logic for admin to handle KYC approval process
    static async approveKycVerification(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;

        // Ensure the requesting user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can self-approve KYC verification');
        }

        // Don't use viewSingleUser for this - directly fetch the settings
        const userSettings = await UserSettings.findOne({
            where: { userId: id },
            // Make sure to get all the necessary fields
            attributes: ['id', 'userId', 'isKycVerified', 'agentMetaData'],
        });

        if (!userSettings) {
            throw new BadRequestError('User settings not found');
        }

        // Access the agentMetaData
        const agentMeta = userSettings.agentMetaData;

        if (!agentMeta) {
            throw new BadRequestError('Agent metadata not found');
        }

        // Check for NIN
        if (!agentMeta.nin) {
            throw new BadRequestError('NIN document is required for KYC verification');
        }

        // Check for images
        if (!agentMeta.images || agentMeta.images.length === 0) {
            throw new BadRequestError('Verification images are required for KYC verification');
        }

        // Update KYC verification status
        await userSettings.update({ isKycVerified: true });

        // Now fetch the updated user to return in response
        const updatedUser = await UserService.viewSingleUser(id);

        res.status(200).json({
            status: 'success',
            message: 'KYC verification approved successfully',
            data: {
                user: updatedUser,
            },
        });
    }
}
