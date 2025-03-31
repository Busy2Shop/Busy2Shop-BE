import { Request, Response } from 'express';
import LocationService from '../services/location.service';
import MarketService from '../services/market.service';
import AgentService from '../services/agent.service';
import { Database } from '../models';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';

// Utility function to catch async errors
const catchAsync = <T extends Request, ResBody = unknown>(fn: (req: T, res: Response) => Promise<Response<ResBody, Record<string, unknown>> | undefined | void>) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return (req: T, res: Response) => {
        Promise.resolve(fn(req, res)).catch((err) => {
            console.error('Error in controller:', err);
            res.status(500).json({ 
                status: 'error',
                message: err.message || 'Something went wrong',
            });
        });
    };
};

export default class LocationController {
    /**
     * Find nearby markets using LocationService's advanced filtering
     */
    static findNearbyMarkets = catchAsync(async (req: Request, res: Response) => {
        const { lat, lng, distance, limit, page, q } = req.query;

        const latitude = parseFloat(lat as string);
        const longitude = parseFloat(lng as string);
        const distanceKm = distance ? parseFloat(distance as string) : 5;
        const pageNum = page ? parseInt(page as string) : 1;
        const limitNum = limit ? parseInt(limit as string) : 10;

        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({
                status: 'error',
                message: 'Valid latitude and longitude are required',
            });
        }

        const result = await LocationService.findNearbyMarkets(
            { latitude, longitude },
            { 
                distance: distanceKm,
                limit: limitNum,
                page: pageNum,
                searchQuery: q as string,
            }
        );

        res.json({
            status: 'success',
            message: 'Nearby markets retrieved successfully',
            data: result,
        });
    });

    /**
     * Find available agents near a location
     */
    static findAvailableAgents = catchAsync(async (req: Request, res: Response) => {
        const { lat, lng, distance, limit } = req.query;

        const latitude = parseFloat(lat as string);
        const longitude = parseFloat(lng as string);
        const distanceKm = distance ? parseFloat(distance as string) : 5;
        const limitNum = limit ? parseInt(limit as string) : 10;

        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({
                status: 'error',
                message: 'Valid latitude and longitude are required',
            });
        }

        const agents = await LocationService.findAvailableAgents(
            { latitude, longitude },
            { 
                distance: distanceKm,
                limit: limitNum,
            }
        );

        return res.json({
            status: 'success',
            message: 'Available agents retrieved successfully',
            data: {
                count: agents.length,
                agents,
            },
        });
    });

    /**
     * Find nearby agents that are available for orders
     */
    static findNearbyAgentsForOrders = catchAsync(async (req: Request, res: Response) => {
        const { lat, lng, distance, available } = req.query;

        const latitude = parseFloat(lat as string);
        const longitude = parseFloat(lng as string);
        const distanceKm = distance ? parseFloat(distance as string) : 5;
        const isAvailable = available !== 'false'; // Default to true

        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({
                status: 'error',
                message: 'Valid latitude and longitude are required',
            });
        }

        const agents = await AgentService.findNearbyAgents({
            lat: latitude,
            lng: longitude,
            distance: distanceKm,
            available: isAvailable,
        });

        return res.json({
            status: 'success',
            message: 'Nearby agents for orders retrieved successfully',
            data: {
                count: agents.length,
                agents,
            },
        });
    });
    static getNearbyMarkets = catchAsync(async (req: Request, res: Response) => {
        const { lat, lng, distance, ...query } = req.query;

        const latitude = parseFloat(lat as string);
        const longitude = parseFloat(lng as string);
        const distanceKm = distance ? parseFloat(distance as string) : 5;

        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({
                status: 'error',
                message: 'Valid latitude and longitude are required',
            });
        }

        const result = await MarketService.viewMarkets({
            lat: latitude,
            lng: longitude,
            distance: distanceKm,
            ...query,
        });

        return res.json({
            status: 'success',
            message: 'Nearby markets retrieved successfully',
            data: result,
        });
    });

    static getNearbyAgents = catchAsync(async (req: Request, res: Response) => {
        const { lat, lng, distance, ...query } = req.query;

        const latitude = parseFloat(lat as string);
        const longitude = parseFloat(lng as string);
        const distanceKm = distance ? parseFloat(distance as string) : 5;

        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({
                status: 'error',
                message: 'Valid latitude and longitude are required',
            });
        }

        const result = await AgentService.getNearbyAgents(latitude, longitude, distanceKm, query);

        return res.json({
            status: 'success',
            message: 'Nearby agents retrieved successfully',
            data: result,
        });
    });

    static updateAgentLocation = catchAsync(async (req: AuthenticatedRequest, res: Response) => {
        const { latitude, longitude } = req.body;
        const agentId = req.user.id;

        if (req.user.status.userType !== 'agent') {
            return res.status(403).json({
                status: 'error',
                message: 'Only agents can update location',
            });
        }

        if (isNaN(parseFloat(latitude)) || isNaN(parseFloat(longitude))) {
            return res.status(400).json({
                status: 'error',
                message: 'Valid latitude and longitude are required',
            });
        }

        const agent = await LocationService.updateAgentLocation(
            agentId,
            {
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
            }
        );

        return res.json({
            status: 'success',
            message: 'Location updated successfully',
            data: {
                id: agent.id,
                currentLocation: {
                    latitude: agent.currentLocation.coordinates[1],
                    longitude: agent.currentLocation.coordinates[0],
                },
            },
        });
    });

    static getAgentLocationAndETA = catchAsync(async (req: Request, res: Response) => {
        const { orderId } = req.params;
        const { lat, lng } = req.query;

        const destinationLat = parseFloat(lat as string);
        const destinationLng = parseFloat(lng as string);

        if (isNaN(destinationLat) || isNaN(destinationLng)) {
            return res.status(400).json({
                status: 'error',
                message: 'Valid destination coordinates are required',
            });
        }

        // Get the agent ID from the order
        const order = await Database.models.Order.findByPk(orderId);

        if (!order) {
            return res.status(404).json({
                status: 'error',
                message: 'Order not found',
            });
        }

        // Cast to Order type to access agentId
        const orderModel = order as unknown as import('../models/order.model').default;

        if (!orderModel.agentId) {
            return res.status(400).json({
                status: 'error',
                message: 'No agent assigned to this order yet',
            });
        }

        const locationData = await LocationService.getAgentLocationAndETA(
            orderModel.agentId,
            destinationLat,
            destinationLng
        );

        return res.json({
            status: 'success',
            message: 'Agent location and ETA retrieved successfully',
            data: locationData,
        });
    });
}
