// src/routes/delivery.routes.ts
import { Router } from 'express';
import DeliveryController from '../controllers/delivery.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router = Router();

// All delivery routes require authentication
router.use(basicAuth('access'));

// Delivery management routes
router.post('/request', AuthenticatedController(DeliveryController.requestDelivery));
router.get('/track/:taskId', AuthenticatedController(DeliveryController.trackDelivery));
router.post('/estimate', AuthenticatedController(DeliveryController.getDeliveryEstimate));
router.post('/cancel', AuthenticatedController(DeliveryController.cancelDelivery));

export default router;