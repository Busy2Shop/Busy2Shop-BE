// src/routes/agent.routes.ts
import { Router } from 'express';
import AgentController from '../controllers/agent.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router = Router();

// Public routes with static paths
router.get('/', AgentController.getAllAgents);
router.get('/nearby', AgentController.findNearbyAgents);

// Protected routes
router.use(basicAuth('access'));

// Agent location management routes (static paths first)
router.get('/locations', AuthenticatedController(AgentController.getLocations));
router.post('/locations', AuthenticatedController(AgentController.addLocation));
router.put('/locations/:id', AuthenticatedController(AgentController.updateLocation));
router.delete('/locations/:id', AuthenticatedController(AgentController.deleteLocation));

// Agent status management routes (static paths)
router.get('/status', AuthenticatedController(AgentController.getStatus));
router.put('/status', AuthenticatedController(AgentController.updateStatus));

// Agent profile and dashboard routes (static paths)
router.get('/profile/stats', AuthenticatedController(AgentController.getAgentStats));
router.get('/profile/recent-orders', AuthenticatedController(AgentController.getRecentOrders));
router.get('/profile/daily-earnings', AuthenticatedController(AgentController.getDailyEarnings));
router.get('/profile/today-stats', AuthenticatedController(AgentController.getTodayStats));
router.get('/profile/data', AuthenticatedController(AgentController.getAgentProfileData));
router.patch('/profile/status', AuthenticatedController(AgentController.updateAgentStatus));

// Agent notifications
router.get('/notifications', AuthenticatedController(AgentController.getNotifications));

// Agent order management routes (static paths)
router.get('/orders', AuthenticatedController(AgentController.getAgentOrders)); // Generic orders endpoint with status filtering
router.get('/orders/available', AuthenticatedController(AgentController.getAvailableOrders));
router.get('/orders/active', AuthenticatedController(AgentController.getActiveOrders));
router.get('/orders/completed', AuthenticatedController(AgentController.getCompletedOrders));
router.get('/orders/completed/today', AuthenticatedController(AgentController.getTodayCompletedOrders));
router.post('/orders/:orderId/accept', AuthenticatedController(AgentController.acceptOrder));
router.post('/orders/:orderId/reject', AuthenticatedController(AgentController.rejectOrder));
router.patch('/orders/:orderId/status', AuthenticatedController(AgentController.updateOrderStatusForAgent));
router.post('/orders/:orderId/complete', AuthenticatedController(AgentController.completeOrder));

// More specific static paths
router.get(
    '/available/:shoppingListId',
    AuthenticatedController(AgentController.getAvailableAgentsForOrder),
);
router.post('/assign/:orderId', AuthenticatedController(AgentController.assignOrderToAgent));

// Generic parameter routes LAST
router.get('/:id', AgentController.getAgentProfile);
router.get('/:id/stats', AuthenticatedController(AgentController.getAgentStats));

export default router;
