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

// Add notes to an order (handles both agent and customer notes)
router.patch('/:id/notes', AuthenticatedController(OrderController.addNotes));

// Reject an order (agent only)
router.post('/:id/reject', AuthenticatedController(OrderController.rejectOrder));

export default router;