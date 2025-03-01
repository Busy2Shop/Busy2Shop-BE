import express, { Router } from 'express';
import AdminController from '../../controllers/Admin/admin.controller';
import { AdminAuthenticatedController, adminAuth } from '../../middlewares/authMiddleware';

const router: Router = express.Router();

// Public routes for admin authentication
router.post('/login', AdminController.loginSuperAdmin);
router.post('/verify', AdminController.verifySuperAdminLogin);

// Protected admin routes
router.post('/create', adminAuth('admin'), AdminAuthenticatedController(AdminController.createAdmin));
router.get('/admins', adminAuth('admin'), AdminAuthenticatedController(AdminController.getAllAdmins));
router.delete('/delete', adminAuth('admin'), AdminAuthenticatedController(AdminController.deleteAdmin));
router.post('/block-user', adminAuth('admin'), AdminAuthenticatedController(AdminController.blockUser));
router.post('/unblock-user', adminAuth('admin'), AdminAuthenticatedController(AdminController.unblockUser));
router.post('/deactivate-user', adminAuth('admin'), AdminAuthenticatedController(AdminController.deactivateUser));
router.post('/activate-user', adminAuth('admin'), AdminAuthenticatedController(AdminController.activateUser));
router.get('/users', adminAuth('admin'), AdminAuthenticatedController(AdminController.getAllUsers));
router.get('/user/:id', adminAuth('admin'), AdminAuthenticatedController(AdminController.getUser));

export default router;
