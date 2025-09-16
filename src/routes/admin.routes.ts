import express, { Router } from 'express';
import AdminController from '../controllers/Admin/admin.controller';
import { AdminAuthenticatedController, adminAuth } from '../middlewares/authMiddleware';
import KycController from '../controllers/kyc.controller';
// import AlatPayController from '../controllers/payment/alatpay.controller';
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
router.patch(
    '/activate',
    adminAuth('admin'),
    AdminAuthenticatedController(AdminController.activateAdmin),
);
router.patch(
    '/deactivate',
    adminAuth('admin'),
    AdminAuthenticatedController(AdminController.deactivateAdmin),
);
// Dashboard stats route
router.get('/dashboard/stats', adminAuth('admin'), AdminAuthenticatedController(AdminController.getDashboardStats));


// User management routes - enhanced with better filtering
router.get('/users', adminAuth('admin'), AdminAuthenticatedController(AdminController.getAllUsers));
router.get('/users/customers', adminAuth('admin'), AdminAuthenticatedController(AdminController.getAllCustomers));
router.get('/users/agents', adminAuth('admin'), AdminAuthenticatedController(AdminController.getAllAgents));
router.get('/users/stats/overview', adminAuth('admin'), AdminAuthenticatedController(AdminController.getUserStats));
router.get('/users/:id', adminAuth('admin'), AdminAuthenticatedController(AdminController.getUser));
router.get('/users/:id/activity', adminAuth('admin'), AdminAuthenticatedController(AdminController.getUserActivity));

// User action routes
router.patch('/users/:id/block', adminAuth('admin'), AdminAuthenticatedController(AdminController.blockUser));
router.patch('/users/:id/unblock', adminAuth('admin'), AdminAuthenticatedController(AdminController.unblockUser));
router.patch('/users/:id/deactivate', adminAuth('admin'), AdminAuthenticatedController(AdminController.deactivateUser));
router.patch('/users/:id/activate', adminAuth('admin'), AdminAuthenticatedController(AdminController.activateUser));
router.patch('/users/:id/profile', adminAuth('admin'), AdminAuthenticatedController(AdminController.updateUserProfile));
router.delete('/users/:id', adminAuth('admin'), AdminAuthenticatedController(AdminController.deleteUser));

// User detailed data routes
router.get('/users/:id/orders', adminAuth('admin'), AdminAuthenticatedController(AdminController.getUserOrders));
router.get('/users/:id/shopping-lists', adminAuth('admin'), AdminAuthenticatedController(AdminController.getUserShoppingLists));
router.get('/users/:id/locations', adminAuth('admin'), AdminAuthenticatedController(AdminController.getUserLocations));

// Agent specific routes
router.patch('/users/:id/kyc/approve', adminAuth('admin'), AdminAuthenticatedController(AdminController.approveAgentKyc));
router.patch('/users/:id/kyc/reject', adminAuth('admin'), AdminAuthenticatedController(AdminController.rejectAgentKyc));

// Agent analytics and performance
router.get('/agents/:id/performance', adminAuth('admin'), AdminAuthenticatedController(AdminController.getAgentPerformanceMetrics));
router.get('/agents/:id/location-history', adminAuth('admin'), AdminAuthenticatedController(AdminController.getAgentLocationHistory));
router.patch('/agents/:id/status', adminAuth('admin'), AdminAuthenticatedController(AdminController.updateAgentStatus));
router.get('/agents/:id/analytics', adminAuth('admin'), AdminAuthenticatedController(AdminController.getAgentAnalytics));

// User creation
router.post('/users/create', adminAuth('admin'), AdminAuthenticatedController(AdminController.createUser));

// Bulk actions
router.post('/users/bulk-action', adminAuth('admin'), AdminAuthenticatedController(AdminController.bulkUserAction));

// KYC Management - audit the authentication requeirements
router.patch(
    '/kyc/approve',
    adminAuth('admin'),
    AdminAuthenticatedController(AuthenticatedController(KycController.approveKycVerification))
);

// Payment Management
// router.get(
//     '/payments/reconcile',
//     adminAuth('admin'),
//     AdminAuthenticatedController(AuthenticatedController(AlatPayController.reconcileTransactions))
// );
// router.get(
//     '/payments/check-expired',
//     adminAuth('admin'),
//     AdminAuthenticatedController(AuthenticatedController(AlatPayController.checkExpiredTransactions))
// );

// Order Management Routes
router.get('/orders', adminAuth('admin'), AdminAuthenticatedController(AdminController.getAllOrders));
router.get('/orders/stats', adminAuth('admin'), AdminAuthenticatedController(AdminController.getOrderStats));
router.get('/orders/:id', adminAuth('admin'), AdminAuthenticatedController(AdminController.getAdminOrder));
router.patch('/orders/:id/status', adminAuth('admin'), AdminAuthenticatedController(AdminController.updateOrderStatusAdmin));
router.post('/orders/:id/cancel', adminAuth('admin'), AdminAuthenticatedController(AdminController.cancelOrderAdmin));
router.patch('/orders/:id/reassign', adminAuth('admin'), AdminAuthenticatedController(AdminController.reassignOrder));
router.get('/orders/:id/trail', adminAuth('admin'), AdminAuthenticatedController(AdminController.getOrderTrail));

// Suggested Lists Management
router.use('/shopping-lists', adminAuth('admin'), suggestedListsRoutes);

// Admin Market Management Routes
router.get('/markets', adminAuth('admin'), AdminAuthenticatedController(AdminController.getAllMarkets));
router.get('/markets/stats', adminAuth('admin'), AdminAuthenticatedController(AdminController.getMarketStats));
router.get('/markets/:id', adminAuth('admin'), AdminAuthenticatedController(AdminController.getMarket));
router.post('/markets', adminAuth('admin'), AdminAuthenticatedController(AdminController.createMarket));
router.put('/markets/:id', adminAuth('admin'), AdminAuthenticatedController(AdminController.updateMarket));
router.delete('/markets/:id', adminAuth('admin'), AdminAuthenticatedController(AdminController.deleteMarket));
router.patch('/markets/:id/toggle-pin', adminAuth('admin'), AdminAuthenticatedController(AdminController.toggleMarketPin));

// Admin Product Management Routes
router.get('/products', adminAuth('admin'), AdminAuthenticatedController(AdminController.getAllProducts));
router.get('/products/stats', adminAuth('admin'), AdminAuthenticatedController(AdminController.getProductStats));
router.get('/products/:id', adminAuth('admin'), AdminAuthenticatedController(AdminController.getProduct));
router.post('/products', adminAuth('admin'), AdminAuthenticatedController(AdminController.createProduct));
router.post('/products/bulk', adminAuth('admin'), AdminAuthenticatedController(AdminController.bulkCreateProducts));
router.put('/products/:id', adminAuth('admin'), AdminAuthenticatedController(AdminController.updateProduct));
router.delete('/products/:id', adminAuth('admin'), AdminAuthenticatedController(AdminController.deleteProduct));
router.patch('/products/:id/toggle-pin', adminAuth('admin'), AdminAuthenticatedController(AdminController.toggleProductPin));
router.post('/products/bulk-operation', adminAuth('admin'), AdminAuthenticatedController(AdminController.bulkProductOperation));

// Admin Category Management Routes
router.get('/categories', adminAuth('admin'), AdminAuthenticatedController(AdminController.getAllCategories));
router.get('/categories/stats', adminAuth('admin'), AdminAuthenticatedController(AdminController.getCategoryStats));
router.get('/categories/:id', adminAuth('admin'), AdminAuthenticatedController(AdminController.getCategory));
router.post('/categories', adminAuth('admin'), AdminAuthenticatedController(AdminController.createCategory));
router.put('/categories/:id', adminAuth('admin'), AdminAuthenticatedController(AdminController.updateCategory));
router.delete('/categories/:id', adminAuth('admin'), AdminAuthenticatedController(AdminController.deleteCategory));
router.patch('/categories/:id/toggle-pin', adminAuth('admin'), AdminAuthenticatedController(AdminController.toggleCategoryPin));

export default router;

