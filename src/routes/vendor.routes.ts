// src/routes/vendor.routes.ts
import { Router } from 'express';
import VendorController from '../controllers/vendor.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router = Router();

// Public routes
router.get('/', VendorController.getAllVendors);
router.get('/:id', VendorController.getVendorProfile);

// Protected routes
router.use( basicAuth('access'));
router.get('/:id/stats', basicAuth('access'),  AuthenticatedController(VendorController.getVendorStats));
router.get('/available/:shoppingListId', basicAuth('access'),  AuthenticatedController(VendorController.getAvailableVendorsForOrder));
router.post('/assign/:orderId', basicAuth('access'),  AuthenticatedController(VendorController.assignOrderToVendor));

export default router;