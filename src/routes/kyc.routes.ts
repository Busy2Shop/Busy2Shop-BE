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

// Get verification status
router.get('/status', AuthenticatedController(KycController.getVerificationStatus));

export default router;
