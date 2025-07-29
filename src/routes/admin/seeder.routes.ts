// src/routes/seeder.routes.ts
import { Router } from 'express';
import SeederController from '../../controllers/Admin/seeder.controller';
import { } from '../../middlewares/authMiddleware';

const router = Router();

// Seed database with sample data
router.get('/seed', SeederController.seedDatabase);

// Clear all seeded data  
router.delete('/clear', SeederController.clearSeedData);

// Get seeding status
router.get('/status', SeederController.getSeedingStatus);

router.get('/shopping-lists', SeederController.seedShoppingLists);

router.delete('/shopping-lists', SeederController.clearShoppingLists);

router.get('/meals', SeederController.seedMeals);

router.delete('/meals', SeederController.clearMeals);

// System Settings seeding routes
router.get('/system-settings', SeederController.seedSystemSettings);
router.delete('/system-settings', SeederController.clearSystemSettings);
router.get('/system-settings/status', SeederController.getSystemSettingsStatus);

// Seeding route for development/testing
router.get('/seed-campaigns', SeederController.seedDiscountCampaigns);

export default router;