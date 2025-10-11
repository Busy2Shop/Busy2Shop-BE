// src/routes/delivery.routes.ts
import { Router } from 'express';
import DeliveryController from '../controllers/delivery.controller';
import DeliveryShipBubbleController from '../controllers/deliveryShipBubble.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router = Router();

// ShipBubble webhook endpoint (NO AUTHENTICATION - external service)
// MUST be before the router.use(basicAuth('access')) middleware
router.post('/shipbubble/webhook', DeliveryShipBubbleController.handleWebhook);

// All other delivery routes require authentication
router.use(basicAuth('access'));

// Legacy delivery routes (kept for backward compatibility)
router.post('/request', AuthenticatedController(DeliveryController.requestDelivery));
router.get('/track/:taskId', AuthenticatedController(DeliveryController.trackDelivery));
router.post('/estimate', AuthenticatedController(DeliveryController.getDeliveryEstimate));
router.post('/cancel', AuthenticatedController(DeliveryController.cancelDelivery));

// ShipBubble delivery routes
router.post('/shipbubble/validate-addresses', AuthenticatedController(DeliveryShipBubbleController.validateAddresses));
router.post('/shipbubble/quote', AuthenticatedController(DeliveryShipBubbleController.getDeliveryQuote));
router.post('/shipbubble/select-courier', AuthenticatedController(DeliveryShipBubbleController.selectCourier));
router.post('/shipbubble/create-label', AuthenticatedController(DeliveryShipBubbleController.createShippingLabel));

// ShipBubble admin/tracking routes
router.get('/shipbubble/wallet-balance', AuthenticatedController(DeliveryShipBubbleController.getWalletBalance));
router.post('/shipbubble/fund-wallet', AuthenticatedController(DeliveryShipBubbleController.fundWallet));
router.get('/shipbubble/shipments', AuthenticatedController(DeliveryShipBubbleController.getShipments));
router.get('/shipbubble/shipments/:orderIds', AuthenticatedController(DeliveryShipBubbleController.getMultipleShipments));
router.get('/shipbubble/categories', AuthenticatedController(DeliveryShipBubbleController.getPackageCategories));
router.get('/shipbubble/couriers', AuthenticatedController(DeliveryShipBubbleController.getAvailableCouriers));

export default router;