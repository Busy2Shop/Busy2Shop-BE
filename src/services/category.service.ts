import { FindAndCountOptions, Op, Transaction } from 'sequelize';
import Category, { ICategory } from '../models/category.model';
import Market from '../models/market.model';
import { BadRequestError, NotFoundError } from '../utils/customErrors';
import Pagination, { IPaging } from '../utils/pagination';

export interface IViewCategoriesQuery {
    page?: number;
    size?: number;
    q?: string; // Search query
    isPinned?: boolean;
}

export default class CategoryService {
    static async addCategory(categoryData: ICategory): Promise<Category> {
        // Check if category with same name already exists
        const existing = await Category.findOne({
            where: { name: categoryData.name },
        });

        if (existing) {
            throw new BadRequestError(`Category with name '${categoryData.name}' already exists`);
        }

        return await Category.create({ ...categoryData });
    }

    static async viewCategories(queryData?: IViewCategoriesQuery): Promise<{ categories: Category[], count: number, totalPages?: number }> {
        const { page, size, q: query, isPinned } = queryData || {};

        const where: Record<string | symbol, unknown> = {};

        // Handle search query
        if (query) {
            where[Op.or] = [
                { name: { [Op.iLike]: `%${query}%` } },
                { description: { [Op.iLike]: `%${query}%` } },
            ];
        }

        // Filter by pinned status
        if (isPinned !== undefined) {
            where.isPinned = isPinned;
        }

        // Basic query options
        const queryOptions: FindAndCountOptions<Category> = {
            where,
            include: [
                {
                    model: Market,
                    as: 'markets',
                    attributes: ['id', 'name'],
                    through: { attributes: [] }, // Exclude join table attributes
                },
            ],
        };

        // Handle pagination
        if (page && size && page > 0 && size > 0) {
            const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);
            queryOptions.limit = limit ?? 0;
            queryOptions.offset = offset ?? 0;
        }

        const { rows: categories, count } = await Category.findAndCountAll(queryOptions);

        // Calculate pagination metadata if applicable
        if (page && size && categories.length > 0) {
            const totalPages = Pagination.estimateTotalPage({ count, limit: size } as IPaging);
            return { categories, count, ...totalPages };
        } else {
            return { categories, count };
        }
    }

    static async viewSingleCategory(id: string): Promise<Category> {
        const category = await Category.findByPk(id, {
            include: [
                {
                    model: Market,
                    as: 'markets',
                    through: { attributes: [] },
                },
            ],
        });

        if (!category) {
            throw new NotFoundError('Category not found');
        }

        return category;
    }

    static async updateCategory(id: string, dataToUpdate: Partial<ICategory>): Promise<Category> {
        const category = await this.viewSingleCategory(id);

        // If the name is being updated, make sure it's unique
        if (dataToUpdate.name && dataToUpdate.name !== category.name) {
            const existing = await Category.findOne({
                where: { name: dataToUpdate.name },
            });

            if (existing) {
                throw new BadRequestError(`Category with name '${dataToUpdate.name}' already exists`);
            }
        }

        await category.update(dataToUpdate);

        return category;
    }

    static async deleteCategory(id: string, transaction?: Transaction): Promise<void> {
        const category = await this.viewSingleCategory(id);

        transaction ? await category.destroy({ transaction }) : await category.destroy();
    }

    static async toggleCategoryPinned(id: string): Promise<Category> {
        const category = await this.viewSingleCategory(id);

        await category.update({ isPinned: !category.isPinned });

        return category;
    }

    static async getMarketsByCategory(categoryId: string, pagination?: { page: number, size: number }): Promise<{ markets: Market[], count: number, totalPages?: number }> {
        await this.viewSingleCategory(categoryId);

        const queryOptions: FindAndCountOptions<Market> = {
            include: [
                {
                    model: Category,
                    as: 'categories',
                    where: { id: categoryId },
                    through: { attributes: [] },
                },
            ],
        };

        // Handle pagination
        if (pagination?.page && pagination?.size) {
            const { limit, offset } = Pagination.getPagination({
                page: pagination.page,
                size: pagination.size,
            } as IPaging);

            queryOptions.limit = limit ?? 0;
            queryOptions.offset = offset ?? 0;
        }

        const { rows: markets, count } = await Market.findAndCountAll(queryOptions);

        // Calculate pagination metadata if applicable
        if (pagination?.page && pagination?.size && markets.length > 0) {
            const totalPages = Pagination.estimateTotalPage({
                count,
                limit: pagination.size,
            } as IPaging);

            return { markets, count, ...totalPages };
        } else {
            return { markets, count };
        }
    }
}