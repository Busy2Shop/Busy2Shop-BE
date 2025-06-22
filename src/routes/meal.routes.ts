import { Router } from 'express';
import MealController from '../controllers/meal.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router = Router();

// Public routes (no auth required)
router.get('/', MealController.getMeals);
router.get('/search', MealController.searchMeals);
router.get('/categories', MealController.getMealCategories);
router.get('/popular', MealController.getPopularMeals);
router.get('/:id', MealController.getMealById);
router.get('/:id/ingredients', MealController.getMealIngredientsScaled);
router.get('/:id/shopping-items', MealController.convertMealToShoppingListItems);

// Protected routes (auth required)
router.use(basicAuth('access'));
router.post('/:id/create-shopping-list', AuthenticatedController(MealController.createShoppingListFromMeal));

export default router; 