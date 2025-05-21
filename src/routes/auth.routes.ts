import { Router } from 'express';
import AuthController from '../controllers/auth.controller';
import { basicAuth, AuthenticatedController } from '../middlewares/authMiddleware';

const router = Router();

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
router.post('/complete-account', basicAuth('access'), AuthenticatedController(AuthController.completeAccount));

// Authentication
router.post('/customer/login', (req, res) => {
    req.body.userType = 'customer';
    return AuthController.login(req, res);
});

router.post('/agent/login', (req, res) => {
    req.body.userType = 'agent';
    return AuthController.login(req, res);
});

router.post('/logout', basicAuth('access'), AuthenticatedController(AuthController.logout));

// Password management
router.post('/forgot-password', AuthController.forgotPassword);
router.post('/reset-password', AuthController.resetPassword);
router.post('/change-password', basicAuth('access'), AuthenticatedController(AuthController.changePassword));

// User data
router.get('/me', basicAuth('access'), AuthenticatedController(AuthController.getLoggedUserData));
router.put('/me', basicAuth('access'), AuthenticatedController(AuthController.updateUser));

// Social auth
router.get('/google/callback', AuthenticatedController(AuthController.googleSignIn));

export default router;
