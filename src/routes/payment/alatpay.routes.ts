import { Router } from 'express';
import AlatPayController from '../../controllers/payment/alatpay.controller';
import { AuthenticatedController, basicAuth } from '../../middlewares/authMiddleware';

const router = Router();

// Protected routes that require authentication
router.post(
    '/virtual-account',
    basicAuth('access'),
    AuthenticatedController(AlatPayController.generateVirtualAccount),
);

router.get(
    '/transaction/:transactionId',
    basicAuth('access'),
    AuthenticatedController(AlatPayController.checkPaymentStatus),
);

router.get(
    '/transactions',
    basicAuth('access'),
    AuthenticatedController(AlatPayController.getTransactionHistory),
);

router.get(
    '/user-payments',
    basicAuth('access'),
    AuthenticatedController(AlatPayController.getUserPayments),
);

router.post(
    '/shopping-list/:shoppingListId/payment',
    basicAuth('access'),
    AuthenticatedController(AlatPayController.generatePaymentLink),
);

router.post(
    '/order/:orderId/payment',
    basicAuth('access'),
    AuthenticatedController(AlatPayController.generateOrderPaymentLink),
);

// Webhook route - this doesn't require authentication as it's called by ALATPay
router.post('/webhook', AlatPayController.handleWebhook);

export default router;
