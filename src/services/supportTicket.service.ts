import { Op, Transaction, WhereOptions } from 'sequelize';
import SupportTicket, {
    ISupportTicket,
    TicketState,
    TicketPriority,
    TicketCategory,
    TicketType,
    ITicketResponse,
} from '../models/supportTicket.model';
import User from '../models/user.model';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../utils/customErrors';
import Pagination, { IPaginationQuery, IPaging } from '../utils/pagination';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { emailService } from '../utils/Email';

// ========================================
// TYPE DEFINITIONS
// ========================================

export interface ICreateTicketData {
    email: string;
    name: string;
    subject: string;
    message: string;
    type: TicketType;
    category: TicketCategory;
    phone?: string;
    priority?: TicketPriority;
    userAgent?: string;
    ipAddress?: string;
}

export interface ITicketFilters extends IPaginationQuery {
    state?: TicketState;
    priority?: TicketPriority;
    category?: TicketCategory;
    type?: TicketType;
    assignedAdminId?: string;
    userId?: string;
    search?: string;
}

export interface ITicketStats {
    total: number;
    pending: number;
    inProgress: number;
    resolved: number;
    closed: number;
    byCategory: { [key: string]: number };
    byPriority: { [key: string]: number };
    averageResponseTime: number; // in hours
    unassigned: number;
}

// ========================================
// SERVICE CLASS
// ========================================

export default class SupportTicketService {
    /**
     * Create a new support ticket
     * @param data - Ticket creation data
     * @param userId - Optional userId if user is logged in
     * @param transaction - Optional transaction for atomic operations
     */
    static async createTicket(
        data: ICreateTicketData,
        userId?: string,
        transaction?: Transaction
    ): Promise<SupportTicket> {
        try {
            const ticketData: ISupportTicket = {
                email: data.email,
                name: data.name,
                subject: data.subject,
                message: data.message,
                type: data.type,
                category: data.category,
                phone: data.phone,
                priority: data.priority || TicketPriority.Medium,
                state: TicketState.Pending,
                userId: userId || null,
                userAgent: data.userAgent,
                ipAddress: data.ipAddress,
            };

            const ticket = await SupportTicket.create(ticketData, { transaction });

            logger.info(`Support ticket created: ${ticket.id} by ${userId ? 'user ' + userId : 'guest'}`);

            // Send email notification to support team
            await this.sendTicketCreatedEmail(ticket);

            return ticket;
        } catch (error) {
            logger.error('Error creating support ticket:', error);
            throw error;
        }
    }

    /**
     * Get all tickets with filtering and pagination
     */
    static async getAllTickets(filters: ITicketFilters): Promise<{ tickets: SupportTicket[]; pagination: IPaging }> {
        try {
            const where: WhereOptions<SupportTicket> = {};

            // Apply filters
            if (filters.state) {
                where.state = filters.state;
            }
            if (filters.priority) {
                where.priority = filters.priority;
            }
            if (filters.category) {
                where.category = filters.category;
            }
            if (filters.type) {
                where.type = filters.type;
            }
            if (filters.assignedAdminId) {
                where.assignedAdminId = filters.assignedAdminId;
            }
            if (filters.userId) {
                where.userId = filters.userId;
            }

            // Search across multiple fields
            if (filters.search) {
                (where as any)[Op.or] = [
                    { subject: { [Op.iLike]: `%${filters.search}%` } },
                    { email: { [Op.iLike]: `%${filters.search}%` } },
                    { name: { [Op.iLike]: `%${filters.search}%` } },
                    { id: { [Op.iLike]: `%${filters.search}%` } },
                ];
            }

            //Handle pagination
            const queryOptions: any = {};
            if (filters.page && filters.size && filters.page > 0 && filters.size > 0) {
                const { limit, offset } = Pagination.getPagination({ page: filters.page, size: filters.size } as IPaging);
                queryOptions.limit = limit ?? 0;
                queryOptions.offset = offset ?? 0;
            }

            const { count, rows } = await SupportTicket.findAndCountAll({
                where,
                include: [
                    {
                        model: User,
                        as: 'assignedAdmin',
                        attributes: ['id', 'firstName', 'lastName', 'email'],
                        required: false,
                    },
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'firstName', 'lastName', 'email', 'phone'],
                        required: false,
                    },
                    {
                        model: User,
                        as: 'resolver',
                        attributes: ['id', 'firstName', 'lastName', 'email'],
                        required: false,
                    },
                ],
                order: [
                    ['priority', 'DESC'],
                    ['createdAt', 'DESC'],
                ],
                ...queryOptions,
            });

            // Calculate pagination metadata
            let pagination: IPaging = {
                page: filters.page || null,
                limit: filters.size || null,
                size: filters.size || null,
            };

            if (filters.page && filters.size && rows.length > 0) {
                const totalPages = Pagination.estimateTotalPage({ count, limit: filters.size } as IPaging);
                pagination = {
                    count,
                    page: filters.page,
                    limit: filters.size,
                    size: filters.size,
                    ...totalPages,
                };
            }

            return { tickets: rows, pagination };
        } catch (error) {
            logger.error('Error fetching support tickets:', error);
            throw error;
        }
    }

    /**
     * Get ticket by ID with all related data
     */
    static async getTicketById(ticketId: string): Promise<SupportTicket> {
        try {
            const ticket = await SupportTicket.findByPk(ticketId, {
                include: [
                    {
                        model: User,
                        as: 'assignedAdmin',
                        attributes: ['id', 'firstName', 'lastName', 'email', 'phone'],
                        required: false,
                    },
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'firstName', 'lastName', 'email', 'phone'],
                        required: false,
                    },
                    {
                        model: User,
                        as: 'resolver',
                        attributes: ['id', 'firstName', 'lastName', 'email'],
                        required: false,
                    },
                ],
            });

            if (!ticket) {
                throw new NotFoundError('Support ticket not found');
            }

            return ticket;
        } catch (error) {
            logger.error(`Error fetching ticket ${ticketId}:`, error);
            throw error;
        }
    }

    /**
     * Get tickets for a specific user
     */
    static async getUserTickets(userId: string, filters: IPaginationQuery): Promise<{ tickets: SupportTicket[]; pagination: IPaging }> {
        try {
            // Handle pagination
            const queryOptions: any = {};
            if (filters.page && filters.size && filters.page > 0 && filters.size > 0) {
                const { limit, offset } = Pagination.getPagination({ page: filters.page, size: filters.size } as IPaging);
                queryOptions.limit = limit ?? 0;
                queryOptions.offset = offset ?? 0;
            }

            const { count, rows } = await SupportTicket.findAndCountAll({
                where: { userId },
                include: [
                    {
                        model: User,
                        as: 'assignedAdmin',
                        attributes: ['id', 'firstName', 'lastName'],
                        required: false,
                    },
                ],
                order: [['createdAt', 'DESC']],
                ...queryOptions,
            });

            // Calculate pagination metadata
            let pagination: IPaging = {
                page: filters.page || null,
                limit: filters.size || null,
                size: filters.size || null,
            };

            if (filters.page && filters.size && rows.length > 0) {
                const totalPages = Pagination.estimateTotalPage({ count, limit: filters.size } as IPaging);
                pagination = {
                    count,
                    page: filters.page,
                    limit: filters.size,
                    size: filters.size,
                    ...totalPages,
                };
            }

            return { tickets: rows, pagination };
        } catch (error) {
            logger.error(`Error fetching tickets for user ${userId}:`, error);
            throw error;
        }
    }

    /**
     * Assign ticket to an admin (Super Admin only)
     */
    static async assignTicket(
        ticketId: string,
        adminId: string,
        assignedBy: string,
        transaction?: Transaction
    ): Promise<SupportTicket> {
        try {
            const ticket = await SupportTicket.findByPk(ticketId, { transaction });

            if (!ticket) {
                throw new NotFoundError('Support ticket not found');
            }

            // Verify admin exists
            const admin = await User.findByPk(adminId, { transaction });
            if (!admin) {
                throw new BadRequestError('Invalid admin user');
            }

            ticket.assignedAdminId = adminId;
            if (ticket.state === TicketState.Pending) {
                ticket.state = TicketState.InProgress;
            }

            await ticket.save({ transaction });

            logger.info(`Ticket ${ticketId} assigned to admin ${adminId} by ${assignedBy}`);

            // Send email notification to assigned admin
            await this.sendTicketAssignedEmail(ticket, admin);

            return ticket;
        } catch (error) {
            logger.error(`Error assigning ticket ${ticketId}:`, error);
            throw error;
        }
    }

    /**
     * Update ticket status
     */
    static async updateTicketStatus(
        ticketId: string,
        state: TicketState,
        adminId: string,
        transaction?: Transaction
    ): Promise<SupportTicket> {
        try {
            const ticket = await SupportTicket.findByPk(ticketId, { transaction });

            if (!ticket) {
                throw new NotFoundError('Support ticket not found');
            }

            ticket.state = state;

            if (state === TicketState.Resolved || state === TicketState.Closed) {
                ticket.resolvedAt = new Date();
                ticket.resolvedBy = adminId;
            }

            await ticket.save({ transaction });

            logger.info(`Ticket ${ticketId} status updated to ${state} by admin ${adminId}`);

            // Send email notification if resolved
            if (state === TicketState.Resolved) {
                await this.sendTicketResolvedEmail(ticket);
            }

            return ticket;
        } catch (error) {
            logger.error(`Error updating ticket status ${ticketId}:`, error);
            throw error;
        }
    }

    /**
     * Add a response to a ticket
     */
    static async addResponse(
        ticketId: string,
        message: string,
        responderId: string,
        responderName: string,
        isAdmin: boolean,
        transaction?: Transaction
    ): Promise<SupportTicket> {
        try {
            const ticket = await SupportTicket.findByPk(ticketId, { transaction });

            if (!ticket) {
                throw new NotFoundError('Support ticket not found');
            }

            // If user (not admin) is responding, verify they own the ticket
            if (!isAdmin && ticket.userId !== responderId) {
                throw new UnauthorizedError('You can only respond to your own tickets');
            }

            const response: ITicketResponse = {
                id: uuidv4(),
                message,
                responderId,
                responderName,
                isAdmin,
                timestamp: new Date(),
            };

            const responses = ticket.responses || [];
            responses.push(response);

            ticket.responses = responses;
            ticket.lastResponseAt = new Date();

            // If ticket is pending and admin is responding, move to in-progress
            if (ticket.state === TicketState.Pending && isAdmin) {
                ticket.state = TicketState.InProgress;
            }

            await ticket.save({ transaction });

            logger.info(`Response added to ticket ${ticketId} by ${isAdmin ? 'admin' : 'user'} ${responderId}`);

            // Send email notification about the response
            await this.sendResponseEmail(ticket, response);

            return ticket;
        } catch (error) {
            logger.error(`Error adding response to ticket ${ticketId}:`, error);
            throw error;
        }
    }

    /**
     * Update ticket priority (Admin only)
     */
    static async updatePriority(
        ticketId: string,
        priority: TicketPriority,
        adminId: string,
        transaction?: Transaction
    ): Promise<SupportTicket> {
        try {
            const ticket = await SupportTicket.findByPk(ticketId, { transaction });

            if (!ticket) {
                throw new NotFoundError('Support ticket not found');
            }

            ticket.priority = priority;
            await ticket.save({ transaction });

            logger.info(`Ticket ${ticketId} priority updated to ${priority} by admin ${adminId}`);

            return ticket;
        } catch (error) {
            logger.error(`Error updating ticket priority ${ticketId}:`, error);
            throw error;
        }
    }

    /**
     * Get ticket statistics for admin dashboard
     */
    static async getTicketStats(): Promise<ITicketStats> {
        try {
            const tickets = await SupportTicket.findAll({
                attributes: ['state', 'category', 'priority', 'createdAt', 'lastResponseAt', 'assignedAdminId'],
            });

            const stats: ITicketStats = {
                total: tickets.length,
                pending: 0,
                inProgress: 0,
                resolved: 0,
                closed: 0,
                byCategory: {},
                byPriority: {},
                averageResponseTime: 0,
                unassigned: 0,
            };

            let totalResponseTime = 0;
            let respondedTickets = 0;

            tickets.forEach((ticket) => {
                // Count by state
                switch (ticket.state) {
                    case TicketState.Pending:
                        stats.pending++;
                        break;
                    case TicketState.InProgress:
                        stats.inProgress++;
                        break;
                    case TicketState.Resolved:
                        stats.resolved++;
                        break;
                    case TicketState.Closed:
                        stats.closed++;
                        break;
                }

                // Count by category
                stats.byCategory[ticket.category] = (stats.byCategory[ticket.category] || 0) + 1;

                // Count by priority
                stats.byPriority[ticket.priority] = (stats.byPriority[ticket.priority] || 0) + 1;

                // Calculate response time
                if (ticket.lastResponseAt) {
                    const responseTime = ticket.lastResponseAt.getTime() - ticket.createdAt.getTime();
                    totalResponseTime += responseTime;
                    respondedTickets++;
                }

                // Count unassigned
                if (!ticket.assignedAdminId) {
                    stats.unassigned++;
                }
            });

            // Calculate average response time in hours
            if (respondedTickets > 0) {
                stats.averageResponseTime = Math.round(totalResponseTime / respondedTickets / (1000 * 60 * 60));
            }

            return stats;
        } catch (error) {
            logger.error('Error fetching ticket stats:', error);
            throw error;
        }
    }

    // ========================================
    // EMAIL NOTIFICATION METHODS
    // ========================================

    /**
     * Send email when ticket is created
     */
    private static async sendTicketCreatedEmail(ticket: SupportTicket): Promise<void> {
        try {
            await emailService.sendTicketCreatedEmail({
                recipientEmail: ticket.email,
                name: ticket.name,
                ticketId: ticket.id,
                subject: ticket.subject,
                category: ticket.category,
            });
        } catch (error) {
            logger.error('Error sending ticket created email:', error);
            // Don't throw - email failure shouldn't block ticket creation
        }
    }

    /**
     * Send email when ticket is assigned to an admin
     */
    private static async sendTicketAssignedEmail(ticket: SupportTicket, admin: User): Promise<void> {
        try {
            await emailService.sendTicketAssignedEmail({
                recipientEmail: admin.email,
                adminName: `${admin.firstName} ${admin.lastName}`,
                ticketId: ticket.id,
                subject: ticket.subject,
                priority: ticket.priority,
                category: ticket.category,
                customerName: ticket.name,
                customerEmail: ticket.email,
            });
        } catch (error) {
            logger.error('Error sending ticket assigned email:', error);
        }
    }

    /**
     * Send email when response is added
     */
    private static async sendResponseEmail(ticket: SupportTicket, response: ITicketResponse): Promise<void> {
        try {
            // If admin responded, notify the customer
            if (response.isAdmin) {
                await emailService.sendTicketResponseEmail({
                    recipientEmail: ticket.email,
                    name: ticket.name,
                    ticketId: ticket.id,
                    subject: ticket.subject,
                    response: response.message,
                    responderName: response.responderName,
                    isAdmin: true,
                });
            }
            // If customer responded, notify the assigned admin
            else if (ticket.assignedAdminId) {
                const admin = await User.findByPk(ticket.assignedAdminId);
                if (admin) {
                    await emailService.sendTicketResponseEmail({
                        recipientEmail: admin.email,
                        name: `${admin.firstName} ${admin.lastName}`,
                        ticketId: ticket.id,
                        subject: ticket.subject,
                        response: response.message,
                        responderName: ticket.name,
                        isAdmin: false,
                    });
                }
            }
        } catch (error) {
            logger.error('Error sending response email:', error);
        }
    }

    /**
     * Send email when ticket is resolved
     */
    private static async sendTicketResolvedEmail(ticket: SupportTicket): Promise<void> {
        try {
            // Get resolver name
            let resolverName = 'Support Team';
            if (ticket.resolvedBy) {
                const resolver = await User.findByPk(ticket.resolvedBy);
                if (resolver) {
                    resolverName = `${resolver.firstName} ${resolver.lastName}`;
                }
            }

            await emailService.sendTicketResolvedEmail({
                recipientEmail: ticket.email,
                name: ticket.name,
                ticketId: ticket.id,
                subject: ticket.subject,
                resolvedBy: resolverName,
            });
        } catch (error) {
            logger.error('Error sending ticket resolved email:', error);
        }
    }
}
