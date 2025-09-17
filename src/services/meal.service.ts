import Meal from '../models/meal.model';
import MealIngredient from '../models/mealIngredient.model';
import Product from '../models/product.model';
import { NotFoundError, BadRequestError } from '../utils/customErrors';
import { IMeal } from '../models/meal.model';
import { IMealIngredient } from '../models/mealIngredient.model';
import { Op } from 'sequelize';

export default class MealService {
    /**
     * Get all meals with optional filtering
     */
    static async getMeals(params: {
        page?: number;
        size?: number;
        category?: string;
        cuisine?: string;
        difficulty?: string;
        popular?: boolean;
        tags?: string[];
    } = {}) {
        const {
            page = 1,
            size = 20,
            category,
            cuisine,
            difficulty,
            popular,
            tags,
        } = params;

        const offset = (page - 1) * size;
        const whereClause: any = { isActive: true };

        if (category) whereClause.category = category;
        if (cuisine) whereClause.cuisine = cuisine;
        if (difficulty) whereClause.difficulty = difficulty;
        if (popular) whereClause.isPopular = true;
        if (tags && tags.length > 0) {
            whereClause.tags = { [Op.overlap]: tags };
        }

        const { rows: meals, count } = await Meal.findAndCountAll({
            where: whereClause,
            include: [
                {
                    model: MealIngredient,
                    as: 'mealIngredients',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'price', 'images'],
                            required: false,
                        },
                    ],
                    order: [['sortOrder', 'ASC']],
                },
            ],
            order: [
                ['isPopular', 'DESC'],
                ['sortOrder', 'ASC'],
                ['createdAt', 'DESC'],
            ],
            limit: size,
            offset,
        });

        return {
            meals,
            count,
            totalPages: Math.ceil(count / size),
            currentPage: page,
        };
    }

    /**
     * Get a single meal with all its ingredients
     */
    static async getMealById(id: string) {
        const meal = await Meal.findByPk(id, {
            include: [
                {
                    model: MealIngredient,
                    as: 'mealIngredients',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'price', 'images', 'description'],
                            required: false,
                        },
                    ],
                    order: [['sortOrder', 'ASC']],
                },
            ],
        });

        if (!meal) {
            throw new NotFoundError('Meal not found');
        }

        if (!meal.isActive) {
            throw new BadRequestError('This meal is not currently available');
        }

        return meal;
    }

    /**
     * Get meal ingredients scaled for specific servings
     */
    static async getMealIngredientsScaled(mealId: string, servings: number = 4) {
        const meal = await this.getMealById(mealId);

        if (servings <= 0) {
            throw new BadRequestError('Servings must be greater than 0');
        }

        const scalingFactor = servings / meal.servings;

        const scaledIngredients = meal.mealIngredients.map(ingredient => ({
            ...ingredient.toJSON(),
            quantity: Math.round((ingredient.quantity * scalingFactor) * 100) / 100, // Round to 2 decimal places
            estimatedPrice: ingredient.estimatedPrice ?
                Math.round((ingredient.estimatedPrice * scalingFactor) * 100) / 100 : null,
        }));

        return {
            meal: {
                ...meal.toJSON(),
                servings,
                scalingFactor,
            },
            ingredients: scaledIngredients,
            totalEstimatedCost: scaledIngredients.reduce((sum, ing) =>
                sum + (ing.estimatedPrice || 0), 0),
        };
    }

    /**
     * Convert meal ingredients to shopping list items
     */
    static async convertMealToShoppingListItems(mealId: string, servings: number = 4) {
        const { ingredients } = await this.getMealIngredientsScaled(mealId, servings);

        return ingredients.map(ingredient => ({
            name: ingredient.ingredientName,
            quantity: ingredient.quantity,
            unit: ingredient.unit,
            notes: ingredient.notes,
            estimatedPrice: ingredient.estimatedPrice,
            productId: ingredient.productId,
            status: 'pending' as const,
        }));
    }

    /**
     * Search meals by name or ingredients
     */
    static async searchMeals(query: string, limit: number = 10) {
        if (!query || query.trim().length < 2) {
            throw new BadRequestError('Search query must be at least 2 characters long');
        }

        const searchTerm = `%${query.toLowerCase()}%`;

        const meals = await Meal.findAll({
            where: {
                isActive: true,
                [Op.or]: [
                    { name: { [Op.iLike]: searchTerm } },
                    { description: { [Op.iLike]: searchTerm } },
                    { tags: { [Op.overlap]: [query.toLowerCase()] } },
                ],
            },
            include: [
                {
                    model: MealIngredient,
                    as: 'mealIngredients',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'price', 'images'],
                            required: false,
                        },
                    ],
                    order: [['sortOrder', 'ASC']],
                },
            ],
            order: [
                ['isPopular', 'DESC'],
                ['name', 'ASC'],
            ],
            limit,
        });

        return meals;
    }

    /**
     * Get meal categories
     */
    static async getMealCategories() {
        const categories = await Meal.findAll({
            attributes: ['category'],
            where: {
                isActive: true,
                category: { [Op.ne]: null as any },
            } as any,
            group: ['category'],
        });

        return categories.map(cat => cat.category).filter(Boolean);
    }

    /**
     * Get popular meals
     */
    static async getPopularMeals(limit: number = 6) {
        const meals = await Meal.findAll({
            where: {
                isActive: true,
                isPopular: true,
            },
            include: [
                {
                    model: MealIngredient,
                    as: 'mealIngredients',
                    attributes: ['id', 'ingredientName', 'quantity', 'unit'],
                    separate: true,
                    order: [['sortOrder', 'ASC']],
                },
            ],
            order: [
                ['sortOrder', 'ASC'],
                ['createdAt', 'DESC'],
            ],
            limit,
        });

        return meals;
    }

    /**
     * Create a new meal (admin only)
     */
    static async createMeal(mealData: IMeal, ingredients: IMealIngredient[]) {
        const meal = await Meal.create(mealData as any);

        if (ingredients && ingredients.length > 0) {
            const mealIngredients = ingredients.map(ingredient => ({
                ...ingredient,
                mealId: meal.id,
            }));

            await MealIngredient.bulkCreate(mealIngredients as any);
        }

        return this.getMealById(meal.id);
    }

    /**
     * Update meal (admin only)
     */
    static async updateMeal(id: string, mealData: Partial<IMeal>) {
        const meal = await Meal.findByPk(id);

        if (!meal) {
            throw new NotFoundError('Meal not found');
        }

        await meal.update(mealData);
        return this.getMealById(id);
    }

    /**
     * Delete meal (admin only)
     */
    static async deleteMeal(id: string) {
        const meal = await Meal.findByPk(id);

        if (!meal) {
            throw new NotFoundError('Meal not found');
        }

        // Soft delete by setting isActive to false
        await meal.update({ isActive: false });
        return meal;
    }
}