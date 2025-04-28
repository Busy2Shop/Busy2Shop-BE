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

// More specific static paths
router.get('/available/:shoppingListId', AuthenticatedController(AgentController.getAvailableAgentsForOrder));
router.post('/assign/:orderId', AuthenticatedController(AgentController.assignOrderToAgent));

// Generic parameter routes LAST
router.get('/:id', AgentController.getAgentProfile);
router.get('/:id/stats', AuthenticatedController(AgentController.getAgentStats));

export default router;