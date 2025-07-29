import { Router } from 'express';
import OrderController from '../controllers/order.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router = Router();

// All routes are protected
router.use(basicAuth('access'));

// Static paths first
router.post('/', AuthenticatedController(OrderController.createOrder));
router.post('/create-with-payment', AuthenticatedController(OrderController.createOrderWithPaymentMethod));
router.get('/', AuthenticatedController(OrderController.getUserOrders));
router.get('/agent', AuthenticatedController(OrderController.getAgentOrders));

// Routes with specific path patterns
router.patch('/:id/status', AuthenticatedController(OrderController.updateOrderStatus));
// Add notes to an order (handles both agent and customer notes)
router.patch('/:id/notes', AuthenticatedController(OrderController.addNotes));
// Reject an order (agent only)
router.post('/:id/reject', AuthenticatedController(OrderController.rejectOrder));
// Get order trail/audit log
router.get('/:id/trail', AuthenticatedController(OrderController.getOrderTrail));

// Generic parameter route LAST
router.get('/:id', AuthenticatedController(OrderController.getOrder));

export default router;
