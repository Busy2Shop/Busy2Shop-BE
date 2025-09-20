import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { BadRequestError, ForbiddenError } from '../utils/customErrors';
import UserService from '../services/user.service';
import AgentService, { IViewAgentsQuery } from '../services/agent.service';
import { QueryTypes } from 'sequelize';
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
            parseFloat(radius as string),
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
     * Assign order to agent (Admin/System use)
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
     * Agent accepts an assigned order
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async acceptOrder(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;
        const agentId = req.user.id;
        
        if (!agentId) {
            throw new ForbiddenError('Agent authentication required');
        }
        
        const order = await AgentService.acceptOrder(agentId, orderId);
        
        res.status(200).json({
            status: 'success',
            message: 'Order accepted and started successfully',
            data: order,
        });
    }

    /**
     * Agent rejects an assigned order
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async rejectOrder(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;
        const { reason } = req.body;
        const agentId = req.user.id;
        
        if (!agentId) {
            throw new ForbiddenError('Agent authentication required');
        }
        
        const success = await AgentService.rejectOrder(agentId, orderId, reason);
        
        res.status(200).json({
            status: 'success',
            message: 'Order rejected successfully',
            data: { success },
        });
    }

    /**
     * Get orders assigned to the authenticated agent
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getMyOrders(req: AuthenticatedRequest, res: Response) {
        const agentId = req.user.id;
        const { status, limit } = req.query;
        
        if (!agentId) {
            throw new ForbiddenError('Agent authentication required');
        }
        
        const orders = await AgentService.getAgentOrders(
            agentId,
            status as 'accepted' | 'in_progress' | 'completed' | undefined,
            limit ? parseInt(limit as string) : undefined,
        );
        
        res.status(200).json({
            status: 'success',
            message: 'Agent orders retrieved successfully',
            data: { orders },
        });
    }

    /**
     * Get available orders for the authenticated agent
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getAvailableOrders(req: AuthenticatedRequest, res: Response) {
        const agentId = req.user.id;
        const { limit } = req.query;
        
        if (!agentId) {
            throw new ForbiddenError('Agent authentication required');
        }
        
        const orders = await AgentService.getAvailableOrdersForAgent(
            agentId,
            limit ? parseInt(limit as string) : undefined,
        );
        
        res.status(200).json({
            status: 'success',
            message: 'Available orders retrieved successfully',
            data: { orders },
        });
    }


    /**
     * Get agent locations
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getLocations(req: AuthenticatedRequest, res: Response) {
        const agentId = req.user.id;
        const locations = await AgentService.getAgentLocations(agentId);
        
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
        const agentId = req.user.id;
        const locationData = req.body;
        
        const location = await AgentService.addAgentLocation(agentId, locationData);
        
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
        const agentId = req.user.id;
        
        try {
            // Use UserService like checkKycEligibility for consistency
            const user = await UserService.viewSingleUser(agentId);
            const settings = user.settings.get({ plain: true });
            const agentMeta = settings?.agentMetaData;
            
            // Get current location from AgentLocation model
            const currentLocation = await AgentService.getCurrentLocation(agentId);

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
                    lastUpdated: currentLocation.updatedAt,
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
        const agentId = req.user.id;
        const { status, isAcceptingOrders } = req.body;
        
        // Validate status
        const validStatuses = ['available', 'busy', 'away', 'offline'];
        if (!validStatuses.includes(status)) {
            throw new BadRequestError('Invalid status. Must be one of: available, busy, away, offline');
        }
        
        try {
            // First get current user data for KYC check and current status
            const user = await UserService.viewSingleUser(agentId);
            const settings = user.settings.get({ plain: true });
            const agentMeta = settings?.agentMetaData;
            
            // Convert isAcceptingOrders to boolean if provided
            const acceptingOrders = isAcceptingOrders !== undefined ? Boolean(isAcceptingOrders) : true;
            
            // Log the status update attempt for debugging
            logger.info(`Agent ${agentId} attempting to update status`, {
                requestedStatus: status,
                currentStatus: agentMeta?.currentStatus,
                isKycVerified: settings?.isKycVerified,
                acceptingOrders,
            });
            
            const updatedUser = await AgentService.updateAgentStatus(agentId, status, acceptingOrders);
            const updatedSettings = updatedUser.settings.get({ plain: true });
            const updatedAgentMeta = updatedSettings?.agentMetaData;
            
            const responseData = {
                currentStatus: updatedAgentMeta?.currentStatus || status,
                isAcceptingOrders: updatedAgentMeta?.isAcceptingOrders || acceptingOrders,
                lastStatusUpdate: updatedAgentMeta?.lastStatusUpdate || new Date().toISOString(),
                kycVerified: updatedSettings?.isKycVerified || false,
                canGoOnline: updatedSettings?.isKycVerified || false,
            };
            
            logger.info(`Agent ${agentId} status updated successfully`, responseData);
            
            res.status(200).json({
                status: 'success',
                message: 'Agent status updated successfully',
                data: responseData,
            });

        } catch (error) {
            logger.error(`Error updating agent ${agentId} status:`, error);
            
            // Handle KYC_REQUIRED error specifically
            if (error instanceof BadRequestError && error.message.includes('KYC')) {
                res.status(200).json({
                    status: 'error',
                    message: error.message,
                    code: 'KYC_REQUIRED',
                    data: {
                        currentStatus: 'offline',
                        isAcceptingOrders: false,
                        canGoOnline: false,
                        kycVerified: false,
                    },
                });
                return;
            }
            
            throw error;
        }
    }

    /**
     * Update agent's current location
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async updateCurrentLocation(req: AuthenticatedRequest, res: Response) {
        try {
            const agentId = req.user.id;
            const { latitude, longitude, accuracy, address } = req.body;
            
            if (!latitude || !longitude) {
                throw new BadRequestError('Latitude and longitude are required');
            }
            
            const location = await AgentService.updateCurrentLocation(
                agentId,
                parseFloat(latitude),
                parseFloat(longitude),
                accuracy ? parseFloat(accuracy) : undefined,
                address,
            );
            
            res.status(200).json({
                status: 'success',
                message: 'Current location updated successfully',
                data: {
                    latitude: location.latitude,
                    longitude: location.longitude,
                    accuracy: location.accuracy,
                    address: location.address,
                    timestamp: location.timestamp,
                    lastUpdated: location.updatedAt,
                },
            });
            
        } catch (error) {
            logger.error('Error updating agent location:', error);
            throw new BadRequestError('Failed to update current location');
        }
    }

    /**
     * Check KYC eligibility for agent to go online
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async checkKycEligibility(req: AuthenticatedRequest, res: Response) {
        const agentId = req.user.id;
        
        try {
            // Use UserService for consistency with existing patterns
            const user = await UserService.viewSingleUser(agentId);
            const settings = user.settings.get({ plain: true });
            const agentMeta = settings?.agentMetaData;
            
            // Primary check: Admin-approved KYC verification
            const isKycVerified = settings?.isKycVerified === true;
            
            const responseData = {
                canGoOnline: isKycVerified,
                kycStatus: isKycVerified ? 'verified' : 'pending',
                isKycVerified,
                kycComplete: agentMeta?.kycComplete === true,
                hasRequiredDocuments: !!(agentMeta?.nin && agentMeta?.images && agentMeta?.images.length > 0),
                currentStatus: agentMeta?.currentStatus || 'offline',
                message: isKycVerified 
                    ? 'Agent is verified and can go online'
                    : 'Agent KYC verification is pending admin approval',
            };
            
            res.status(200).json({
                status: 'success',
                message: 'KYC eligibility checked successfully',
                data: responseData,
            });
            
        } catch (error) {
            logger.error(`Error checking KYC eligibility for agent ${agentId}:`, error);
            throw new BadRequestError('Failed to check KYC eligibility');
        }
    }

    /**
     * Get today's stats
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getTodayStats(req: AuthenticatedRequest, res: Response) {
        const agentId = req.user.id;

        try {
            const today = new Date();
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const endOfDay = new Date(startOfDay);
            endOfDay.setDate(endOfDay.getDate() + 1);

            // Get today's orders for this agent
            const todayOrders = await Database.query(`
                SELECT 
                    COUNT(*) as "todayOrders",
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) as "completedToday",
                    COALESCE(SUM(CASE WHEN status IN ('pending', 'accepted', 'in_progress') THEN 1 ELSE 0 END), 0) as "pendingToday",
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN ("deliveryFee" * 0.15) ELSE 0 END), 0) as "todayEarnings"
                FROM "Orders" 
                WHERE "agentId" = :agentId 
                AND "createdAt" >= :startOfDay 
                AND "createdAt" < :endOfDay
            `, {
                replacements: { agentId, startOfDay, endOfDay },
                type: QueryTypes.SELECT,
            });

            const stats = todayOrders[0] as any;

            res.status(200).json({
                status: 'success',
                message: 'Today\'s stats retrieved successfully',
                data: {
                    todayOrders: parseInt(stats?.todayOrders || '0'),
                    todayEarnings: parseFloat(stats?.todayEarnings || '0'),
                    completedToday: parseInt(stats?.completedToday || '0'),
                    pendingToday: parseInt(stats?.pendingToday || '0'),
                },
            });
        } catch (error) {
            logger.error('Error getting today stats:', error);
            throw new BadRequestError('Failed to retrieve today\'s stats');
        }
    }

    /**
     * Get agent earnings
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getEarnings(req: AuthenticatedRequest, res: Response) {
        const agentId = req.user.id;

        try {
            // Get overall earnings stats
            const earningsStats = await Database.query(`
                SELECT 
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN ("deliveryFee" * 0.15) ELSE 0 END), 0) as "totalEarnings",
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as "completedOrders",
                    COUNT(*) as "totalOrders"
                FROM "Orders" 
                WHERE "agentId" = :agentId
            `, {
                replacements: { agentId },
                type: QueryTypes.SELECT,
            });

            const stats = earningsStats[0] as any;

            // Get recent earnings (last 30 days)
            const recentEarnings = await Database.query(`
                SELECT 
                    DATE("createdAt") as date,
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN ("deliveryFee" * 0.15) ELSE 0 END), 0) as amount,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as orders
                FROM "Orders" 
                WHERE "agentId" = :agentId 
                AND "createdAt" >= NOW() - INTERVAL '30 days'
                GROUP BY DATE("createdAt")
                ORDER BY date ASC
            `, {
                replacements: { agentId },
                type: QueryTypes.SELECT,
            });

            res.status(200).json({
                status: 'success',
                message: 'Earnings retrieved successfully',
                data: {
                    totalEarnings: parseFloat(stats?.totalEarnings || '0'),
                    completedOrders: parseInt(stats?.completedOrders || '0'),
                    totalOrders: parseInt(stats?.totalOrders || '0'),
                    earnings: recentEarnings,
                },
            });
        } catch (error) {
            logger.error('Error getting earnings:', error);
            throw new BadRequestError('Failed to retrieve earnings');
        }
    }

    /**
     * Get recent orders for activity feed
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getRecentOrders(req: AuthenticatedRequest, res: Response) {
        const agentId = req.user.id;
        const { limit } = req.query;
        const orderLimit = limit ? parseInt(limit as string) : 5;

        try {
            const orders = await Database.query(`
                SELECT 
                    o."id",
                    o."orderNumber", 
                    o."status",
                    o."totalAmount",
                    o."deliveryFee",
                    CASE 
                        WHEN o."status" = 'completed' THEN (o."deliveryFee" * 0.15)
                        ELSE 0
                    END as "agentEarnings",
                    o."createdAt",
                    o."updatedAt",
                    COALESCE(
                        (SELECT COUNT(*) FROM "ShoppingListItems" sli WHERE sli."shoppingListId" = sl."id"),
                        0
                    ) as "itemCount"
                FROM "Orders" o
                LEFT JOIN "ShoppingLists" sl ON o."shoppingListId" = sl."id"
                WHERE o."agentId" = :agentId
                ORDER BY o."createdAt" DESC
                LIMIT :limit
            `, {
                replacements: { agentId, limit: orderLimit },
                type: QueryTypes.SELECT,
            });

            res.status(200).json({
                status: 'success',
                message: 'Recent orders retrieved successfully',
                data: orders,
            });
        } catch (error) {
            logger.error('Error getting recent orders:', error);
            throw new BadRequestError('Failed to retrieve recent orders');
        }
    }

    /**
     * Get preferred locations for agent
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getPreferredLocations(req: AuthenticatedRequest, res: Response) {
        const agentId = req.user.id;
        
        if (!agentId) {
            throw new ForbiddenError('Agent authentication required');
        }
        
        const locations = await AgentService.getPreferredLocations(agentId);
        
        res.status(200).json({
            status: 'success',
            message: 'Preferred locations retrieved successfully',
            data: locations,
        });
    }

    /**
     * Add preferred location for agent
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async addPreferredLocation(req: AuthenticatedRequest, res: Response) {
        const agentId = req.user.id;
        const locationData = {
            agentId,
            ...req.body,
            locationType: req.body.locationType || 'service_area',
            isActive: req.body.isActive !== undefined ? req.body.isActive : true,
        };
        
        const location = await AgentService.addPreferredLocation(locationData);
        
        res.status(201).json({
            status: 'success',
            message: 'Preferred location added successfully',
            data: location,
        });
    }

    /**
     * Remove preferred location for agent
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async removePreferredLocation(req: AuthenticatedRequest, res: Response) {
        const agentId = req.user.id;
        const { id } = req.params;
        
        await AgentService.removePreferredLocation(agentId, id);
        
        res.status(200).json({
            status: 'success',
            message: 'Preferred location removed successfully',
            data: null,
        });
    }

    /**
     * Get agent stats (alias for compatibility)
     * @param req AuthenticatedRequest  
     * @param res Response
     */
    static async getAgentStats(req: AuthenticatedRequest, res: Response) {
        const agentId = req.user.id;
        
        try {
            const stats = await AgentService.getAgentStats(agentId);
            
            res.status(200).json({
                status: 'success',
                message: 'Agent statistics retrieved successfully',
                data: stats,
            });
        } catch (error) {
            logger.error('Error getting agent stats:', error);
            throw new BadRequestError('Failed to retrieve agent statistics');
        }
    }

    /**
     * Get daily earnings (alias for getEarnings)
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getDailyEarnings(req: AuthenticatedRequest, res: Response) {
        return this.getEarnings(req, res);
    }

    /**
     * Get agent profile data (alias for getAgentProfile)
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getAgentProfileData(req: AuthenticatedRequest, res: Response) {
        const agentId = req.user.id;
        const agent = await AgentService.getAgentById(agentId);
        
        res.status(200).json({
            status: 'success',
            message: 'Agent profile data retrieved successfully',
            data: agent,
        });
    }

    /**
     * Update agent status (alias for updateStatus)
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async updateAgentStatus(req: AuthenticatedRequest, res: Response) {
        return this.updateStatus(req, res);
    }

    /**
     * Get notifications (placeholder - implement based on notification service)
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getNotifications(req: AuthenticatedRequest, res: Response) {
        res.status(200).json({
            status: 'success',
            message: 'Notifications retrieved successfully',
            data: [],
        });
    }

    /**
     * Get agent orders (alias for getMyOrders)
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getAgentOrders(req: AuthenticatedRequest, res: Response) {
        return this.getMyOrders(req, res);
    }

    /**
     * Get active orders
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getActiveOrders(req: AuthenticatedRequest, res: Response) {
        const agentId = req.user.id;
        
        const orders = await AgentService.getAgentOrders(
            agentId,
            'in_progress',
            20,
        );
        
        res.status(200).json({
            status: 'success',
            message: 'Active orders retrieved successfully',
            data: { orders },
        });
    }

    /**
     * Get completed orders
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getCompletedOrders(req: AuthenticatedRequest, res: Response) {
        const agentId = req.user.id;
        
        const orders = await AgentService.getAgentOrders(
            agentId,
            'completed',
            50,
        );
        
        res.status(200).json({
            status: 'success',
            message: 'Completed orders retrieved successfully',
            data: { orders },
        });
    }

    /**
     * Get today's completed orders
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getTodayCompletedOrders(req: AuthenticatedRequest, res: Response) {
        const agentId = req.user.id;

        try {
            const today = new Date();
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const endOfDay = new Date(startOfDay);
            endOfDay.setDate(endOfDay.getDate() + 1);

            const orders = await Database.query(`
                SELECT 
                    o."id",
                    o."orderNumber",
                    o."status", 
                    o."totalAmount",
                    CASE 
                        WHEN o."status" = 'completed' THEN (o."deliveryFee" * 0.15)
                        ELSE 0
                    END as "agentEarnings",
                    o."createdAt",
                    o."completedAt"
                FROM "Orders" o
                WHERE o."agentId" = :agentId 
                AND o."status" = 'completed'
                AND o."completedAt" >= :startOfDay 
                AND o."completedAt" < :endOfDay
                ORDER BY o."completedAt" DESC
            `, {
                replacements: { agentId, startOfDay, endOfDay },
                type: QueryTypes.SELECT,
            });

            res.status(200).json({
                status: 'success',
                message: 'Today\'s completed orders retrieved successfully',
                data: { orders },
            });
        } catch (error) {
            logger.error('Error getting today\'s completed orders:', error);
            throw new BadRequestError('Failed to retrieve today\'s completed orders');
        }
    }

    /**
     * Update order status for agent (placeholder)
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async updateOrderStatusForAgent(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;
        const { status } = req.body;
        
        // Placeholder - implement order status update logic
        res.status(200).json({
            status: 'success',
            message: 'Order status updated successfully',
            data: { orderId, status },
        });
    }

    /**
     * Complete order (placeholder)
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async completeOrder(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;
        const agentId = req.user.id;
        
        // Placeholder - implement order completion logic
        res.status(200).json({
            status: 'success',
            message: 'Order completed successfully',
            data: { orderId, agentId },
        });
    }

    // ===============================================
    // SHOPPING LIST MANAGEMENT ENDPOINTS
    // ===============================================

    /**
     * Get assigned shopping lists (main method used by frontend)
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getAssignedShoppingLists(req: AuthenticatedRequest, res: Response) {
        const { status } = req.query;
        
        try {
            logger.info(`Getting assigned shopping lists with status: ${status}`);
            const result = await AgentService.getAssignedShoppingLists({
                status: status as string,
            });

            res.status(200).json({
                status: 'success',
                message: 'Assigned shopping lists retrieved successfully',
                data: result,
            });
        } catch (error: any) {
            logger.error('Error getting assigned shopping lists:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to retrieve assigned shopping lists',
                error: error.message,
            });
        }
    }

    /**
     * Get assigned orders (main method used by frontend)
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async getAssignedOrders(req: AuthenticatedRequest, res: Response) {
        const { status, page, size, startDate, endDate } = req.query;
        
        try {
            logger.info(`Getting assigned orders with status: ${status}`);
            const result = await AgentService.getAssignedOrders({
                status: status as string,
            });

            res.status(200).json({
                status: 'success',
                message: 'Assigned orders retrieved successfully',
                data: result,
            });
        } catch (error: any) {
            logger.error('Error getting assigned orders:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to retrieve assigned orders',
                error: error.message,
            });
        }
    }

    /**
     * Accept a shopping list and start order process
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async acceptShoppingList(req: AuthenticatedRequest, res: Response) {
        const { shoppingListId } = req.params;
        const agentId = req.user.id;
        
        try {
            const order = await AgentService.acceptShoppingList(agentId, shoppingListId);
            
            res.status(200).json({
                status: 'success',
                message: 'Shopping list accepted successfully',
                data: { order },
            });
        } catch (error: any) {
            logger.error('Error accepting shopping list:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to accept shopping list',
                error: error.message,
            });
        }
    }

    /**
     * Start shopping process
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async startShopping(req: AuthenticatedRequest, res: Response) {
        const { shoppingListId } = req.params;
        const agentId = req.user.id;
        
        try {
            const order = await AgentService.startShopping(agentId, shoppingListId);
            
            res.status(200).json({
                status: 'success',
                message: 'Shopping started successfully',
                data: { order },
            });
        } catch (error: any) {
            logger.error('Error starting shopping:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to start shopping',
                error: error.message,
            });
        }
    }

    /**
     * Complete shopping process with final prices
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async completeShopping(req: AuthenticatedRequest, res: Response) {
        const { shoppingListId } = req.params;
        const { finalPrices } = req.body;
        const agentId = req.user.id;
        
        try {
            const order = await AgentService.completeShopping(agentId, shoppingListId, finalPrices);
            
            res.status(200).json({
                status: 'success',
                message: 'Shopping completed successfully',
                data: { order },
            });
        } catch (error: any) {
            logger.error('Error completing shopping:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to complete shopping',
                error: error.message,
            });
        }
    }

    /**
     * Update order status with comprehensive validation
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async updateOrderStatus(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;
        const { status, notes } = req.body;
        const agentId = req.user.id;

        try {
            const result = await AgentService.updateOrderStatus(
                agentId,
                orderId,
                status,
                notes
            );

            res.status(200).json({
                status: 'success',
                message: 'Order status updated successfully',
                data: result,
            });
        } catch (error: any) {
            logger.error('Error updating order status:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to update order status',
                error: error.message,
            });
        }
    }

    // ===============================================
    // DELIVERY MANAGEMENT ENDPOINTS
    // ===============================================

    /**
     * Request delivery for a completed order
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async requestDelivery(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;
        const agentId = req.user.id;
        
        try {
            const deliveryRequest = await AgentService.requestDelivery(agentId, orderId);
            
            res.status(200).json({
                status: 'success',
                message: 'Delivery requested successfully',
                data: deliveryRequest,
            });
        } catch (error: any) {
            logger.error('Error requesting delivery:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to request delivery',
                error: error.message,
            });
        }
    }

    /**
     * Track delivery status for an order
     * @param req AuthenticatedRequest
     * @param res Response
     */
    static async trackOrderDelivery(req: AuthenticatedRequest, res: Response) {
        const { orderId } = req.params;
        const agentId = req.user.id;
        
        try {
            const deliveryStatus = await AgentService.trackDelivery(agentId, orderId);
            
            res.status(200).json({
                status: 'success',
                message: 'Delivery status retrieved successfully',
                data: deliveryStatus,
            });
        } catch (error: any) {
            logger.error('Error tracking delivery:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to track delivery',
                error: error.message,
            });
        }
    }
}