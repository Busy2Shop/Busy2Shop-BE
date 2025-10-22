import express, { Router } from 'express';
import SupportController from '../controllers/support.controller';
import { AuthenticatedController, optionalAuth } from '../middlewares/authMiddleware';

const router: Router = express.Router();

// ========================================
// SUPPORT TICKET ROUTES
// ========================================

/**
 * Create a new support ticket
 * POST /api/support/tickets
 * Public - optionalAuth allows both guest and authenticated users
 */
router.post('/tickets', optionalAuth, AuthenticatedController(SupportController.createTicket));

/**
 * Get user's own tickets (authenticated users only)
 * GET /api/support/tickets/my-tickets
 * Requires authentication
 */
router.get('/tickets/my-tickets', optionalAuth, AuthenticatedController(SupportController.getMyTickets));

/**
 * Get specific ticket details
 * GET /api/support/tickets/:id
 * Requires authentication - users can only view their own tickets
 */
router.get('/tickets/:id', optionalAuth, AuthenticatedController(SupportController.getTicketById));

/**
 * Add response to a ticket
 * POST /api/support/tickets/:id/response
 * Requires authentication
 */
router.post('/tickets/:id/response', optionalAuth, AuthenticatedController(SupportController.addResponse));

export default router;
