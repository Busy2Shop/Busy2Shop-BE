import { Router } from 'express';
import AuthController from '../controllers/auth.controller';
import { basicAuth, AuthenticatedController } from '../middlewares/authMiddleware';
import { uploadMiddleware, UploadType } from '../middlewares/uploadMiddleware';

const router = Router();

// Configure the upload middleware for single file upload
const upload = uploadMiddleware(UploadType.Single, 'file');

// // Initial signup validation
// router.post('/validate-auth', AuthController.validateAuth);

// Customer signup flow
router.post('/customer/signup', (req, res) => {
    req.body.userType = 'customer';
    return AuthController.validateAuth(req, res);
});

// Agent signup flow
router.post('/agent/signup', (req, res) => {
    req.body.userType = 'agent';
    return AuthController.validateAuth(req, res);
});

// Email verification
router.post('/verify-email', AuthController.verifyEmail);
router.post('/resend-verification', AuthController.resendVerificationEmail);

// Account completion
router.post('/complete-account', basicAuth('setup'), AuthenticatedController(AuthController.completeAccount));

// Authentication
router.post('/customer/login', (req, res) => {
    req.body.userType = 'customer';
    return AuthController.login(req, res);
});

router.post('/agent/login', (req, res) => {
    req.body.userType = 'agent';
    return AuthController.login(req, res);
});

router.get('/logout', basicAuth('access'), AuthenticatedController(AuthController.logout));

// Password management
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);
router.post('/change-password', basicAuth('access'), AuthenticatedController(AuthController.changePassword));

// User data
router.get('/me', basicAuth('access'), AuthenticatedController(AuthController.getLoggedUserData));
router.patch('/me', basicAuth('access'), upload, AuthenticatedController(AuthController.updateUser));

// Social auth - Google callback
router.post('/google/callback', AuthController.handleGoogleCallback);

export default router;
