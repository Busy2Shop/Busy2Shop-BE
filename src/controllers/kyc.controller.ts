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
        const userSettings = await UserSettings.scope('withAgentMeta').findOne({
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
                    livenessVerification: agentMeta.livenessVerification?.verified || false,
                    identityDocument: !!agentMeta.identityDocument?.url,
                },
                user: {
                    settings: {
                        agentMetaData: agentMeta,
                    },
                },
            },
        });
    }

    /**
     * Submit liveness verification data
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async submitLivenessVerification(req: AuthenticatedRequest, res: Response) {
        const { livenessResults } = req.body;
        const { id, status } = req.user;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can submit liveness verification');
        }

        // Check if the email is verified
        if (!status.emailVerified) {
            throw new ForbiddenError('Please verify your email before submitting liveness verification');
        }

        // Validate liveness results
        if (!livenessResults) {
            throw new BadRequestError('Liveness results are required');
        }

        let livenessData;
        try {
            livenessData = typeof livenessResults === 'string' 
                ? JSON.parse(livenessResults) 
                : livenessResults;
        } catch (error) {
            throw new BadRequestError('Invalid liveness results format');
        }

        // Check if face image was uploaded
        if (!req.file) {
            throw new BadRequestError('Face image is required');
        }

        // Upload face image to Cloudinary
        const uploadResult = await CloudinaryClientConfig.uploadtoCloudinary({
            fileBuffer: req.file.buffer,
            id: id,
            name: `liveness_face_${Date.now()}_${req.file.originalname}`,
            type: 'liveness',
        });

        if (!uploadResult.url) {
            throw new BadRequestError('Failed to upload face image');
        }

        const isLivenessVerified = livenessData.faceDetected && 
                                   livenessData.blinkCompleted && 
                                   livenessData.smileCompleted && 
                                   livenessData.spoofingPassed;

        // Update agent metadata with liveness data
        const updatedUser = await AgentService.updateAgentDocuments(id, { 
            livenessVerification: {
                faceImage: uploadResult.url,
                results: livenessData,
                timestamp: new Date().toISOString(),
                verified: isLivenessVerified,
            },
        });

        // If liveness is verified, also update the user's display image
        if (isLivenessVerified) {
            try {
                await UserService.updateUser(updatedUser, {
                    displayImage: uploadResult.url,
                });
                console.log('✅ Agent display image updated with liveness photo');
            } catch (error) {
                console.error('❌ Failed to update agent display image:', error);
                // Don't fail the entire liveness process if display image update fails
            }
        }

        res.status(200).json({
            status: 'success',
            message: 'Liveness verification submitted successfully',
            data: {
                user: updatedUser,
                livenessVerified: isLivenessVerified,
                displayImageUpdated: isLivenessVerified,
                nextStep: isLivenessVerified ? 'document_upload' : 'retry_liveness',
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
        const userSettings = await UserSettings.scope('withAgentMeta').findOne({
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

        // Check for liveness verification
        if (!agentMeta.livenessVerification) {
            throw new BadRequestError('Liveness verification is required for KYC verification');
        }

        if (!agentMeta.livenessVerification.verified) {
            throw new BadRequestError('Liveness verification must be successfully completed for KYC approval');
        }

        // Update KYC verification status and mark as approved
        await userSettings.update({ isKycVerified: true });
        
        // Also update the KYC status to approved
        await AgentService.updateAgentDocuments(id, { 
            kycStatus: 'approved',
        });

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

    /**
     * Validate NIN format and availability
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async validateNIN(req: AuthenticatedRequest, res: Response) {
        const { nin } = req.body;
        const { id, status } = req.user;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can validate NIN');
        }

        // Validate NIN format
        if (!nin || !/^\d{11}$/.test(nin)) {
            throw new BadRequestError('Invalid NIN format. Must be 11 digits');
        }

        // Check if NIN is already used by another agent
        const existingAgent = await UserSettings.findOne({
            where: {
                agentMetaData: {
                    nin: nin,
                },
            },
            attributes: ['userId'],
        });

        const isAvailable = !existingAgent || existingAgent.userId === id;

        res.status(200).json({
            status: 'success',
            message: isAvailable ? 'NIN is available' : 'NIN is already in use',
            data: {
                isValid: true,
                isAvailable: isAvailable,
            },
        });
    }

    /**
     * Upload document photo for agent verification
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async uploadDocumentPhoto(req: AuthenticatedRequest, res: Response) {
        const { documentType } = req.body;
        const { id, status } = req.user;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can upload document photos');
        }

        // Check if the email is verified
        if (!status.emailVerified) {
            throw new ForbiddenError('Please verify your email before uploading KYC documents');
        }

        // Check if liveness verification is completed first
        const userSettingsCheck = await UserSettings.scope('withAgentMeta').findOne({
            where: { userId: id },
            attributes: ['agentMetaData'],
        });

        if (!userSettingsCheck?.agentMetaData?.livenessVerification?.verified) {
            throw new BadRequestError('Please complete liveness verification before uploading document photos');
        }

        // Validate document type - single identity document
        const validDocumentTypes = ['nin', 'national_id', 'passport', 'drivers_license'];
        if (!validDocumentTypes.includes(documentType)) {
            throw new BadRequestError('Invalid document type. Must be one of: nin, national_id, passport, drivers_license');
        }

        // Check if file was uploaded
        if (!req.file) {
            throw new BadRequestError('No document file uploaded');
        }

        // Upload file to Cloudinary
        const uploadResult = await CloudinaryClientConfig.uploadtoCloudinary({
            fileBuffer: req.file.buffer,
            id: id,
            name: `${documentType}_${Date.now()}_${req.file.originalname}`,
            type: 'documents',
        });

        if (!uploadResult.url) {
            throw new BadRequestError('Failed to upload document');
        }

        // Get current user settings for document update
        const userSettings = await UserSettings.scope('withAgentMeta').findOne({
            where: { userId: id },
            attributes: ['agentMetaData'],
        });

        const agentMeta: IAgentMeta = userSettings?.agentMetaData || {
            nin: '',
            images: [],
            currentStatus: 'offline',
            lastStatusUpdate: new Date().toISOString(),
            isAcceptingOrders: false,
        };

        // Update agent metadata with identity document
        const updatedUser = await AgentService.updateAgentDocuments(id, { 
            identityDocument: {
                type: documentType,
                url: uploadResult.url,
                uploadedAt: new Date().toISOString(),
            },
        });


        res.status(200).json({
            status: 'success',
            message: `${documentType} uploaded successfully`,
            data: {
                user: updatedUser,
                documentUrl: uploadResult.url,
            },
        });
    }

    /**
     * Complete KYC process
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async completeKYC(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can complete KYC process');
        }

        // Check if the email is verified
        if (!status.emailVerified) {
            throw new ForbiddenError('Please verify your email before completing KYC');
        }

        // Get user settings to verify all requirements are met
        const userSettings = await UserSettings.scope('withAgentMeta').findOne({
            where: { userId: id },
            attributes: ['agentMetaData'],
        });

        if (!userSettings || !userSettings.agentMetaData) {
            throw new BadRequestError('Agent metadata not found');
        }

        const agentMeta = userSettings.agentMetaData;


        // Check all required documents with enhanced validation
        const requiredChecks = [
            { check: !!agentMeta.nin, message: 'NIN is required' },
            { check: !!agentMeta.livenessVerification?.verified, message: 'Liveness verification must be completed successfully first' },
            { check: !!agentMeta.identityDocument?.url, message: 'Identity document is required' },
        ];

        // Verify liveness was completed before allowing document uploads
        if (!agentMeta.livenessVerification?.verified) {
            throw new BadRequestError('Please complete liveness verification before proceeding to document upload');
        }

        for (const { check, message } of requiredChecks) {
            if (!check) {
                throw new BadRequestError(message);
            }
        }

        // Mark KYC as submitted for admin approval
        const updatedUser = await AgentService.updateAgentDocuments(id, { 
            kycComplete: true,
            kycStatus: 'submitted',
            kycCompletedAt: new Date().toISOString(),
        });

        res.status(200).json({
            status: 'success',
            message: 'KYC submitted successfully! Your verification is pending admin approval.',
            data: {
                user: updatedUser,
                kycComplete: true,
                kycStatus: 'submitted',
            },
        });
    }
}
