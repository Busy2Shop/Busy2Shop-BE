// src/routes/agent.routes.ts
import { Router } from 'express';
import AgentController from '../controllers/agent.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router = Router();

// Public routes
router.get('/', AgentController.getAllAgents);
router.get('/:id', AgentController.getAgentProfile);
router.get('/nearby', AgentController.findNearbyAgents);

// Protected routes
router.use(basicAuth('access'));

// Agent stats and order management
router.get('/:id/stats', AuthenticatedController(AgentController.getAgentStats));
router.get('/available/:shoppingListId', AuthenticatedController(AgentController.getAvailableAgentsForOrder));
router.post('/assign/:orderId', AuthenticatedController(AgentController.assignOrderToAgent));

// Agent location management routes
router.post('/locations', AuthenticatedController(AgentController.addLocation));
router.put('/locations/:id', AuthenticatedController(AgentController.updateLocation));
router.delete('/locations/:id', AuthenticatedController(AgentController.deleteLocation));
router.get('/locations', AuthenticatedController(AgentController.getLocations));

// Agent status management routes
router.put('/status', AuthenticatedController(AgentController.updateStatus));
router.get('/status', AuthenticatedController(AgentController.getStatus));

export default router;