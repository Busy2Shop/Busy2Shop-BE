// src/routes/agent.routes.ts
import { Router } from 'express';
import AgentController from '../controllers/agent.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router = Router();

// Public routes
router.get('/', AgentController.getAllAgents);
router.get('/:id', AgentController.getAgentProfile);

// Protected routes
router.use( basicAuth('access'));
router.get('/:id/stats', basicAuth('access'),  AuthenticatedController(AgentController.getAgentStats));
router.get('/available/:shoppingListId', basicAuth('access'),  AuthenticatedController(AgentController.getAvailableAgentsForOrder));
router.post('/assign/:orderId', basicAuth('access'),  AuthenticatedController(AgentController.assignOrderToAgent));

export default router;