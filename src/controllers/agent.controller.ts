import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/customErrors';
import UserService from '../services/user.service';
import AgentService, { IViewAgentsQuery } from '../services/agent.service';
import UserSettings from '../models/userSettings.model';
import { Op, QueryTypes } from 'sequelize';
import { Database } from '../models';
import { logger } from '../utils/logger';

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
        
        try {
            // Use UserService like checkKycEligibility for consistency
            const user = await UserService.viewSingleUser(id);
            const settings = user.settings.get({ plain: true });
            const agentMeta = settings?.agentMetaData;
            
            // Get current location from AgentLocation model
            const currentLocation = await AgentService.getCurrentLocation(id);

            const statusData = {
                currentStatus: agentMeta?.currentStatus || 'offline',
                isAcceptingOrders: agentMeta?.isAcceptingOrders || false,
                lastStatusUpdate: agentMeta?.lastStatusUpdate || new Date().toISOString(),
                lastUpdated: agentMeta?.lastStatusUpdate,
                kycVerified: settings?.isKycVerified || false,
                canGoOnline: settings?.isKycVerified || false,
                location: currentLocation ? {
                    latitude: currentLocation.latitude,
                    longitude: currentLocation.longitude,
                    accuracy: currentLocation.accuracy,
                    address: currentLocation.address,
                    timestamp: currentLocation.timestamp,
                    lastUpdated: currentLocation.updatedAt
                } : null,
            };
            
            res.status(200).json({
                status: 'success',
                message: 'Agent status retrieved successfully',
                data: statusData,
            });
        } catch (error) {
            console.error('Error getting agent status:', error);
            throw new BadRequestError('Failed to retrieve agent status');
        }
    }

    /**
     * Update agent status (with KYC verification)
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async updateStatus(req: AuthenticatedRequest, res: Response) {
        const { id } = req.user;
        const { status, isAcceptingOrders, metadata } = req.body;
        
        // Validate status
        const validStatuses = ['available', 'busy', 'away', 'offline'];
        if (!validStatuses.includes(status)) {
            throw new BadRequestError('Invalid status. Must be one of: available, busy, away, offline');
        }
        
        try {
            // First get current user data for KYC check and current status
            const user = await UserService.viewSingleUser(id);
            const settings = user.settings.get({ plain: true });
            const agentMeta = settings?.agentMetaData;
            
            // Check KYC eligibility for 'available' status
            if (status === 'available') {
                const isKycVerified = settings?.isKycVerified;
                const kycComplete = agentMeta?.kycComplete === true;
                
                if (!isKycVerified || !kycComplete) {
                    res.status(403).json({
                        status: 'error',
                        message: 'KYC verification required to go online',
                        code: 'KYC_REQUIRED',
                        data: {
                            currentStatus: agentMeta?.currentStatus || 'offline',
                            kycVerified: isKycVerified,
                            kycComplete: kycComplete,
                            requiredActions: [
                                !agentMeta?.identityDocument ? 'Upload KYC documents' : null,
                                !kycComplete ? 'Complete KYC verification process' : null,
                                !isKycVerified ? 'Wait for KYC approval' : null,
                            ].filter(Boolean),
                        },
                    });
                    return;
                }
            }
            
            // Update status using AgentService
            const updatedAgent = await AgentService.updateAgentStatus(
                id, 
                status, 
                status === 'available' ? (isAcceptingOrders !== false) : false
            );
            
            // Get fresh status data
            const updatedSettings = updatedAgent.settings?.get({ plain: true });
            const updatedMeta = updatedSettings?.agentMetaData;
            
            res.status(200).json({
                status: 'success',
                message: 'Agent status updated successfully',
                data: {
                    currentStatus: updatedMeta?.currentStatus || status,
                    isAcceptingOrders: updatedMeta?.isAcceptingOrders || false,
                    lastStatusUpdate: updatedMeta?.lastStatusUpdate || new Date().toISOString(),
                    kycVerified: updatedSettings?.isKycVerified || false,
                },
            });
            
        } catch (error: any) {
            console.error('Error updating agent status:', error);
            
            // Handle specific error types
            if (error.message?.includes('KYC verification')) {
                res.status(403).json({
                    status: 'error',
                    message: error.message,
                    code: 'KYC_REQUIRED',
                    data: {
                        currentStatus: 'offline',
                        requiredActions: [
                            'Complete KYC verification',
                            'Upload required documents', 
                            'Wait for approval',
                        ],
                    },
                });
                return;
            }
            
            throw new BadRequestError('Failed to update agent status');
        }
    }

    /**
     * Update agent's current location
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async updateCurrentLocation(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;
        const { latitude, longitude, accuracy, timestamp, address } = req.body;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can update their location');
        }

        // Validate location data
        if (!latitude || !longitude) {
            throw new BadRequestError('Latitude and longitude are required');
        }

        try {
            // Use AgentService to update current location
            const updatedLocation = await AgentService.updateCurrentLocation(
                id,
                parseFloat(latitude),
                parseFloat(longitude),
                accuracy ? parseFloat(accuracy) : undefined,
                address || undefined
            );

            res.status(200).json({
                status: 'success',
                message: 'Location updated successfully',
                data: {
                    id: updatedLocation.id,
                    latitude: updatedLocation.latitude,
                    longitude: updatedLocation.longitude,
                    accuracy: updatedLocation.accuracy,
                    address: updatedLocation.address,
                    timestamp: updatedLocation.timestamp,
                    lastUpdated: updatedLocation.updatedAt
                }
            });

        } catch (error) {
            console.error('Error updating agent location:', error);
            throw new BadRequestError('Failed to update location');
        }
    }

    /**
     * Check agent KYC status and eligibility to go online
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async checkKycEligibility(req: AuthenticatedRequest, res: Response) {
        const { id } = req.user;
        
        try {
            const user = await UserService.viewSingleUser(id);
            const settings = user.settings.get({ plain: true });
            const isKycVerified = settings?.isKycVerified;
            const agentMeta = settings?.agentMetaData;
            const kycComplete = agentMeta?.kycComplete === true;
            const kycStatus = agentMeta?.kycStatus || 'incomplete';
            
            // If KYC is verified but kycComplete is not set, auto-update it
            if (isKycVerified && !kycComplete) {
                logger.info(`Auto-updating kycComplete flag for verified agent during KYC check ${id}`, {
                    agentId: id,
                    isKycVerified,
                    kycComplete,
                });
                
                // Update kycComplete flag in agent metadata
                await AgentService.updateAgentDocuments(id, {
                    kycComplete: true,
                    kycCompletedAt: new Date().toISOString(),
                });
            }
            
            // Use isKycVerified as primary check
            const canGoOnline = isKycVerified;
            console.log({ id, canGoOnline, isKycVerified, kycComplete, kycStatus, settings });
            res.status(200).json({
                status: 'success',
                message: 'KYC eligibility checked successfully',
                data: {
                    canGoOnline,
                    isKycVerified,
                    kycComplete,
                    kycStatus,
                    currentStatus: agentMeta?.currentStatus || 'offline',
                    requirements: {
                        kycVerified: isKycVerified,
                        kycCompleted: kycComplete,
                        documentsUploaded: !!agentMeta?.identityDocument,
                    },
                    nextSteps: !canGoOnline ? [
                        !agentMeta?.identityDocument ? 'Upload KYC documents' : null,
                        kycStatus === 'incomplete' ? 'Complete KYC verification process' : null,
                        kycStatus === 'submitted' ? 'Wait for KYC approval' : null,
                        !isKycVerified ? 'KYC approval pending' : null,
                    ].filter(Boolean) : [],
                },
            });
        } catch (error) {
            console.error('Error checking KYC eligibility:', error);
            throw new BadRequestError('Failed to check KYC eligibility');
        }
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
            
            // Query actual order statistics from database
            const [orderStats] = await Database.query(`
                SELECT 
                    COUNT(*) as "totalOrders",
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as "completedOrders",
                    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as "cancelledOrders",
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN "totalAmount" * 0.15 ELSE 0 END), 0) as "totalEarnings",
                    COALESCE(AVG(CASE WHEN status = 'completed' THEN "totalAmount" ELSE NULL END), 0) as "averageOrderValue",
                    COUNT(DISTINCT "customerId") as "uniqueCustomers"
                FROM "Orders" 
                WHERE "agentId" = :agentId
            `, {
                replacements: { agentId: id },
                type: QueryTypes.SELECT,
            });

            // Query this month's earnings
            const currentDate = new Date();
            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString();
            
            const [monthStats] = await Database.query(`
                SELECT 
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as "thisMonthOrders",
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN "totalAmount" * 0.15 ELSE 0 END), 0) as "thisMonthEarnings"
                FROM "Orders" 
                WHERE "agentId" = :agentId 
                    AND "createdAt" >= :startOfMonth
            `, {
                replacements: { agentId: id, startOfMonth },
                type: QueryTypes.SELECT,
            });

            // Query ratings (would need Reviews table implementation)
            // For now, use placeholder values since reviews system may not be implemented
            const averageRating = 0; // Would come from Reviews table
            const totalReviews = 0; // Would come from Reviews table

            const stats = orderStats as any;
            const monthData = monthStats as any;
            
            const totalOrders = parseInt(stats.totalOrders || 0);
            const completedOrders = parseInt(stats.completedOrders || 0);
            
            const responseData = {
                totalOrders,
                completedOrders,
                cancelledOrders: parseInt(stats.cancelledOrders || 0),
                totalEarnings: parseFloat(stats.totalEarnings || 0),
                thisMonthEarnings: parseFloat(monthData.thisMonthEarnings || 0),
                averageOrderValue: parseFloat(stats.averageOrderValue || 0),
                averageRating,
                totalReviews,
                completionRate: totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0,
                responseTime: 0, // Would need separate tracking
                activeHours: 0, // Would need separate tracking
                uniqueCustomers: parseInt(stats.uniqueCustomers || 0),
                successRate: totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0,
                lastActiveDate: user.settings?.lastLogin || new Date().toISOString(),
            };

            res.status(200).json({
                status: 'success',
                message: 'Agent stats retrieved successfully',
                data: responseData,
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
                const dateStr = date.toISOString().split('T')[0];
                
                // Query actual earnings for this date
                const [result] = await Database.query(`
                    SELECT 
                        COALESCE(SUM(o."totalAmount" * 0.15), 0) as earnings,
                        COUNT(o.id) as orders
                    FROM "Orders" o
                    WHERE o."agentId" = :agentId 
                        AND o.status = 'completed'
                        AND DATE(o."completedAt") = :date
                `, {
                    replacements: { agentId: id, date: dateStr },
                    type: QueryTypes.SELECT,
                });

                dailyEarnings.push({
                    date: dateStr,
                    earnings: parseFloat((result as any)?.earnings || 0),
                    orders: parseInt((result as any)?.orders || 0),
                    tips: 0, // Tips would need separate tracking
                    bonus: 0, // Bonus would need separate tracking
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
     * Get agent earnings breakdown with aggregated data
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getEarnings(req: AuthenticatedRequest, res: Response) {
        const { id, status } = req.user;
        const { startDate, endDate, period = 'monthly' } = req.query;

        // Ensure the user is an agent
        if (status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can access earnings data');
        }

        try {
            // Query total earnings
            const [totalStats] = await Database.query(`
                SELECT 
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN "totalAmount" * 0.15 ELSE 0 END), 0) as "totalEarnings",
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as "ordersCompleted",
                    COALESCE(AVG(CASE WHEN status = 'completed' THEN "totalAmount" ELSE NULL END), 0) as "averageOrderValue"
                FROM "Orders" 
                WHERE "agentId" = :agentId
            `, {
                replacements: { agentId: id },
                type: QueryTypes.SELECT,
            });

            // Query period-specific earnings (default to last 30 days if no date range)
            let periodCondition = '';
            const replacements: any = { agentId: id };
            
            if (startDate && endDate) {
                periodCondition = 'AND "completedAt" BETWEEN :startDate AND :endDate';
                replacements.startDate = startDate;
                replacements.endDate = endDate;
            } else {
                // Default to last 30 days
                periodCondition = 'AND "completedAt" >= NOW() - INTERVAL \'30 days\'';
            }

            const [periodStats] = await Database.query(`
                SELECT 
                    COALESCE(SUM("totalAmount" * 0.15), 0) as "periodEarnings"
                FROM "Orders" 
                WHERE "agentId" = :agentId 
                    AND status = 'completed'
                    ${periodCondition}
            `, {
                replacements,
                type: QueryTypes.SELECT,
            });

            // Query daily earnings breakdown for charts
            const earnings = await Database.query(`
                SELECT 
                    DATE("completedAt") as date,
                    COALESCE(SUM("totalAmount" * 0.15), 0) as amount,
                    COUNT(*) as orders
                FROM "Orders" 
                WHERE "agentId" = :agentId 
                    AND status = 'completed'
                    AND "completedAt" >= NOW() - INTERVAL '30 days'
                GROUP BY DATE("completedAt")
                ORDER BY date DESC
            `, {
                replacements: { agentId: id },
                type: QueryTypes.SELECT,
            });

            const stats = totalStats as any;
            const periodData = periodStats as any;

            res.status(200).json({
                status: 'success',
                message: 'Earnings data retrieved successfully',
                data: {
                    totalEarnings: parseFloat(stats.totalEarnings || 0),
                    periodEarnings: parseFloat(periodData.periodEarnings || 0),
                    ordersCompleted: parseInt(stats.ordersCompleted || 0),
                    averageOrderValue: parseFloat(stats.averageOrderValue || 0),
                    earnings: earnings || []
                },
            });

        } catch (error) {
            console.error('Error fetching earnings:', error);
            throw new BadRequestError('Failed to retrieve earnings data');
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
            const today = new Date().toISOString().split('T')[0];
            
            // Query actual today's stats
            const [todayData] = await Database.query(`
                SELECT 
                    COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o."totalAmount" * 0.15 ELSE 0 END), 0) as "todayEarnings",
                    COUNT(CASE WHEN o.status IN ('accepted', 'in_progress', 'shopping', 'delivery', 'completed') THEN 1 END) as "todayOrders",
                    COUNT(CASE WHEN o.status = 'completed' THEN 1 END) as "completedToday",
                    COUNT(CASE WHEN o.status NOT IN ('completed', 'cancelled') THEN 1 END) as "pendingToday"
                FROM "Orders" o
                WHERE o."agentId" = :agentId 
                    AND DATE(o."createdAt") = :today
            `, {
                replacements: { agentId: id, today },
                type: QueryTypes.SELECT,
            });

            const stats = todayData as any;

            res.status(200).json({
                status: 'success',
                message: 'Today stats retrieved successfully',
                data: {
                    todayEarnings: parseFloat(stats?.todayEarnings || 0),
                    todayOrders: parseInt(stats?.todayOrders || 0),
                    completedToday: parseInt(stats?.completedToday || 0),
                    pendingToday: parseInt(stats?.pendingToday || 0),
                },
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
            // Get orders that have payment completed but no agent assigned
            // These are in 'pending' or 'in_progress' status waiting for agent acceptance
            const orders = await Database.query(`
                SELECT 
                    o.id, o."orderNumber", o.status, o."totalAmount", o."serviceFee", o."deliveryFee",
                    -- Only expose delivery city/area, not full address for privacy
                    jsonb_build_object(
                        'city', o."deliveryAddress"->>'city',
                        'state', o."deliveryAddress"->>'state',
                        'area', COALESCE(o."deliveryAddress"->>'address', 'Address provided')
                    ) as "deliveryAddress",
                    o."customerNotes", o."createdAt", o."acceptedAt",
                    (o."totalAmount" * 0.15) as "agentCommission",
                    -- Only customer first name for privacy
                    u."firstName", 
                    u."displayImage",
                    -- Mask phone number for privacy (only show last 4 digits)
                    CASE 
                        WHEN u.phone IS NOT NULL THEN
                            jsonb_build_object(
                                'countryCode', u.phone->>'countryCode',
                                'number', '****' || RIGHT(u.phone->>'number', 4)
                            )
                        ELSE NULL
                    END as "phone",
                    m.name as "marketName", m.address as "marketAddress",
                    -- Don't expose exact market coordinates for security
                    NULL as "marketLocation",
                    sl.name as "listName", sl."estimatedTotal", sl.status as "shoppingListStatus",
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
                WHERE o."paymentStatus" = 'completed' 
                    AND (o."agentId" IS NULL OR o."agentId" = :agentId)
                    AND o.status IN ('pending', 'accepted')
                    AND sl.status = 'accepted'
                GROUP BY o.id, u.id, m.id, sl.id
                ORDER BY o."createdAt" ASC
                LIMIT 20
            `, {
                replacements: { agentId: id },
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
