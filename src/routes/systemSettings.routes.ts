import { Router } from 'express';
import SystemSettingsController from '../controllers/systemSettings.controller';
import { AdminAuthenticatedController, adminAuth } from '../middlewares/authMiddleware';

const router = Router();

// Public route (no authentication required)
router.get('/public', SystemSettingsController.getPublicSettings);

// Admin routes (admin authentication required)
router.get('/', adminAuth('admin'), AdminAuthenticatedController(SystemSettingsController.getAllSettings));
router.get('/category/:category', adminAuth('admin'), AdminAuthenticatedController(SystemSettingsController.getSettingsByCategory));
router.put('/:key', adminAuth('admin'), AdminAuthenticatedController(SystemSettingsController.updateSetting));
router.post('/initialize', adminAuth('admin'), AdminAuthenticatedController(SystemSettingsController.initializeDefaultSettings));
router.post('/clear-cache', adminAuth('admin'), AdminAuthenticatedController(SystemSettingsController.clearCache));

export default router;