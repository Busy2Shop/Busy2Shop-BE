import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import MealService from '../services/meal.service';
import ShoppingListService from '../services/shoppingList.service';
import { BadRequestError } from '../utils/customErrors';

export default class MealController {
    /**
     * Get all meals with optional filtering
     */
    static async getMeals(req: Request, res: Response) {
        const {
            page,
            size,
            category,
            cuisine,
            difficulty,
            popular,
            tags,
        } = req.query;

        const queryParams = {
            page: page ? Number(page) : undefined,
            size: size ? Number(size) : undefined,
            category: category as string,
            cuisine: cuisine as string,
            difficulty: difficulty as string,
            popular: popular === 'true',
            tags: tags ? (tags as string).split(',') : undefined,
        };

        const result = await MealService.getMeals(queryParams);

        res.status(200).json({
            status: 'success',
            message: 'Meals retrieved successfully',
            data: {
                meals: result.meals,
                pagination: {
                    currentPage: result.currentPage,
                    totalPages: result.totalPages,
                    totalItems: result.count,
                    itemsPerPage: queryParams.size || 20,
                },
            },
        });
    }

    /**
     * Get a single meal by ID
     */
    static async getMealById(req: Request, res: Response) {
        const { id } = req.params;
        const meal = await MealService.getMealById(id);

        res.status(200).json({
            status: 'success',
            message: 'Meal retrieved successfully',
            data: meal,
        });
    }

    /**
     * Get meal ingredients scaled for servings
     */
    static async getMealIngredientsScaled(req: Request, res: Response) {
        const { id } = req.params;
        const { servings } = req.query;

        const servingsNum = servings ? Number(servings) : 4;

        if (servingsNum <= 0) {
            throw new BadRequestError('Servings must be greater than 0');
        }

        const result = await MealService.getMealIngredientsScaled(id, servingsNum);

        res.status(200).json({
            status: 'success',
            message: 'Meal ingredients retrieved successfully',
            data: result,
        });
    }

    /**
     * Convert meal to shopping list items
     */
    static async convertMealToShoppingListItems(req: Request, res: Response) {
        const { id } = req.params;
        const { servings } = req.query;

        const servingsNum = servings ? Number(servings) : 4;
        const items = await MealService.convertMealToShoppingListItems(id, servingsNum);

        res.status(200).json({
            status: 'success',
            message: 'Meal converted to shopping list items successfully',
            data: {
                items,
                servings: servingsNum,
                totalItems: items.length,
            },
        });
    }

    /**
     * Search meals
     */
    static async searchMeals(req: Request, res: Response) {
        const { q, limit } = req.query;

        if (!q) {
            throw new BadRequestError('Search query is required');
        }

        const limitNum = limit ? Number(limit) : 10;
        const meals = await MealService.searchMeals(q as string, limitNum);

        res.status(200).json({
            status: 'success',
            message: 'Meals search completed successfully',
            data: {
                meals,
                count: meals.length,
                query: q,
            },
        });
    }

    /**
     * Get meal categories
     */
    static async getMealCategories(req: Request, res: Response) {
        const categories = await MealService.getMealCategories();

        res.status(200).json({
            status: 'success',
            message: 'Meal categories retrieved successfully',
            data: {
                categories,
                count: categories.length,
            },
        });
    }

    /**
     * Get popular meals
     */
    static async getPopularMeals(req: Request, res: Response) {
        const { limit } = req.query;
        const limitNum = limit ? Number(limit) : 6;

        const meals = await MealService.getPopularMeals(limitNum);

        res.status(200).json({
            status: 'success',
            message: 'Popular meals retrieved successfully',
            data: {
                meals,
                count: meals.length,
            },
        });
    }

    /**
     * Create meal ingredients into shopping list
     */
    static async createShoppingListFromMeal(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { servings, listName, marketId } = req.body;

        const servingsNum = servings || 4;
        const items = await MealService.convertMealToShoppingListItems(id, servingsNum);

        const meal = await MealService.getMealById(id);
        const defaultListName = listName || `${meal.name} - ${servingsNum} servings`;

        const shoppingList = await ShoppingListService.createShoppingList(
            {
                name: defaultListName,
                notes: `Shopping list for ${meal.name} (${servingsNum} servings)`,
                marketId,
                customerId: req.user.id,
                status: 'draft',
            },
            items
        );

        res.status(201).json({
            status: 'success',
            message: 'Shopping list created from meal successfully',
            data: {
                shoppingList,
                meal: {
                    id: meal.id,
                    name: meal.name,
                    servings: servingsNum,
                },
                itemsCount: items.length,
            },
        });
    }
}