import { Router } from 'express';
import ShoppingListController from '../../controllers/shoppingList.controller';
import { AuthenticatedController, basicAuth } from '../../middlewares/authMiddleware';

const router = Router();

// All routes are protected and admin-only
router.use(basicAuth('access'));

// Basic CRUD operations for suggested lists (reusing existing controller)
router.post('/suggested', AuthenticatedController(ShoppingListController.createShoppingList));
router.get('/suggested', AuthenticatedController(ShoppingListController.getUserShoppingLists));
router.get('/suggested/:id', AuthenticatedController(ShoppingListController.getShoppingList));
router.put('/suggested/:id', AuthenticatedController(ShoppingListController.updateShoppingList));
router.delete('/suggested/:id', AuthenticatedController(ShoppingListController.deleteShoppingList));

// Item management for suggested lists
router.post('/suggested/:listId/items', AuthenticatedController(ShoppingListController.addItemToList));
router.put('/suggested/:listId/items/:itemId', AuthenticatedController(ShoppingListController.updateListItem));
router.delete('/suggested/:listId/items/:itemId', AuthenticatedController(ShoppingListController.removeItemFromList));

export default router; 