import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/customErrors';
import UserService from '../services/user.service';
import AgentService, { IViewAgentsQuery } from '../services/agent.service';
import UserSettings from '../models/userSettings.model';
import { Op, QueryTypes } from 'sequelize';
import { Database } from '../models';

export default class AgentController {
    /**
     * Get all agents
     * @param req Request
     * @param res Response
     */
    static async getAllAgents(req: Request, res: Response) {
        const queryData: IViewAgentsQuery = {
            page: req.query.page ? parseInt(req.query.page as string) : undefined,
            size: req.query.size ? parseInt(req.query.size as string) : undefined,
            q: req.query.q as string,
            isActive: req.query.isActive ? req.query.isActive === 'true' : undefined,
        };

        const result = await AgentService.getAgents(queryData);

        res.status(200).json({
            status: 'success',
            message: 'Agents retrieved successfully',
            data: result,
        });
    }

    /**
     * Find nearby agents
     * @param req Request
     * @param res Response
     */
    static async findNearbyAgents(req: Request, res: Response) {
        const { lat, lng, radius = 5 } = req.query;

        if (!lat || !lng) {
            throw new BadRequestError('Latitude and longitude are required');
        }

        const agents = await AgentService.findNearbyAgents(
            parseFloat(lat as string),
            parseFloat(lng as string),
            parseFloat(radius as string)
        );

        res.status(200).json({
            status: 'success',
            message: 'Nearby agents retrieved successfully',
            data: agents,
        });
    }

    /**
     * Get agent profile by ID (public endpoint)
     * @param req Request
     * @param res Response
     */
    static async getAgentProfile(req: Request, res: Response) {
        const { id } = req.params;
        const agent = await AgentService.getAgentById(id);
        
        res.status(200).json({
            status: 'success',
            message: 'Agent profile retrieved successfully',
            data: agent,
        });
    }

    /**
     * Get available agents for an order
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getAvailableAgentsForOrder(req: AuthenticatedRequest, res: Response) {
        const { shoppingListId } = req.params;
        const agents = await AgentService.getAvailableAgentsForOrder(shoppingListId);
        
        res.status(200).json({
            status: 'success',
            message: 'Available agents retrieved successfully',
            data: agents,
        });
    }

    /**
     * Assign order to agent
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async assignOrderToAgent(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;
        const { agentId } = req.body;
        
        if (!agentId) {
            throw new BadRequestError('Agent ID is required');
        }
        
        const order = await AgentService.assignOrderToAgent(orderId, agentId);
        
        res.status(200).json({
            status: 'success',
            message: 'Order assigned to agent successfully',
            data: order,
        });
    }

    /**
     * Get agent locations
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getLocations(req: AuthenticatedRequest, res: Response) {
        const { id } = req.user;
        const locations = await AgentService.getAgentLocations(id);
        
        res.status(200).json({
            status: 'success',
            message: 'Agent locations retrieved successfully',
            data: locations,
        });
    }

    /**
     * Add agent location
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async addLocation(req: AuthenticatedRequest, res: Response) {
        const { id } = req.user;
        const locationData = req.body;
        
        const location = await AgentService.addAgentLocation(id, locationData);
        
        res.status(201).json({
            status: 'success',
            message: 'Location added successfully',
            data: location,
        });
    }

    /**
     * Update agent location
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async updateLocation(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const agentId = req.user.id;
        const locationData = req.body;
        
        const location = await AgentService.updateAgentLocation(agentId, id, locationData);
        
        res.status(200).json({
            status: 'success',
            message: 'Location updated successfully',
            data: location,
        });
    }

    /**
     * Delete agent location
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async deleteLocation(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const agentId = req.user.id;
        
        await AgentService.deleteAgentLocation(id, agentId);
        
        res.status(200).json({
            status: 'success',
            message: 'Location deleted successfully',
            data: null,
        });
    }

    /**
     * Get agent status
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getStatus(req: AuthenticatedRequest, res: Response) {
        const { id } = req.user;
        const status = await AgentService.getAgentStatus(id);
        
        res.status(200).json({
            status: 'success',
            message: 'Agent status retrieved successfully',
            data: status,
        });
    }

    /**
     * Update agent status
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async updateStatus(req: AuthenticatedRequest, res: Response) {
        const { id } = req.user;
        const { status, isAcceptingOrders } = req.body;
        
        const agent = await AgentService.updateAgentStatus(id, status, isAcceptingOrders);
        
        res.status(200).json({
            status: 'success',
            message: 'Agent status updated successfully',
            data: agent,
        });
    }

    /**
     * Get comprehensive agent profile stats
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getAgentStats(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can access profile stats');
        }

        try {
            // Get user with full settings
            const user = await AgentService.getAgentById(id);
            
            // Mock data for now - in a real app, this would come from order/transaction tables
            const currentDate = new Date();
            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
            const lastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
            const endOfLastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);

            // Calculate basic stats based on user data
            // Use user creation date if settings don't exist or don't have joinDate
            const joinDate = user.settings?.joinDate ? new Date(user.settings.joinDate) : user.createdAt;
            const daysSinceJoin = Math.floor((currentDate.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24));
            
            // Generate realistic stats based on join date and activity
            const baseOrdersPerDay = 2;
            const totalOrders = Math.floor(daysSinceJoin * baseOrdersPerDay * Math.random() * 0.8 + daysSinceJoin);
            const completedOrders = Math.floor(totalOrders * 0.95); // 95% completion rate
            const cancelledOrders = totalOrders - completedOrders;
            const averageOrderValue = 3500; // Average order value in Naira
            const commissionRate = 0.15; // 15% commission
            const totalEarnings = Math.floor(completedOrders * averageOrderValue * commissionRate);
            const thisMonthOrders = Math.floor(Math.min(totalOrders, 25)); // Max 25 orders this month
            const thisMonthEarnings = Math.floor(thisMonthOrders * averageOrderValue * commissionRate);
            const averageRating = 4.2 + Math.random() * 0.7; // Random rating between 4.2-4.9
            const totalReviews = Math.floor(completedOrders * 0.8); // 80% of customers leave reviews
            const responseTime = 45 + Math.floor(Math.random() * 60); // Response time in seconds
            const activeHours = Math.floor(daysSinceJoin * 6 * Math.random() + daysSinceJoin * 2); // Hours active
            const uniqueCustomers = Math.floor(totalOrders * 0.7); // Assuming some repeat customers

            const stats = {
                totalOrders,
                completedOrders,
                cancelledOrders,
                totalEarnings,
                thisMonthEarnings,
                averageOrderValue,
                averageRating: Math.round(averageRating * 10) / 10,
                totalReviews,
                completionRate: Math.round((completedOrders / totalOrders) * 100),
                responseTime,
                activeHours,
                uniqueCustomers,
                lastActiveDate: user.settings?.lastLogin || new Date().toISOString(),
            };

            res.status(200).json({
                status: 'success',
                message: 'Agent stats retrieved successfully',
                data: stats,
            });

        } catch (error) {
            console.error('Error fetching agent stats:', error);
            throw new BadRequestError('Failed to retrieve agent statistics');
        }
    }

    /**
     * Get agent's recent orders
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getRecentOrders(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;
        const { limit = '5' } = req.query;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can access order history');
        }

        try {
            // Mock recent orders data - in real app, this would come from orders table
            const mockOrders = Array.from({ length: parseInt(limit as string) }, (_, index) => ({
                id: `order_${Date.now()}_${index}`,
                orderNumber: `ORD${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
                status: ['completed', 'completed', 'completed', 'cancelled'][Math.floor(Math.random() * 4)],
                totalAmount: Math.floor(Math.random() * 15000) + 2000, // 2000-17000 Naira
                agentCommission: function(this: any) { 
                    return Math.floor(this.totalAmount * 0.15);
                },
                customer: {
                    name: ['John Doe', 'Jane Smith', 'Mike Johnson', 'Sarah Williams'][Math.floor(Math.random() * 4)],
                    address: ['123 Main St, Ikeja', '456 Oak Ave, Victoria Island', '789 Pine Rd, Lekki'][Math.floor(Math.random() * 3)],
                },
                createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(), // Last 7 days
                completedAt: new Date(Date.now() - Math.random() * 6 * 24 * 60 * 60 * 1000).toISOString(),
            }));

            // Calculate commission for each order
            const ordersWithCommission = mockOrders.map(order => ({
                ...order,
                agentCommission: Math.floor(order.totalAmount * 0.15),
            }));

            res.status(200).json({
                status: 'success',
                message: 'Recent orders retrieved successfully',
                data: ordersWithCommission,
            });

        } catch (error) {
            console.error('Error fetching recent orders:', error);
            throw new BadRequestError('Failed to retrieve recent orders');
        }
    }

    /**
     * Get agent's daily earnings data for charts
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getDailyEarnings(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;
        const { range = 'week' } = req.query;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can access earnings data');
        }

        try {
            const days = range === 'month' ? 30 : range === 'week' ? 7 : 1;
            const dailyEarnings = [];

            for (let i = days - 1; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                
                const earnings = Math.floor(Math.random() * 8000) + 1000; // 1000-9000 per day
                const orders = Math.floor(Math.random() * 8) + 1; // 1-8 orders per day
                const tips = Math.floor(Math.random() * 1000); // 0-1000 tips
                const bonus = i === 0 ? Math.floor(Math.random() * 2000) : 0; // Random bonus today

                dailyEarnings.push({
                    date: date.toISOString().split('T')[0],
                    earnings,
                    orders,
                    tips,
                    bonus,
                });
            }

            res.status(200).json({
                status: 'success',
                message: 'Daily earnings retrieved successfully',
                data: dailyEarnings,
            });

        } catch (error) {
            console.error('Error fetching daily earnings:', error);
            throw new BadRequestError('Failed to retrieve daily earnings');
        }
    }

    /**
     * Update agent status (for mobile profile)
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async updateAgentStatus(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;
        const { status: newStatus } = req.body;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can update status');
        }

        // Validate status
        const validStatuses = ['available', 'busy', 'away', 'offline'];
        if (!validStatuses.includes(newStatus)) {
            throw new BadRequestError('Invalid status. Must be one of: available, busy, away, offline');
        }

        try {
            // Get current user settings
            const userSettings = await UserSettings.findOne({ where: { userId: id } });
            
            if (!userSettings) {
                throw new NotFoundError('User settings not found');
            }

            // Update agent metadata with new status
            const currentAgentMeta = userSettings.agentMetaData || {
                nin: '',
                images: [],
                currentStatus: 'offline',
                lastStatusUpdate: new Date().toISOString(),
                isAcceptingOrders: false,
            };
            
            const updatedAgentMeta = {
                ...currentAgentMeta,
                currentStatus: newStatus,
                lastStatusUpdate: new Date().toISOString(),
                isAcceptingOrders: newStatus === 'available',
            };

            await userSettings.update({ 
                agentMetaData: updatedAgentMeta,
                lastLogin: new Date(), // Update last seen
            });

            res.status(200).json({
                status: 'success',
                message: 'Agent status updated successfully',
                data: {
                    currentStatus: newStatus,
                    isAcceptingOrders: newStatus === 'available',
                    lastStatusUpdate: updatedAgentMeta.lastStatusUpdate,
                },
            });

        } catch (error) {
            console.error('Error updating agent status:', error);
            throw new BadRequestError('Failed to update agent status');
        }
    }

    /**
     * Get today's quick stats for agent dashboard
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getTodayStats(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can access today stats');
        }

        try {
            // Mock today's stats - in real app, this would aggregate from today's orders
            const todayStats = {
                earnings: Math.floor(Math.random() * 5000) + 1000, // 1000-6000
                orders: Math.floor(Math.random() * 8) + 1, // 1-8 orders
                rating: 4.2 + Math.random() * 0.7, // 4.2-4.9
                activeTime: Math.floor(Math.random() * 8) + 2 + 'h ' + Math.floor(Math.random() * 60) + 'm',
            };

            res.status(200).json({
                status: 'success',
                message: 'Today stats retrieved successfully',
                data: todayStats,
            });

        } catch (error) {
            console.error('Error fetching today stats:', error);
            throw new BadRequestError('Failed to retrieve today statistics');
        }
    }

    /**
     * Get comprehensive profile data for authenticated agent
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getAgentProfileData(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can access agent profile');
        }

        try {
            // Get complete user data with settings
            const user = await UserService.viewSingleUser(id);
            
            // Construct comprehensive profile response
            const profileData = {
                id: user.id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                displayImage: user.displayImage,
                phone: user.phone ? `${user.phone.countryCode}${user.phone.number}` : null,
                location: user.location,
                joinDate: user.settings?.joinDate,
                lastLogin: user.settings?.lastLogin,
                isKycVerified: user.settings?.isKycVerified || false,
                agentMetaData: user.settings?.agentMetaData,
                kycStatus: user.settings?.agentMetaData?.kycStatus || 'incomplete',
                // Add computed profile fields
                status: user.settings?.agentMetaData?.currentStatus || 'offline',
                isAcceptingOrders: user.settings?.agentMetaData?.isAcceptingOrders || false,
                verificationStatus: user.settings?.isKycVerified ? 'approved' : 
                                 user.settings?.agentMetaData?.kycStatus || 'pending',
            };

            res.status(200).json({
                status: 'success',
                message: 'Agent profile retrieved successfully',
                data: profileData,
            });

        } catch (error) {
            console.error('Error fetching agent profile:', error);
            throw new BadRequestError('Failed to retrieve agent profile');
        }
    }

    /**
     * Get agent orders with status filtering
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getAgentOrders(req: AuthenticatedRequest, res: Response) {
        const { status: userStatus } = req.user;
        const { status, page = 1, limit = 10 } = req.query;

        // Ensure the user is an agent
        if (userStatus.userType !== 'agent') {
            throw new ForbiddenError('Only agents can access orders');
        }

        try {
            // Route to appropriate method based on status
            if (status && typeof status === 'string') {
                const statusList = status.toLowerCase();
                
                if (statusList.includes('completed')) {
                    return await AgentController.getCompletedOrders(req, res);
                } else if (statusList.includes('available') || statusList.includes('pending')) {
                    return await AgentController.getAvailableOrders(req, res);
                } else {
                    return await AgentController.getActiveOrders(req, res);
                }
            } else {
                // Default to active orders
                return await AgentController.getActiveOrders(req, res);
            }
        } catch (error) {
            console.error('Error fetching agent orders:', error);
            throw new BadRequestError('Failed to retrieve orders');
        }
    }

    /**
     * Get available orders for agent (orders that can be accepted)
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getAvailableOrders(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can access available orders');
        }

        try {
            // Get orders that are pending and not yet assigned to an agent
            const orders = await Database.query(`
                SELECT 
                    o.id, o."orderNumber", o.status, o."totalAmount", o."serviceFee", o."deliveryFee",
                    o."deliveryAddress", o."customerNotes", o."createdAt", o."acceptedAt",
                    (o."totalAmount" * 0.15) as "agentCommission",
                    u."firstName", u."lastName", u.phone, u."displayImage",
                    m.name as "marketName", m.address as "marketAddress", m.location as "marketLocation",
                    sl.name as "listName", sl."estimatedTotal",
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'name', sli.name,
                                'quantity', sli.quantity,
                                'unit', sli.unit,
                                'estimatedPrice', sli."estimatedPrice"
                            )
                        ) FILTER (WHERE sli.id IS NOT NULL), '[]'::json
                    ) as items
                FROM "Orders" o
                JOIN "Users" u ON o."customerId" = u.id
                JOIN "ShoppingLists" sl ON o."shoppingListId" = sl.id
                LEFT JOIN "Markets" m ON sl."marketId" = m.id
                LEFT JOIN "ShoppingListItems" sli ON sl.id = sli."shoppingListId"
                WHERE o.status = 'pending' 
                    AND o."agentId" IS NULL
                    AND o."paymentStatus" = 'completed'
                GROUP BY o.id, u.id, m.id, sl.id
                ORDER BY o."createdAt" ASC
                LIMIT 20
            `, {
                type: QueryTypes.SELECT,
            });

            res.status(200).json({
                status: 'success',
                message: 'Available orders retrieved successfully',
                data: orders,
            });

        } catch (error) {
            console.error('Error fetching available orders:', error);
            throw new BadRequestError('Failed to retrieve available orders');
        }
    }

    /**
     * Get active orders for agent (orders currently being processed)
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getActiveOrders(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can access active orders');
        }

        try {
            const orders = await Database.query(`
                SELECT 
                    o.id, o."orderNumber", o.status, o."totalAmount", o."serviceFee", o."deliveryFee",
                    o."deliveryAddress", o."customerNotes", o."createdAt", o."acceptedAt", 
                    o."shoppingStartedAt", o."deliveryStartedAt",
                    (o."totalAmount" * 0.15) as "agentCommission",
                    u."firstName", u."lastName", u.phone, u."displayImage",
                    m.name as "marketName", m.address as "marketAddress", m.location as "marketLocation",
                    sl.name as "listName", sl."estimatedTotal",
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'name', sli.name,
                                'quantity', sli.quantity,
                                'unit', sli.unit,
                                'estimatedPrice', sli."estimatedPrice",
                                'actualPrice', sli."actualPrice",
                                'notes', sli.notes,
                                'productImage', sli."productImage"
                            )
                        ) FILTER (WHERE sli.id IS NOT NULL), '[]'::json
                    ) as items
                FROM "Orders" o
                JOIN "Users" u ON o."customerId" = u.id
                JOIN "ShoppingLists" sl ON o."shoppingListId" = sl.id
                LEFT JOIN "Markets" m ON sl."marketId" = m.id
                LEFT JOIN "ShoppingListItems" sli ON sl.id = sli."shoppingListId"
                WHERE o."agentId" = :agentId 
                    AND o.status IN ('accepted', 'in_progress', 'shopping', 'shopping_completed', 'delivery')
                GROUP BY o.id, u.id, m.id, sl.id
                ORDER BY o."acceptedAt" DESC
            `, {
                replacements: { agentId: id },
                type: QueryTypes.SELECT,
            });

            res.status(200).json({
                status: 'success',
                message: 'Active orders retrieved successfully',
                data: orders,
            });

        } catch (error) {
            console.error('Error fetching active orders:', error);
            throw new BadRequestError('Failed to retrieve active orders');
        }
    }

    /**
     * Get completed orders for agent
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getCompletedOrders(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;
        const { page = 1, limit = 10 } = req.query;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can access completed orders');
        }

        try {
            const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
            
            const orders = await Database.query(`
                SELECT 
                    o.id, o."orderNumber", o.status, o."totalAmount", o."serviceFee", o."deliveryFee",
                    o."deliveryAddress", o."createdAt", o."completedAt",
                    (o."totalAmount" * 0.15) as "agentCommission",
                    u."firstName", u."lastName", u.phone,
                    m.name as "marketName", sl.name as "listName"
                FROM "Orders" o
                JOIN "Users" u ON o."customerId" = u.id
                JOIN "ShoppingLists" sl ON o."shoppingListId" = sl.id
                LEFT JOIN "Markets" m ON sl."marketId" = m.id
                WHERE o."agentId" = :agentId 
                    AND o.status = 'completed'
                ORDER BY o."completedAt" DESC
                LIMIT :limit OFFSET :offset
            `, {
                replacements: { agentId: id, limit: parseInt(limit as string), offset },
                type: QueryTypes.SELECT,
            });

            res.status(200).json({
                status: 'success',
                message: 'Completed orders retrieved successfully',
                data: orders,
            });

        } catch (error) {
            console.error('Error fetching completed orders:', error);
            throw new BadRequestError('Failed to retrieve completed orders');
        }
    }

    /**
     * Get agent notifications
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getNotifications(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;
        const { page = 1, limit = 20 } = req.query;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can access notifications');
        }

        try {
            // For now, return empty notifications array
            // In a real implementation, you would query a Notifications table
            const notifications: any[] = [];
            
            res.status(200).json({
                status: 'success',
                message: 'Notifications retrieved successfully',
                data: {
                    notifications,
                    count: notifications.length,
                    page: parseInt(page as string),
                    totalPages: 1,
                },
            });

        } catch (error) {
            console.error('Error fetching notifications:', error);
            throw new BadRequestError('Failed to retrieve notifications');
        }
    }

    /**
     * Get today's completed orders for agent
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getTodayCompletedOrders(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can access completed orders');
        }

        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const orders = await Database.query(`
                SELECT 
                    o.id, o."orderNumber", o.status, o."totalAmount", o."serviceFee", o."deliveryFee",
                    o."deliveryAddress", o."createdAt", o."completedAt",
                    (o."totalAmount" * 0.15) as "agentCommission",
                    u."firstName", u."lastName", u.phone,
                    m.name as "marketName", sl.name as "listName"
                FROM "Orders" o
                JOIN "Users" u ON o."customerId" = u.id
                JOIN "ShoppingLists" sl ON o."shoppingListId" = sl.id
                LEFT JOIN "Markets" m ON sl."marketId" = m.id
                WHERE o."agentId" = :agentId 
                    AND o.status = 'completed'
                    AND o."completedAt" >= :today
                ORDER BY o."completedAt" DESC
            `, {
                replacements: { agentId: id, today },
                type: QueryTypes.SELECT,
            });

            res.status(200).json({
                status: 'success',
                message: 'Today completed orders retrieved successfully',
                data: orders,
            });

        } catch (error) {
            console.error('Error fetching today completed orders:', error);
            throw new BadRequestError('Failed to retrieve today completed orders');
        }
    }

    /**
     * Accept an available order
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async acceptOrder(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;
        const { orderId } = req.params;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can accept orders');
        }

        try {
            // Use the existing AgentService to assign order to agent
            const order = await AgentService.assignOrderToAgent(orderId, id);
            
            res.status(200).json({
                status: 'success',
                message: 'Order accepted successfully',
                data: order,
            });

        } catch (error) {
            console.error('Error accepting order:', error);
            throw new BadRequestError('Failed to accept order');
        }
    }

    /**
     * Reject an available order
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async rejectOrder(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;
        const { orderId } = req.params;
        const { reason } = req.body;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can reject orders');
        }

        try {
            // Record rejection in order trail
            await Database.query(`
                INSERT INTO "OrderTrails" (
                    "orderId", "agentId", "status", "action", "notes", "createdAt", "updatedAt"
                ) VALUES (
                    :orderId, :agentId, 'rejected', 'order_rejected', :reason, NOW(), NOW()
                )
            `, {
                replacements: { orderId, agentId: id, reason: reason || 'No reason provided' },
            });
            
            res.status(200).json({
                status: 'success',
                message: 'Order rejected successfully',
                data: null,
            });

        } catch (error) {
            console.error('Error rejecting order:', error);
            throw new BadRequestError('Failed to reject order');
        }
    }

    /**
     * Update order status (for agent order management)
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async updateOrderStatusForAgent(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;
        const { orderId } = req.params;
        const { status: newStatus, notes } = req.body;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can update order status');
        }

        // Validate status
        const validStatuses = ['accepted', 'in_progress', 'shopping', 'shopping_completed', 'delivery', 'completed'];
        if (!validStatuses.includes(newStatus)) {
            throw new BadRequestError('Invalid order status');
        }

        try {
            // Update order status and record in trail
            await Database.transaction(async (transaction) => {
                // Update the order
                await Database.query(`
                    UPDATE "Orders" 
                    SET status = :status,
                        "shoppingStartedAt" = CASE WHEN :status = 'shopping' THEN NOW() ELSE "shoppingStartedAt" END,
                        "deliveryStartedAt" = CASE WHEN :status = 'delivery' THEN NOW() ELSE "deliveryStartedAt" END,
                        "completedAt" = CASE WHEN :status = 'completed' THEN NOW() ELSE "completedAt" END,
                        "updatedAt" = NOW()
                    WHERE id = :orderId AND "agentId" = :agentId
                `, {
                    replacements: { orderId, agentId: id, status: newStatus },
                    transaction,
                });

                // Add to order trail
                await Database.query(`
                    INSERT INTO "OrderTrails" (
                        "orderId", "agentId", "status", "action", "notes", "createdAt", "updatedAt"
                    ) VALUES (
                        :orderId, :agentId, :status, 'status_updated', :notes, NOW(), NOW()
                    )
                `, {
                    replacements: { 
                        orderId, 
                        agentId: id, 
                        status: newStatus, 
                        notes: notes || `Status updated to ${newStatus}`, 
                    },
                    transaction,
                });
            });

            res.status(200).json({
                status: 'success',
                message: 'Order status updated successfully',
                data: { orderId, newStatus },
            });

        } catch (error) {
            console.error('Error updating order status:', error);
            throw new BadRequestError('Failed to update order status');
        }
    }

    /**
     * Complete an order
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async completeOrder(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;
        const { orderId } = req.params;
        const { items, totalActualCost, deliveryNotes } = req.body;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can complete orders');
        }

        try {
            await Database.transaction(async (transaction) => {
                // Update order status to completed
                await Database.query(`
                    UPDATE "Orders" 
                    SET status = 'completed',
                        "actualTotal" = :actualTotal,
                        "deliveryNotes" = :deliveryNotes,
                        "completedAt" = NOW(),
                        "updatedAt" = NOW()
                    WHERE id = :orderId AND "agentId" = :agentId
                `, {
                    replacements: { 
                        orderId, 
                        agentId: id, 
                        actualTotal: totalActualCost,
                        deliveryNotes, 
                    },
                    transaction,
                });

                // Update shopping list items with actual prices if provided
                if (items && Array.isArray(items)) {
                    for (const item of items) {
                        await Database.query(`
                            UPDATE "ShoppingListItems" 
                            SET "actualPrice" = :actualPrice,
                                "found" = :found,
                                "notes" = :notes,
                                "updatedAt" = NOW()
                            WHERE "shoppingListId" = (
                                SELECT "shoppingListId" FROM "Orders" WHERE id = :orderId
                            ) AND name = :itemName
                        `, {
                            replacements: {
                                orderId,
                                itemName: item.name,
                                actualPrice: item.actualPrice,
                                found: item.found !== false,
                                notes: item.notes || null,
                            },
                            transaction,
                        });
                    }
                }

                // Add completion to order trail
                await Database.query(`
                    INSERT INTO "OrderTrails" (
                        "orderId", "agentId", "status", "action", "notes", "createdAt", "updatedAt"
                    ) VALUES (
                        :orderId, :agentId, 'completed', 'order_completed', :notes, NOW(), NOW()
                    )
                `, {
                    replacements: { 
                        orderId, 
                        agentId: id, 
                        notes: `Order completed. ${deliveryNotes || ''}`.trim(),
                    },
                    transaction,
                });
            });

            res.status(200).json({
                status: 'success',
                message: 'Order completed successfully',
                data: { orderId, totalActualCost },
            });

        } catch (error) {
            console.error('Error completing order:', error);
            throw new BadRequestError('Failed to complete order');
        }
    }
}