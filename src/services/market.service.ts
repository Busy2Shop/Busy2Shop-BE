import { Transaction, Op, FindAndCountOptions } from 'sequelize';
import Market, { IMarket } from '../models/market.model';
import Category from '../models/category.model';
import User from '../models/user.model';
import Product from '../models/product.model';
import MarketCategory from '../models/marketCategory.model';
import { NotFoundError, BadRequestError } from '../utils/customErrors';
import Pagination, { IPaging } from '../utils/pagination';

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
    static async addMarket(marketData: IMarket, categoryIds: string[] = []): Promise<Market> {
        // Validate required fields
        if (!marketData.address || !marketData.location || !marketData.marketType) {
            throw new BadRequestError('Address, location, and market type are required');
        }

        const newMarket = await Market.create({ ...marketData });

        // Associate with categories if provided
        if (categoryIds.length > 0) {
            for (const categoryId of categoryIds) {
                await MarketCategory.create({
                    marketId: newMarket.id,
                    categoryId,
                });
            }
        }

        return newMarket;
    }

    static async viewMarkets(queryData?: IViewMarketsQuery): Promise<{ markets: Market[], count: number, totalPages?: number }> {
        const { page, size, q: query, categoryId, marketType, isPinned } = queryData || {};

        const where: Record<string | symbol, unknown> = {};

        // Handle search query
        if (query) {
            where[Op.or] = [
                { name: { [Op.iLike]: `%${query}%` } },
                { address: { [Op.iLike]: `%${query}%` } },
                { description: { [Op.iLike]: `%${query}%` } },
            ];
        }

        // Filter by market type
        if (marketType) {
            where.marketType = marketType;
        }

        // Filter by pinned status
        if (isPinned !== undefined) {
            where.isPinned = isPinned;
        }

        // Basic query options
        const queryOptions: FindAndCountOptions<Market> = {
            where,
            include: [
                {
                    model: Category,
                    as: 'categories',
                    attributes: ['id', 'name'],
                    through: { attributes: [] }, // Exclude join table attributes
                },
                {
                    model: User,
                    as: 'owner',
                    attributes: ['id', 'firstName', 'lastName', 'email'],
                },
            ],
        };

        // Filter by category if provided
        if (categoryId) {
            queryOptions.include = [
                {
                    model: Category,
                    as: 'categories',
                    attributes: ['id', 'name'],
                    through: { attributes: [] },
                    where: { id: categoryId },
                },
                {
                    model: User,
                    as: 'owner',
                    attributes: ['id', 'firstName', 'lastName', 'email'],
                },
            ];
        }

        // Handle pagination
        if (page && size && page > 0 && size > 0) {
            const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);
            queryOptions.limit = limit ?? 0;
            queryOptions.offset = offset ?? 0;
        }

        // TODO: Add location-based filtering with PostGIS or Sequelize's geospatial operators
        // This would require additional setup for geospatial queries

        const { rows: markets, count } = await Market.findAndCountAll(queryOptions);

        // Calculate pagination metadata if applicable
        if (page && size && markets.length > 0) {
            const totalPages = Pagination.estimateTotalPage({ count, limit: size } as IPaging);
            return { markets, count, ...totalPages };
        } else {
            return { markets, count };
        }
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
}