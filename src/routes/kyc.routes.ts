// src/routes/agentDocument.routes.ts
import { Router } from 'express';
import KycController from '../controllers/kyc.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';
import { uploadMiddleware, UploadType } from '../middlewares/uploadMiddleware';

const router = Router();

// All routes are protected and require authentication
router.use(basicAuth('access'));

// Upload NIN document
router.post('/nin', AuthenticatedController(KycController.uploadNIN));

// Upload verification images
router.post(
    '/images',
    uploadMiddleware(UploadType.Array, 'images', 5), // Allow up to 5 images
    AuthenticatedController(KycController.uploadVerificationImages),
);

// Submit liveness verification
router.post(
    '/liveness',
    uploadMiddleware(UploadType.Single, 'faceImage'), // Single file upload for face image
    AuthenticatedController(KycController.submitLivenessVerification),
);

// Validate NIN
router.post('/validate-nin', AuthenticatedController(KycController.validateNIN));

// Upload document photo
router.post(
    '/upload-document-photo',
    uploadMiddleware(UploadType.Single, 'document'), // Single file upload for document photo
    AuthenticatedController(KycController.uploadDocumentPhoto),
);

// Complete KYC process
router.post('/complete', AuthenticatedController(KycController.completeKYC));

// Get verification status
router.get('/status', AuthenticatedController(KycController.getVerificationStatus));

// Approve KYC verification (self-approval)
router.post('/approve', AuthenticatedController(KycController.approveKycVerification));

export default router;
