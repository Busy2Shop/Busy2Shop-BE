import { Router } from 'express';
import PaystackController from '../../controllers/payment/paystack.controller';
import { AuthenticatedController, basicAuth } from '../../middlewares/authMiddleware';

const router = Router();

// Initialize payment for shopping list
router.post(
    '/shopping-list/:shoppingListId/initialize',
    basicAuth('access'),
    AuthenticatedController(PaystackController.initializeShoppingListPayment),
);

// Verify payment
router.post(
    '/verify/:reference',
    basicAuth('access'),
    AuthenticatedController(PaystackController.verifyPayment),
);

// Get payment status (basic) - Only for order status checking, not polling
router.get(
    '/status/:reference',
    basicAuth('access'),
    AuthenticatedController(PaystackController.getPaymentStatus),
);

// Cancel payment
router.post(
    '/cancel/:reference',
    basicAuth('access'),
    AuthenticatedController(PaystackController.cancelPayment),
);

// Get public key for frontend
router.get(
    '/public-key',
    PaystackController.getPublicKey,
);

// Test confirm payment endpoint - NO AUTH REQUIRED (for testing only)
router.post('/test/confirm-payment', PaystackController.testConfirmPayment);

// Webhook endpoint - No authentication required
router.post('/webhook', PaystackController.handleWebhook);

export default router;