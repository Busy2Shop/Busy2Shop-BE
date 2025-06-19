import express, { Router } from 'express';
import AdminController from '../controllers/Admin/admin.controller';
import { AdminAuthenticatedController, adminAuth } from '../middlewares/authMiddleware';
import KycController from '../controllers/kyc.controller';
import AlatPayController from '../controllers/payment/alatpay.controller';
import { AuthenticatedController } from '../middlewares/authMiddleware';
import suggestedListsRoutes from './admin/suggestedLists.routes';

const router: Router = express.Router();

// Public routes for admin authentication
router.post('/login', AdminController.loginSuperAdmin);
router.post('/verify', AdminController.verifySuperAdminLogin);

// Protected admin routes
router.post(
    '/create',
    adminAuth('admin'),
    AdminAuthenticatedController(AdminController.createAdmin),
);
router.get(
    '/admins',
    adminAuth('admin'),
    AdminAuthenticatedController(AdminController.getAllAdmins),
);
router.delete(
    '/delete',
    adminAuth('admin'),
    AdminAuthenticatedController(AdminController.deleteAdmin),
);
router.post(
    '/block-user',
    adminAuth('admin'),
    AdminAuthenticatedController(AdminController.blockUser),
);
router.post(
    '/unblock-user',
    adminAuth('admin'),
    AdminAuthenticatedController(AdminController.unblockUser),
);
router.post(
    '/deactivate-user',
    adminAuth('admin'),
    AdminAuthenticatedController(AdminController.deactivateUser),
);
router.post(
    '/activate-user',
    adminAuth('admin'),
    AdminAuthenticatedController(AdminController.activateUser),
);
router.get('/users', adminAuth('admin'), AdminAuthenticatedController(AdminController.getAllUsers));
router.get('/user/:id', adminAuth('admin'), AdminAuthenticatedController(AdminController.getUser));

// KYC Management - audit the authentication requeirements
router.patch(
    '/kyc/approve',
    adminAuth('admin'),
    AdminAuthenticatedController(AuthenticatedController(KycController.approveKycVerification))
);

// Payment Management
router.get(
    '/payments/reconcile',
    adminAuth('admin'),
    AdminAuthenticatedController(AuthenticatedController(AlatPayController.reconcileTransactions))
);
router.get(
    '/payments/check-expired',
    adminAuth('admin'),
    AdminAuthenticatedController(AuthenticatedController(AlatPayController.checkExpiredTransactions))
);

// Suggested Lists Management
router.use('/shopping-lists', adminAuth('admin'), suggestedListsRoutes);

export default router;
