import express, { Router } from 'express';
import AdminController from '../controllers/Admin/admin.controller';
import ProductController from '../controllers/product.controller';
import { AdminAuthenticatedController, adminAuth } from '../middlewares/authMiddleware';
import { uploadMiddleware, UploadType } from '../middlewares/uploadMiddleware';

const router: Router = express.Router();
const upload = uploadMiddleware(UploadType.Array, 'files', 5);

// Public routes for admin authentication
router.post('/login', AdminController.loginSuperAdmin);
router.post('/verify', AdminController.verifySuperAdminLogin);

// Admin management - ONLY for super admins
router.post('/create', adminAuth('superAdmin'), AdminAuthenticatedController(AdminController.createAdmin));
router.delete('/delete', adminAuth('superAdmin'), AdminAuthenticatedController(AdminController.deleteAdmin));

// Admin viewing - for admins and super admins
router.get('/admins', adminAuth('admin'), AdminAuthenticatedController(AdminController.getAllAdmins));

// User management - for admins and super admins
router.post('/block-user', adminAuth('admin'), AdminAuthenticatedController(AdminController.blockUser));
router.post('/unblock-user', adminAuth('admin'), AdminAuthenticatedController(AdminController.unblockUser));
router.post('/deactivate-user', adminAuth('admin'), AdminAuthenticatedController(AdminController.deactivateUser));
router.post('/activate-user', adminAuth('admin'), AdminAuthenticatedController(AdminController.activateUser));
router.get('/users', adminAuth('admin'), AdminAuthenticatedController(AdminController.getAllUsers));
router.get('/user/:id', adminAuth('admin'), AdminAuthenticatedController(AdminController.getUser));


//Product management routes for vendors
router.post('/products', adminAuth('vendor'), upload, AdminAuthenticatedController(ProductController.createProduct));
router.put('/products/:id', adminAuth('vendor'), upload, AdminAuthenticatedController(ProductController.updateProduct));
router.delete('/products/:id', adminAuth('vendor'), AdminAuthenticatedController(ProductController.deleteProduct));
router.patch('/products/:id/toggle', adminAuth('vendor'), AdminAuthenticatedController(ProductController.toggleProductAvailability));
router.post('/products/bulk', adminAuth('vendor'), AdminAuthenticatedController(ProductController.bulkCreateProducts));
export default router;
