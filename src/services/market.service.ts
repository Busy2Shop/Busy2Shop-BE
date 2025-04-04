import { FindAndCountOptions, literal, Op, Transaction } from 'sequelize';
import Market, { IMarket } from '../models/market.model';
import Category from '../models/category.model';
import User from '../models/user.model';
import Product from '../models/product.model';
import MarketCategory from '../models/marketCategory.model';
import { BadRequestError, NotFoundError, UnprocessableEntityError } from '../utils/customErrors';
import Pagination, { IPaging } from '../utils/pagination';
import axios from 'axios';
import { LOCATIONIQ_API_BASE_URL, LOCATIONIQ_API_KEY } from '../utils/constants';


export interface IViewMarketsQuery {
    page?: number;
    size?: number;
    q?: string; // Search query
    categoryId?: string;
    marketType?: string;
    lat?: number; // Latitude for location-based search
    lng?: number; // Longitude for location-based search
    distance?: number; // Distance in kilometers
    isPinned?: boolean;
}

export default class MarketService {
    private static readonly DEFAULT_SEARCH_RADIUS = 5; // km
    private static readonly BATCH_SIZE = 10; // For bulk operations

    static async addMarket(marketData: IMarket, categoryIds: string[] = []): Promise<Market> {
        // Validate required fields
        if (!marketData.address || !marketData.location || !marketData.marketType) {
            throw new BadRequestError('Address, location, and market type are required');
        }

        try {
            // Geocode the address to get coordinates
            const coordinates = await this.geocodeAddress(marketData.address);
            
            const newMarket = await Market.create({
                ...marketData,
                geoLocation: {
                    type: 'Point',
                    coordinates,
                },
            });

            // Handle category associations
            if (categoryIds.length > 0) {
                await Promise.all(categoryIds.map(categoryId =>
                    MarketCategory.create({
                        marketId: newMarket.id,
                        categoryId,
                    })
                ));
            }

            return newMarket;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            throw new UnprocessableEntityError(`Failed to geocode market address: ${errorMessage}`);
        }
    }


    static async viewMarkets(queryData?: IViewMarketsQuery): Promise<{ markets: Market[], count: number, totalPages?: number }> {
        const { page, size, q: query, categoryId, marketType, isPinned, lat, lng, distance } = queryData || {};
        
        const queryOptions = await this.buildMarketQueryOptions({
            query,
            categoryId,
            marketType,
            isPinned,
            coordinates: lat && lng ? { latitude: lat, longitude: lng } : undefined,
            distance,
            page,
            size,
        });

        const { rows: markets, count } = await Market.findAndCountAll(queryOptions);

        if (page && size && markets.length > 0) {
            const totalPages = Pagination.estimateTotalPage({ count, limit: size } as IPaging);
            return { markets, count, ...totalPages };
        }
        
        return { markets, count };
    }

    

    static async viewSingleMarket(id: string): Promise<Market> {
        const market = await Market.findByPk(id, {
            include: [
                {
                    model: Category,
                    as: 'categories',
                    through: { attributes: [] },
                },
                {
                    model: User,
                    as: 'owner',
                    attributes: ['id', 'firstName', 'lastName', 'email'],
                },
                {
                    model: Product,
                    as: 'products',
                    separate: true, // Lazy load to avoid large responses
                    limit: 10,      // Only get the first few products
                },
            ],
        });

        if (!market) {
            throw new NotFoundError('Market not found');
        }

        return market;
    }

    static async updateMarket(id: string, dataToUpdate: Partial<IMarket>): Promise<Market> {
        const market = await this.viewSingleMarket(id);

        await market.update(dataToUpdate);

        return market;
    }

    static async deleteMarket(id: string, transaction?: Transaction): Promise<void> {
        const market = await this.viewSingleMarket(id);

        transaction ? await market.destroy({ transaction }) : await market.destroy();
    }

    static async addMarketToCategory(marketId: string, categoryId: string): Promise<void> {
        await this.viewSingleMarket(marketId);
        const category = await Category.findByPk(categoryId);

        if (!category) {
            throw new NotFoundError('Category not found');
        }

        const existing = await MarketCategory.findOne({
            where: { marketId, categoryId },
        });

        if (!existing) {
            await MarketCategory.create({ marketId, categoryId });
        }
    }

    static async removeMarketFromCategory(marketId: string, categoryId: string): Promise<void> {
        const association = await MarketCategory.findOne({
            where: { marketId, categoryId },
        });

        if (association) {
            await association.destroy();
        }
    }

    static async toggleMarketPinned(id: string): Promise<Market> {
        const market = await this.viewSingleMarket(id);

        await market.update({ isPinned: !market.isPinned });

        return market;
    }

    
    private static async geocodeAddress(address: string): Promise<[number, number]> {
        try {
            const response = await axios.get(`${LOCATIONIQ_API_BASE_URL}/search`, {
                params: {
                    key: LOCATIONIQ_API_KEY,
                    q: address,
                    format: 'json',
                    limit: 1,
                },
            });

            if (!Array.isArray(response.data) || response.data.length === 0) {
                throw new Error('Invalid response from geocoding service');
            }

            const [result] = response.data;
            return [parseFloat(result.lon), parseFloat(result.lat)];
        } catch (error) {
            console.error(`Geocoding error for address: ${address}`, error);
            throw error;
        }
    }

    private static async buildMarketQueryOptions({
        query,
        categoryId,
        marketType,
        isPinned,
        coordinates,
        distance = this.DEFAULT_SEARCH_RADIUS,
        page,
        size,
    }: {
        query?: string;
        categoryId?: string;
        marketType?: string;
        isPinned?: boolean;
        coordinates?: { latitude: number; longitude: number };
        distance?: number;
        page?: number;
        size?: number;
    }): Promise<FindAndCountOptions<Market>> {
        const where: Record<string | symbol, unknown> = {};
        const queryOptions: FindAndCountOptions<Market> = { where };

        // Base includes
        queryOptions.include = this.getBaseIncludes(categoryId);

        // Search filters
        if (query) {
            where[Op.or] = [
                { name: { [Op.iLike]: `%${query}%` } },
                { description: { [Op.iLike]: `%${query}%` } },
            ];
        }

        // Standard filters
        if (marketType) where.marketType = marketType;
        if (isPinned !== undefined) where.isPinned = isPinned;

        // Geospatial search
        if (coordinates) {
            const distanceInMeters = distance * 1000;
            Object.assign(where, this.buildGeoSpatialQuery(coordinates, distanceInMeters));
            queryOptions.attributes = {
                include: [[this.calculateDistanceQuery(coordinates), 'distance']],
            };
            queryOptions.order = [[literal('distance'), 'ASC']];
        }

        // Pagination
        if (page && size && page > 0 && size > 0) {
            const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);
            queryOptions.limit = limit ?? 0;
            queryOptions.offset = offset ?? 0;
        }

        return queryOptions;
    }

    private static buildGeoSpatialQuery(
        coordinates: { latitude: number; longitude: number },
        distanceInMeters: number
    ) {
        return {
            [String(literal('ST_DWithin(geoLocation, ST_SetSRID(ST_MakePoint(:longitude, :latitude), 4326), :distance)'))]: true,
        };
    }

    private static calculateDistanceQuery(coordinates: { latitude: number; longitude: number }) {
        return literal(`
            ST_Distance(
                geoLocation,
                ST_SetSRID(ST_MakePoint(${coordinates.longitude}, ${coordinates.latitude}), 4326)
            )
        `);
    }

    private static getBaseIncludes(categoryId?: string) {
        return [
            {
                model: Category,
                as: 'categories',
                attributes: ['id', 'name'],
                through: { attributes: [] },
                ...(categoryId && { where: { id: categoryId } }),
            },
            {
                model: User,
                as: 'owner',
                attributes: ['id', 'firstName', 'lastName', 'email'],
            },
        ];
    }

    
}