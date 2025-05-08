import { FindAndCountOptions, Op } from 'sequelize';
import Product, { IProduct } from '../models/product.model';
import Market from '../models/market.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/customErrors';
import Pagination, { IPaging } from '../utils/pagination';

export interface IViewProductsQuery {
    page?: number;
    size?: number;
    q?: string; // Search query
    marketId?: string;
    minPrice?: number;
    maxPrice?: number;
    isAvailable?: boolean;
}

export default class ProductService {
    static async addProduct(productData: IProduct): Promise<Product> {
        // Validate required fields
        if (!productData.name || !productData.price || !productData.marketId) {
            throw new BadRequestError('Product name, price, and market ID are required');
        }

        // Check if the market exists
        const market = await Market.findByPk(productData.marketId);
        if (!market) {
            throw new NotFoundError('Market not found');
        }

        // If this is a market type that explicitly shouldn't have products
        if (market.marketType === 'local_market') {
            throw new BadRequestError('This type of market cannot have products');
        }

        return await Product.create({ ...productData });
    }

    static async viewProducts(
        queryData?: IViewProductsQuery,
    ): Promise<{ products: Product[]; count: number; totalPages?: number }> {
        const { page, size, q: query, marketId, minPrice, maxPrice, isAvailable } = queryData || {};

        const where: Record<string | symbol, unknown> = {};

        // Handle search query
        if (query) {
            where[Op.or] = [
                { name: { [Op.iLike]: `%${query}%` } },
                { description: { [Op.iLike]: `%${query}%` } },
                { barcode: { [Op.iLike]: `%${query}%` } },
            ];
        }

        // Filter by market
        if (marketId) {
            where.marketId = marketId;
        }

        // Filter by price range
        if (minPrice !== undefined || maxPrice !== undefined) {
            where.price = {} as { [key: symbol]: number };

            if (minPrice !== undefined) {
                (where.price as { [key: symbol]: number })[Op.gte] = minPrice;
            }

            if (maxPrice !== undefined) {
                (where.price as { [key: symbol]: number })[Op.lte] = maxPrice;
            }
        }

        // Filter by availability
        if (isAvailable !== undefined) {
            where.isAvailable = isAvailable;
        }

        // Basic query options
        const queryOptions: FindAndCountOptions<Product> = {
            where,
            include: [
                {
                    model: Market,
                    as: 'market',
                    attributes: ['id', 'name', 'marketType', 'address'],
                },
            ],
        };

        // Handle pagination
        if (page && size && page > 0 && size > 0) {
            const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);
            queryOptions.limit = limit ?? 0;
            queryOptions.offset = offset ?? 0;
        }

        const { rows: products, count } = await Product.findAndCountAll(queryOptions);

        // Calculate pagination metadata if applicable
        if (page && size && products.length > 0) {
            const totalPages = Pagination.estimateTotalPage({ count, limit: size } as IPaging);
            return { products, count, ...totalPages };
        } else {
            return { products, count };
        }
    }

    static async viewMarketProducts(
        marketId: string,
        queryData?: IViewProductsQuery,
    ): Promise<{ products: Product[]; count: number; totalPages?: number }> {
        // Check if the market exists
        const market = await Market.findByPk(marketId);
        if (!market) {
            throw new NotFoundError('Market not found');
        }

        // Add marketId to the query
        const marketQuery = {
            ...queryData,
            marketId,
        };

        return await this.viewProducts(marketQuery);
    }

    static async getProduct(id: string): Promise<Product> {
        const product = await Product.findByPk(id, {
            include: [
                {
                    model: Market,
                    as: 'market',
                    attributes: ['id', 'name', 'marketType', 'address'],
                },
            ],
        });

        if (!product) {
            throw new NotFoundError('Product not found');
        }

        return product;
    }

    static async updateProduct(
        id: string,
        ownerId: string,
        dataToUpdate: Partial<IProduct>,
    ): Promise<Product> {
        const product = await this.getProduct(id);

        // Check if the market belongs to this owner
        const market = await Market.findByPk(product.marketId);
        if (!market || market.ownerId !== ownerId) {
            throw new ForbiddenError('You are not authorized to update this product');
        }

        // Cannot change the market ID
        if (dataToUpdate.marketId && dataToUpdate.marketId !== product.marketId) {
            throw new BadRequestError('Cannot change the market for an existing product');
        }

        await product.update(dataToUpdate);

        return await this.getProduct(id);
    }

    static async deleteProduct(id: string, ownerId: string): Promise<void> {
        const product = await this.getProduct(id);

        // Check if the market belongs to this owner
        const market = await Market.findByPk(product.marketId);
        if (!market || market.ownerId !== ownerId) {
            throw new ForbiddenError('You are not authorized to delete this product');
        }

        await product.destroy();
    }

    static async toggleProductAvailability(id: string, ownerId: string): Promise<Product> {
        const product = await this.getProduct(id);

        // Check if the market belongs to this owner
        const market = await Market.findByPk(product.marketId);
        if (!market || market.ownerId !== ownerId) {
            throw new ForbiddenError('You are not authorized to update this product');
        }

        await product.update({ isAvailable: !product.isAvailable });

        return await this.getProduct(id);
    }

    static async bulkAddProducts(products: IProduct[], ownerId: string): Promise<Product[]> {
        // Validate that all products belong to markets owned by this user
        const marketIds = [...new Set(products.map(p => p.marketId))];

        const ownedMarkets = await Market.count({
            where: {
                id: { [Op.in]: marketIds },
                ownerId,
            },
        });

        if (ownedMarkets !== marketIds.length) {
            throw new ForbiddenError(
                'You do not have permission to add products to all the specified markets',
            );
        }

        // Ensure all marketType can have catalog products.
        const marketTypes = await Market.findAll({
            attributes: ['id', 'marketType'],
            where: {
                id: { [Op.in]: marketIds },
            },
        });

        const localMarkets = marketTypes.filter(m => m.marketType === 'local_market');
        if (localMarkets.length > 0) {
            throw new BadRequestError('This type of market(local_market) cannot have products');
        }

        // Create all products
        const createdProducts = await Product.bulkCreate(products);

        // Return all created products with their markets
        return await Product.findAll({
            where: {
                id: { [Op.in]: createdProducts.map(p => p.id) },
            },
            include: [
                {
                    model: Market,
                    as: 'market',
                    attributes: ['id', 'name', 'marketType', 'address'],
                },
            ],
        });
    }
}
