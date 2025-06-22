import { Router } from 'express';
import SeedController from '../controllers/seedController';

const router = Router();

/**
 * @swagger
 * /api/v0/seed/shopping-lists:
 *   get:
 *     summary: Seed shopping lists with real products
 *     description: Creates comprehensive shopping list data including suggested lists (read-only) and personal lists (editable) with real product links
 *     tags: [Seeding]
 *     responses:
 *       200:
 *         description: Shopping lists seeded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Shopping lists seeded successfully with real products!
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalLists:
 *                           type: number
 *                         totalItems:
 *                           type: number
 *                         suggestedLists:
 *                           type: number
 *                         personalLists:
 *                           type: number
 *                         linkedItems:
 *                           type: number
 *                         userPricedItems:
 *                           type: number
 *                         readOnlyLists:
 *                           type: number
 *                         editableLists:
 *                           type: number
 *                     details:
 *                       type: object
 *                       properties:
 *                         productsFound:
 *                           type: number
 *                         userFound:
 *                           type: string
 *                         marketsFound:
 *                           type: object
 *                     listsCreated:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           type:
 *                             type: string
 *                           readonly:
 *                             type: boolean
 *                           items:
 *                             type: number
 *                           total:
 *                             type: string
 *                           marketType:
 *                             type: string
 *       400:
 *         description: Missing users or products in system
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 message:
 *                   type: string
 *                   example: No users found in the system. Please create users first.
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 message:
 *                   type: string
 *                   example: Failed to seed shopping lists
 *                 error:
 *                   type: string
 */
router.get('/shopping-lists', SeedController.seedShoppingLists);

/**
 * @swagger
 * /api/v0/seed/shopping-lists:
 *   delete:
 *     summary: Clear all shopping lists
 *     description: Removes all shopping lists and items from the database
 *     tags: [Seeding]
 *     responses:
 *       200:
 *         description: Shopping lists cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: All shopping lists cleared successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     itemsDeleted:
 *                       type: number
 *                     listsDeleted:
 *                       type: number
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 message:
 *                   type: string
 *                   example: Failed to clear shopping lists
 *                 error:
 *                   type: string
 */
router.delete('/shopping-lists', SeedController.clearShoppingLists);

export default router; 