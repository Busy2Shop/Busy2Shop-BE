import { Router } from 'express';
import ShoppingListController from '../controllers/shoppingList.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router = Router();

// All routes are protected
router.use(basicAuth('access'));

router.post('/', AuthenticatedController(ShoppingListController.createShoppingList));
router.get('/', AuthenticatedController(ShoppingListController.getUserShoppingLists));
router.get('/agent', AuthenticatedController(ShoppingListController.getAgentAssignedLists));
router.get('/:id', AuthenticatedController(ShoppingListController.getShoppingList));
router.put('/:id', AuthenticatedController(ShoppingListController.updateShoppingList));
router.delete('/:id', AuthenticatedController(ShoppingListController.deleteShoppingList));

// Item management
router.post('/:listId/items', AuthenticatedController(ShoppingListController.addItemToList));
router.put(
    '/:listId/items/:itemId',
    AuthenticatedController(ShoppingListController.updateListItem),
);
router.delete(
    '/:listId/items/:itemId',
    AuthenticatedController(ShoppingListController.removeItemFromList),
);

// Status management
router.post('/:id/submit', AuthenticatedController(ShoppingListController.submitShoppingList));
router.patch('/:id/status', AuthenticatedController(ShoppingListController.updateListStatus));
router.post('/:id/accept', AuthenticatedController(ShoppingListController.acceptShoppingList));
router.post('/:id/assign', AuthenticatedController(ShoppingListController.assignAgentToList));
router.post('/:id/prices', AuthenticatedController(ShoppingListController.updateActualPrices));

export default router;
