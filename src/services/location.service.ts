import { literal, Op, Transaction } from 'sequelize';
import Market from '../models/market.model';
import Category from '../models/category.model';
import User from '../models/user.model';
import Order from '../models/order.model';
import { redisPubClient } from '../utils/redis';
import { NotFoundError } from '../utils/customErrors';
import { Database } from '../models';
import { LocationUpdateData } from '../clients/socket/types';

interface LocationCoordinates {
    latitude: number;
    longitude: number;
}

interface NearbySearchOptions {
    distance?: number;    // in kilometers
    limit?: number;       // max results
    page?: number;       // pagination
    searchQuery?: string; // text search
}

export default class LocationService {
    private static readonly DEFAULT_SEARCH_RADIUS = 5; // km
    private static readonly DEFAULT_PAGE_SIZE = 10;

    /**
     * Find nearby markets with advanced filtering
     */
    static async findNearbyMarkets(
        coordinates: LocationCoordinates,
        options: NearbySearchOptions = {}
    ) {
        const {
            distance = this.DEFAULT_SEARCH_RADIUS,
            limit = this.DEFAULT_PAGE_SIZE,
            page = 1,
            searchQuery,
        } = options;

        const distanceInMeters = distance * 1000;
        const offset = (page - 1) * limit;

        const where = this.buildGeoSpatialQuery(
            coordinates,
            distanceInMeters,
            searchQuery ? {
                [Op.or]: [
                    { name: { [Op.iLike]: `%${searchQuery}%` } },
                    { description: { [Op.iLike]: `%${searchQuery}%` } },
                ],
            } : {}
        );

        const { rows: markets, count } = await Market.findAndCountAll({
            where,
            attributes: {
                include: [
                    [this.calculateDistanceQuery(coordinates), 'distance'],
                ],
            },
            include: this.getMarketIncludes(),
            order: [[literal('distance'), 'ASC']],
            limit,
            offset,
        });

        return {
            markets,
            pagination: {
                total: count,
                pages: Math.ceil(count / limit),
                current: page,
                pageSize: limit,
            },
        };
    }

    /**
     * Find available agents near a location
     */
    static async findAvailableAgents(
        coordinates: LocationCoordinates,
        options: NearbySearchOptions = {}
    ) {
        const {
            distance = this.DEFAULT_SEARCH_RADIUS,
            limit = this.DEFAULT_PAGE_SIZE,
        } = options;

        return await User.findAll({
            where: {
                'status.userType': 'agent',
                'status.activated': true,
                locationTrackingEnabled: true,
                currentLocation: {
                    [Op.ne]: { type: 'Point', coordinates: [0, 0] },
                },
                ...this.buildGeoSpatialQuery(coordinates, distance * 1000),
            },
            attributes: {
                include: [[this.calculateDistanceQuery(coordinates), 'distance']],
                exclude: ['password'],
            },
            order: [[literal('distance'), 'ASC']],
            limit,
        });
    }

    /**
     * Real-time agent tracking system
     */
    static async updateAgentLocation(
        agentId: string,
        coordinates: LocationCoordinates,
        transaction?: Transaction
    ) {
        const agent = await User.findOne({
            where: {
                id: agentId,
                'status.userType': 'agent',
            },
            transaction,
        });

        if (!agent) {
            throw new NotFoundError('Agent not found');
        }

        await agent.update({
            locationTrackingEnabled: true,
            currentLocation: {
                type: 'Point',
                coordinates: [coordinates.longitude, coordinates.latitude],
            },
        }, { transaction });

        // Update real-time tracking for active orders
        await this.updateActiveOrdersLocation(agentId, coordinates);

        return agent;
    }

    /**
     * Helper method to update active orders with location
     */
    private static async updateActiveOrdersLocation(
        agentId: string,
        coordinates: LocationCoordinates
    ) {
        const activeOrders = await Order.findAll({
            where: {
                agentId,
                status: {
                    [Op.in]: ['accepted', 'in_progress'],
                },
            },
        });

        await Promise.all(activeOrders.map(order => 
            this.publishLocationUpdate(order.id, agentId, coordinates)
        ));
    }

    /**
     * Publish location updates to Redis for real-time tracking
     */
    private static async publishLocationUpdate(
        orderId: string,
        agentId: string,
        coordinates: LocationCoordinates
    ) {
        // Format data according to LocationUpdateData interface
        const locationData: LocationUpdateData = {
            latitude: coordinates.latitude,
            longitude: coordinates.longitude,
            timestamp: Date.now(),
            agentId,
            orderId,
        };

        // Publish to the original Redis channel for backward compatibility
        const legacyUpdate = {
            orderId,
            agentId,
            location: coordinates,
            timestamp: new Date().toISOString(),
        };

        await redisPubClient.publish(
            `order:${orderId}:location`,
            JSON.stringify(legacyUpdate)
        );

        // Store location data in Redis using the same key format as in the socket implementation
        const locationKey = `location:agent:${agentId}`;
        await redisPubClient.set(locationKey, JSON.stringify(locationData));

        // Set expiration for the location data (e.g., 1 hour)
        await redisPubClient.expire(locationKey, 3600);

        // Also store in the legacy format for backward compatibility
        await redisPubClient.hset(
            `agent:${agentId}:location`,
            {
                ...coordinates,
                timestamp: Date.now(),
            }
        );
    }

    /**
     * Helper method to build PostGIS query
     */
    private static buildGeoSpatialQuery(
        coordinates: LocationCoordinates,
        distanceInMeters: number,
        additionalWhere: Record<string, unknown> = {}
    ) {
        return {
            [String(literal('ST_DWithin(geoLocation, ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326), :distance)'))]: true,
            ...additionalWhere,
        };
    }

    /**
     * Helper method to calculate distance in PostGIS
     */
    private static calculateDistanceQuery(coordinates: LocationCoordinates) {
        return literal(`
            ST_Distance(
                geoLocation,
                ST_SetSRID(ST_MakePoint(${coordinates.longitude}, ${coordinates.latitude}), 4326)
            )
        `);
    }

    /**
     * Helper method to get standard market includes
     */
    private static getMarketIncludes() {
        return [
            {
                model: Category,
                as: 'categories',
                attributes: ['id', 'name'],
                through: { attributes: [] },
            },
            {
                model: User,
                as: 'owner',
                attributes: ['id', 'firstName', 'lastName', 'email'],
            },
        ];
    }

    /**
     * Get the current location and estimated time to destination
     * @param agentId The ID of the agent
     * @param destinationLat Destination latitude
     * @param destinationLng Destination longitude
     * @returns Object containing agent's current location and ETA to destination
     */
    static async getAgentLocationAndETA(
        agentId: string,
        destinationLat: number,
        destinationLng: number
    ) {
        // Find the agent
        const agent = await User.findOne({
            where: {
                id: agentId,
                'status.userType': 'agent',
            },
            attributes: ['id', 'firstName', 'lastName', 'currentLocation', 'locationTrackingEnabled'],
        });

        if (!agent) {
            throw new NotFoundError('Agent not found');
        }

        if (!agent.locationTrackingEnabled || !agent.currentLocation) {
            throw new NotFoundError('Agent location tracking is not enabled or location is not available');
        }

        // Extract agent's current coordinates
        const agentLocation = agent.currentLocation as { type: string; coordinates: [number, number] };
        const [agentLng, agentLat] = agentLocation.coordinates;

        // Calculate distance in meters using PostGIS
        const distanceQuery = literal(`
            ST_Distance(
                ST_SetSRID(ST_MakePoint(${agentLng}, ${agentLat}), 4326),
                ST_SetSRID(ST_MakePoint(${destinationLng}, ${destinationLat}), 4326)
            )
        `);

        interface DistanceResult {
            distance: number;
        }

        const [distanceResult] = await Database.query(`
            SELECT ${distanceQuery.val} as distance
        `, { type: 'SELECT' }) as DistanceResult[];

        const distanceInMeters = distanceResult.distance;

        // Estimate travel time (assuming average speed of 30 km/h in urban areas)
        // Convert to seconds: distance (m) / speed (m/s)
        const averageSpeedMPS = 30 * 1000 / 3600; // 30 km/h in meters per second
        const estimatedTimeSeconds = distanceInMeters / averageSpeedMPS;

        // Calculate ETA
        const eta = new Date(Date.now() + estimatedTimeSeconds * 1000);

        return {
            agent: {
                id: agent.id,
                firstName: agent.firstName,
                lastName: agent.lastName,
            },
            currentLocation: {
                latitude: agentLat,
                longitude: agentLng,
            },
            destination: {
                latitude: destinationLat,
                longitude: destinationLng,
            },
            distance: {
                meters: distanceInMeters,
                kilometers: distanceInMeters / 1000,
            },
            eta: {
                estimatedTimeSeconds,
                estimatedArrival: eta.toISOString(),
            },
        };
    }
}
