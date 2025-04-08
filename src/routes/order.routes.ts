import { Router } from 'express';
import OrderController from '../controllers/order.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router = Router();

// All routes are protected
router.use(basicAuth('access'));

router.post('/', AuthenticatedController(OrderController.createOrder));
router.get('/', AuthenticatedController(OrderController.getUserOrders));
router.get('/agent', AuthenticatedController(OrderController.getAgentOrders));
router.get('/:id', AuthenticatedController(OrderController.getOrder));
router.patch('/:id/status', AuthenticatedController(OrderController.updateOrderStatus));
router.patch('/:id/agent-notes', AuthenticatedController(OrderController.addAgentNotes));
router.patch('/:id/customer-notes', AuthenticatedController(OrderController.addCustomerNotes));

// Create a new order with automatic agent assignment
router.post('/with-agent', AuthenticatedController(OrderController.createOrderWithAgent));

// Add notes to an order
router.post('/:id/notes', AuthenticatedController(OrderController.addNotes));

// Reject an order (agent only)
router.post('/:id/reject', AuthenticatedController(OrderController.rejectOrder));

export default router;