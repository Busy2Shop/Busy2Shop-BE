import { Router } from 'express';
import LocationController from '../controllers/location.controller';

const router = Router();

// Public routes for location services
router.get('/markets/nearby', LocationController.findNearbyMarkets);
router.get('/markets', LocationController.getNearbyMarkets);
router.get('/agents/available', LocationController.findAvailableAgents);
router.get('/agents/nearby-for-orders', LocationController.findNearbyAgentsForOrders);
router.get('/agents/nearby', LocationController.getNearbyAgents);
router.get('/agent/:orderId/eta', LocationController.getAgentLocationAndETA);


export default router;