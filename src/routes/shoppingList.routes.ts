import { Router } from 'express';
import ShoppingListController from '../controllers/shoppingList.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router = Router();

// All routes are protected
router.use(basicAuth('access'));

// Suggested lists routes
router.get('/suggested', AuthenticatedController(ShoppingListController.getSuggestedLists));
router.post('/suggested/:id/copy', AuthenticatedController(ShoppingListController.copySuggestedList));

// Standard shopping list routes
router.post('/', AuthenticatedController(ShoppingListController.createShoppingList));
router.get('/', AuthenticatedController(ShoppingListController.getUserShoppingLists));
router.get('/organized', AuthenticatedController(ShoppingListController.getOrganizedShoppingLists));
router.get('/agent', AuthenticatedController(ShoppingListController.getAgentAssignedLists));

// Special shopping list creation routes
router.post('/todays-list', AuthenticatedController(ShoppingListController.createTodaysShoppingList));
router.post('/meal-list', AuthenticatedController(ShoppingListController.createMealShoppingList));
router.post('/validate-and-sync', AuthenticatedController(ShoppingListController.validateAndSyncList));
router.get('/:id', AuthenticatedController(ShoppingListController.getShoppingList));
router.put('/:id', AuthenticatedController(ShoppingListController.updateShoppingList));
router.delete('/:id', AuthenticatedController(ShoppingListController.deleteShoppingList));

// Enhanced item management with pricing support
router.post('/:listId/items', AuthenticatedController(ShoppingListController.addItemToList));
router.post('/:id/items/with-price', AuthenticatedController(ShoppingListController.addItemWithPrice));
router.put(
    '/:listId/items/:itemId',
    AuthenticatedController(ShoppingListController.updateListItem),
);
router.put(
    '/:id/items/:itemId/price',
    AuthenticatedController(ShoppingListController.updateItemPrice),
);
router.delete(
    '/:listId/items/:itemId',
    AuthenticatedController(ShoppingListController.removeItemFromList),
);

// Status management
router.post('/:id/submit', AuthenticatedController(ShoppingListController.submitShoppingList));
router.put('/:id/status', AuthenticatedController(ShoppingListController.updateListStatus));
router.post('/:id/accept', AuthenticatedController(ShoppingListController.acceptShoppingList));
router.post('/:id/assign', AuthenticatedController(ShoppingListController.assignAgentToList));
router.post('/:id/prices', AuthenticatedController(ShoppingListController.updateActualPrices));

export default router;
