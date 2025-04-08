import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import AgentService from '../services/agent.service';
import { BadRequestError } from '../utils/customErrors';

export default class AgentController {
    static async getAllAgents(req: Request, res: Response) {
        const { page, size, q, isActive, lat, lng, distance } = req.query;

        const queryParams: Record<string, unknown> = {};

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (q) queryParams.q = q as string;

        if (isActive !== undefined) {
            queryParams.isActive = isActive === 'true';
        }

        // Handle location-based search if coordinates are provided
        if (lat && lng) {
            queryParams.lat = Number(lat);
            queryParams.lng = Number(lng);
            queryParams.distance = distance ? Number(distance) : 5; // Default 5km radius

            const agents = await AgentService.findNearbyAgents(
                Number(lat),
                Number(lng),
                queryParams.distance ? Number(queryParams.distance) : undefined
            );

            res.status(200).json({
                status: 'success',
                message: 'Nearby agents retrieved successfully',
                data: { ...agents },
            });
        } else {
            // Regular search without location
            const agents = await AgentService.getAgents(queryParams);

            res.status(200).json({
                status: 'success',
                message: 'Agents retrieved successfully',
                data: { ...agents },
            });
        }
    }

    static async getAgentProfile(req: Request, res: Response) {
        const { id } = req.params;

        const agent = await AgentService.getAgentById(id);

        res.status(200).json({
            status: 'success',
            message: 'Agent profile retrieved successfully',
            data: agent,
        });
    }

    // admin only
    static async getAgentStats(req: AuthenticatedRequest, res: Response) {
        // If a specific agent ID is provided and the user is admin, use that
        // Otherwise use the authenticated user's ID
        const { id } = req.params;
        let agentId = req.user.id;

        if (id && id !== req.user.id) {
            // Only admins can view other agents' stats
            // if (req.user.status.userType !== 'admin') {
            //     throw new ForbiddenError('You are not authorized to view this agent\'s stats');
            // }
            agentId = id;
        }

        // Check if the user is an agent
        // if (req.user.status.userType !== 'agent' && req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('Only agents and admins can access agent stats');
        // }

        const stats = await AgentService.getAgentStats(agentId);

        res.status(200).json({
            status: 'success',
            message: 'Agent stats retrieved successfully',
            data: stats,
        });
    }

    static async getAvailableAgentsForOrder(req: AuthenticatedRequest, res: Response) {
        // Only admins can see available agents for an order
        // if (req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('Only admins can view available agents for orders');
        // }

        const { shoppingListId } = req.params;

        if (!shoppingListId) {
            throw new BadRequestError('Shopping list ID is required');
        }

        const agents = await AgentService.getAvailableAgentsForOrder(shoppingListId);

        res.status(200).json({
            status: 'success',
            message: 'Available agents retrieved successfully',
            data: agents,
        });
    }

    static async assignOrderToAgent(req: AuthenticatedRequest, res: Response) {
        // Only admins can manually assign orders to agents
        // if (req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('Only admins can manually assign orders to agents');
        // }

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
 * Add a new preferred location for an agent
 */
    static async addLocation(req: AuthenticatedRequest, res: Response) {
        const { latitude, longitude, radius, name, address } = req.body;
        const location = await AgentService.addAgentLocation(req.user.id, {
            latitude,
            longitude,
            radius,
            name,
            address,
        });
        res.status(201).json(location);
    }

    /**
     * Update an agent's location
     */
    static async updateLocation(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { latitude, longitude, radius, name, address, isActive } = req.body;
        const location = await AgentService.updateAgentLocation(id, req.user.id, {
            latitude,
            longitude,
            radius,
            name,
            address,
            isActive,
        });
        res.json(location);
    }

    /**
     * Delete an agent's location
     */
    static async deleteLocation(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        await AgentService.deleteAgentLocation(id, req.user.id);
        res.status(204).send();
    }

    /**
     * Get all locations for an agent
     */
    static async getLocations(req: AuthenticatedRequest, res: Response) {
        const locations = await AgentService.getAgentLocations(req.user.id);
        res.json(locations);
    }

    /**
     * Update agent's status
     */
    static async updateStatus(req: AuthenticatedRequest, res: Response) {
        const { status, isAcceptingOrders } = req.body;
        const agent = await AgentService.updateAgentStatus(
            req.user.id,
            status,
            isAcceptingOrders
        );
        res.json(agent);
    }

    /**
     * Get agent's current status
     */
    static async getStatus(req: AuthenticatedRequest, res: Response) {
        const status = await AgentService.getAgentStatus(req.user.id);
        res.json(status);
    }

    /**
     * Find nearby agents
     */
    static async findNearbyAgents(req: Request, res: Response) {
        const { latitude, longitude, maxRadius } = req.query;
        const agents = await AgentService.findNearbyAgents(
            Number(latitude),
            Number(longitude),
            maxRadius ? Number(maxRadius) : undefined
        );
        res.json(agents);
    }
}