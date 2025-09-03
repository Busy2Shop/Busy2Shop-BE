import { Router } from 'express';
import AlatPayController from '../../controllers/payment/alatpay.controller';
import { AuthenticatedController, basicAuth } from '../../middlewares/authMiddleware';
import path from 'path';

const router = Router();

router.get(
    '/transaction/:transactionId',
    basicAuth('access'),
    AuthenticatedController(AlatPayController.checkPaymentStatus),
);

router.get(
    '/redirect-info/:transactionId',
    basicAuth('access'),
    AuthenticatedController(AlatPayController.getPaymentRedirectInfo),
);

router.get(
    '/transactions',
    basicAuth('access'),
    AuthenticatedController(AlatPayController.getTransactionHistory),
);


router.post(
    '/shopping-list/:shoppingListId/payment',
    basicAuth('access'),
    AuthenticatedController(AlatPayController.generatePaymentDetails),
);

// Removed: Complex order status endpoints - using simple transaction status check instead

// Webhook route - this doesn't require authentication as it's called by ALATPay
router.post('/webhook', AlatPayController.handleWebhook);

// TEST ENDPOINT - No authentication required for testing purposes
router.post('/test/confirm-payment', AlatPayController.testConfirmPayment);

export default router;
