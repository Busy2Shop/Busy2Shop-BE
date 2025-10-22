import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import SupportTicketService, { ICreateTicketData, ITicketFilters } from '../services/supportTicket.service';
import { BadRequestError } from '../utils/customErrors';
import { TicketType, TicketCategory, TicketPriority } from '../models/supportTicket.model';
import User from '../models/user.model';

export default class SupportController {
    /**
     * Create a new support ticket
     * POST /api/support/tickets
     * Public endpoint - supports both authenticated and guest users
     */
    static async createTicket(req: Request, res: Response) {
        const { email, name, subject, message, type, category, phone, priority } = req.body;

        // Validate required fields
        if (!subject || !message || !type || !category) {
            throw new BadRequestError('Subject, message, type, and category are required');
        }

        // Validate enum values
        if (!Object.values(TicketType).includes(type)) {
            throw new BadRequestError('Invalid ticket type');
        }

        if (!Object.values(TicketCategory).includes(category)) {
            throw new BadRequestError('Invalid ticket category');
        }

        // For authenticated users, check if user info is provided
        const authenticatedReq = req as AuthenticatedRequest;
        let userId: string | undefined;
        let ticketData: ICreateTicketData;

        if (authenticatedReq.user) {
            // User is logged in - use their info
            userId = authenticatedReq.user.id;
            const user = await User.findByPk(userId);

            if (!user) {
                throw new BadRequestError('User not found');
            }

            // Convert phone object to string if it exists
            let phoneString = phone;
            if (user.phone && typeof user.phone === 'object') {
                phoneString = `${user.phone.countryCode}${user.phone.number}`;
            }

            ticketData = {
                email: user.email || email,
                name: `${user.firstName} ${user.lastName}` || name,
                subject,
                message,
                type,
                category,
                phone: phoneString,
                priority,
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip || req.socket.remoteAddress,
            };
        } else {
            // Guest user - require email and name
            if (!email || !name) {
                throw new BadRequestError('Email and name are required for guest users');
            }

            ticketData = {
                email,
                name,
                subject,
                message,
                type,
                category,
                phone,
                priority,
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip || req.socket.remoteAddress,
            };
        }

        const ticket = await SupportTicketService.createTicket(ticketData, userId);

        res.status(201).json({
            status: 'success',
            message: 'Support ticket created successfully. We will get back to you soon.',
            data: {
                ticketId: ticket.id,
                subject: ticket.subject,
                state: ticket.state,
                createdAt: ticket.createdAt,
            },
        });
    }

    /**
     * Get user's own tickets
     * GET /api/support/tickets/my-tickets
     * Requires authentication
     */
    static async getMyTickets(req: AuthenticatedRequest, res: Response) {
        const { page = 1, size = 10 } = req.query;

        const result = await SupportTicketService.getUserTickets(req.user.id, {
            page: Number(page),
            size: Number(size),
        });

        res.status(200).json({
            status: 'success',
            message: 'Tickets retrieved successfully',
            data: result,
        });
    }

    /**
     * Get specific ticket details
     * GET /api/support/tickets/:id
     * Requires authentication - users can only view their own tickets
     */
    static async getTicketById(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;

        const ticket = await SupportTicketService.getTicketById(id);

        // Regular users can only view their own tickets
        // (Admins use the admin endpoint)
        if (ticket.userId !== req.user.id) {
            throw new BadRequestError('You can only view your own tickets');
        }

        res.status(200).json({
            status: 'success',
            message: 'Ticket retrieved successfully',
            data: ticket,
        });
    }

    /**
     * Add a response to a ticket
     * POST /api/support/tickets/:id/response
     * Requires authentication
     */
    static async addResponse(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { message } = req.body;

        if (!message) {
            throw new BadRequestError('Message is required');
        }

        const user = await User.findByPk(req.user.id);
        if (!user) {
            throw new BadRequestError('User not found');
        }

        const responderName = `${user.firstName} ${user.lastName}`;
        // Regular users (customers/agents) responding via this endpoint are never admins
        // Admins use the admin endpoint
        const isAdmin = false;

        const ticket = await SupportTicketService.addResponse(
            id,
            message,
            req.user.id,
            responderName,
            isAdmin
        );

        res.status(200).json({
            status: 'success',
            message: 'Response added successfully',
            data: ticket,
        });
    }
}
