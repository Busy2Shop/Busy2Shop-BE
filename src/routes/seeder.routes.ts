// src/routes/seeder.routes.ts
import { Router } from 'express';
import SeederController from '../controllers/Admin/seeder.controller';
import {  } from '../middlewares/authMiddleware';

const router = Router();

// Seed database with sample data
router.post('/seed', SeederController.seedDatabase);

// Clear all seeded data  
router.delete('/clear', SeederController.clearSeedData);

// Get seeding status
router.get('/status', SeederController.getSeedingStatus);

export default router;