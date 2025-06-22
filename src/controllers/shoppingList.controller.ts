/* eslint-disable @typescript-eslint/no-explicit-any */
import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import ShoppingListService from '../services/shoppingList.service';
import { BadRequestError, ForbiddenError } from '../utils/customErrors';

export default class ShoppingListController {
    static async createShoppingList(req: AuthenticatedRequest, res: Response) {
        const { name, notes, marketId, items } = req.body;

        if (!name) {
            throw new BadRequestError('Shopping list name is required');
        }

        const shoppingList = await ShoppingListService.createShoppingList(
            {
                name,
                notes,
                marketId,
                customerId: req.user.id,
                status: 'draft',
            },
            items || [],
        );

        res.status(201).json({
            status: 'success',
            message: 'Shopping list created successfully',
            data: shoppingList,
        });
    }

    static async getUserShoppingLists(req: AuthenticatedRequest, res: Response) {
        const { page, size, status, marketId } = req.query;

        const queryParams: Record<string, unknown> = {};

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (status) queryParams.status = status;
        if (marketId) queryParams.marketId = marketId;

        const shoppingLists = await ShoppingListService.viewUserShoppingLists(
            req.user.id,
            queryParams,
        );

        res.status(200).json({
            status: 'success',
            message: 'Shopping lists retrieved successfully',
            data: { ...shoppingLists },
        });
    }

    static async getAgentAssignedLists(req: AuthenticatedRequest, res: Response) {
        // Check if the user is an agent
        if (req.user.status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can access assigned shopping lists');
        }

        const { page, size, status } = req.query;

        const queryParams: Record<string, unknown> = {};

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (status) queryParams.status = status;

        const shoppingLists = await ShoppingListService.viewAgentAssignedLists(
            req.user.id,
            queryParams,
        );

        res.status(200).json({
            status: 'success',
            message: 'Assigned shopping lists retrieved successfully',
            data: { ...shoppingLists },
        });
    }

    static async getShoppingList(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;

        const shoppingList = await ShoppingListService.getShoppingList(id);

        // Check if the user is authorized to view this list
        if (shoppingList.customerId !== req.user.id && shoppingList.agentId !== req.user.id) {
            throw new ForbiddenError('You are not authorized to view this shopping list');
        }

        res.status(200).json({
            status: 'success',
            message: 'Shopping list retrieved successfully',
            data: shoppingList,
        });
    }

    static async updateShoppingList(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { name, notes, marketId } = req.body;

        // Prepare update data
        const updateData: Record<string, any> = {};
        if (name) updateData.name = name;
        if (notes !== undefined) updateData.notes = notes;
        if (marketId) updateData.marketId = marketId;

        const updatedList = await ShoppingListService.updateShoppingList(
            id,
            req.user.id,
            updateData,
        );

        res.status(200).json({
            status: 'success',
            message: 'Shopping list updated successfully',
            data: updatedList,
        });
    }

    static async deleteShoppingList(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;

        await ShoppingListService.deleteShoppingList(id, req.user.id);

        res.status(200).json({
            status: 'success',
            message: 'Shopping list deleted successfully',
            data: null,
        });
    }

    static async addItemToList(req: AuthenticatedRequest, res: Response) {
        const { listId } = req.params;
        const { name, quantity, unit, notes, estimatedPrice, productId } = req.body;

        if (!name) {
            throw new BadRequestError('Item name is required');
        }

        const newItem = await ShoppingListService.addItemToList(listId, req.user.id, {
            name,
            quantity: quantity || 1,
            unit,
            notes,
            estimatedPrice,
            productId,
            shoppingListId: listId,
        });

        res.status(201).json({
            status: 'success',
            message: 'Item added to shopping list successfully',
            data: newItem,
        });
    }

    static async updateListItem(req: AuthenticatedRequest, res: Response) {
        const { listId, itemId } = req.params;
        const { name, quantity, unit, notes, estimatedPrice } = req.body;

        // Prepare update data
        const updateData: Record<string, any> = {};
        if (name) updateData.name = name;
        if (quantity !== undefined) updateData.quantity = quantity;
        if (unit !== undefined) updateData.unit = unit;
        if (notes !== undefined) updateData.notes = notes;
        if (estimatedPrice !== undefined) updateData.estimatedPrice = estimatedPrice;

        const updatedItem = await ShoppingListService.updateListItem(
            listId,
            itemId,
            req.user.id,
            updateData,
        );

        res.status(200).json({
            status: 'success',
            message: 'Shopping list item updated successfully',
            data: updatedItem,
        });
    }

    static async removeItemFromList(req: AuthenticatedRequest, res: Response) {
        const { listId, itemId } = req.params;

        await ShoppingListService.removeItemFromList(listId, itemId, req.user.id);

        res.status(200).json({
            status: 'success',
            message: 'Item removed from shopping list successfully',
            data: null,
        });
    }

    static async submitShoppingList(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;

        const submittedList = await ShoppingListService.submitShoppingList(id, req.user.id);

        res.status(200).json({
            status: 'success',
            message: 'Shopping list submitted successfully',
            data: submittedList,
        });
    }

    static async updateListStatus(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
            throw new BadRequestError('Status is required');
        }

        const updatedList = await ShoppingListService.updateListStatus(id, req.user.id, status);

        res.status(200).json({
            status: 'success',
            message: 'Shopping list status updated successfully',
            data: updatedList,
        });
    }

    // Admin only
    static async assignAgentToList(req: AuthenticatedRequest, res: Response) {
        // Only admins can manually assign agents
        // if (req.user.status.userType !== 'admin') {
        //     throw new ForbiddenError('Only admins can manually assign agents');
        // }

        const { id } = req.params;
        const { agentId } = req.body;

        if (!agentId) {
            throw new BadRequestError('Agent ID is required');
        }

        const updatedList = await ShoppingListService.assignAgentToList(id, agentId);

        res.status(200).json({
            status: 'success',
            message: 'Agent assigned to shopping list successfully',
            data: updatedList,
        });
    }

    static async acceptShoppingList(req: AuthenticatedRequest, res: Response) {
        // Only agents can accept shopping lists
        if (req.user.status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can accept shopping lists');
        }

        const { id } = req.params;

        // Get the shopping list
        const list = await ShoppingListService.getShoppingList(id);

        // Check if the list is pending
        if (list.status !== 'pending') {
            throw new BadRequestError('Can only accept pending shopping lists');
        }

        // Assign the agent to the list
        const updatedList = await ShoppingListService.assignAgentToList(id, req.user.id);

        res.status(200).json({
            status: 'success',
            message: 'Shopping list accepted successfully',
            data: updatedList,
        });
    }

    static async updateActualPrices(req: AuthenticatedRequest, res: Response) {
        // Only agents can update actual prices
        if (req.user.status.userType !== 'agent') {
            throw new ForbiddenError('Only agents can update actual prices');
        }

        const { id } = req.params;
        const { items } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            throw new BadRequestError('Items with actual prices are required');
        }

        const updatedList = await ShoppingListService.updateActualPrices(id, req.user.id, items);

        res.status(200).json({
            status: 'success',
            message: 'Actual prices updated successfully',
            data: updatedList,
        });
    }

    /**
     * Get all suggested lists for users to browse
     */
    static async getSuggestedLists(req: AuthenticatedRequest, res: Response) {
        const { page = 1, size = 20, category, popular } = req.query;

        const result = await ShoppingListService.getSuggestedLists({
            page: Number(page),
            size: Number(size),
            category: category as string,
            popular: popular === 'true',
        });

        res.status(200).json({
            status: 'success',
            message: 'Suggested lists retrieved successfully',
            data: {
                lists: result.lists,
                pagination: {
                    currentPage: Number(page),
                    totalPages: result.totalPages,
                    totalItems: result.count,
                    itemsPerPage: Number(size),
                },
            },
        });
    }

    /**
     * Copy a suggested list to user's personal shopping list
     */
    static async copySuggestedList(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { marketId } = req.body;

        const personalList = await ShoppingListService.copySuggestedListToPersonal(
            id,
            req.user.id,
            marketId,
        );

        res.status(201).json({
            status: 'success',
            message: 'Suggested list copied to your shopping lists successfully',
            data: personalList,
        });
    }

    /**
     * Add item to shopping list with user-provided price support
     */
    static async addItemWithPrice(req: AuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { productId, name, quantity, unit, notes, userProvidedPrice } = req.body;

        if (!name) {
            throw new BadRequestError('Item name is required');
        }

        const newItem = await ShoppingListService.addItemToListWithPrice(id, req.user.id, {
            productId,
            name,
            quantity: quantity || 1,
            unit,
            notes,
            userProvidedPrice,
            shoppingListId: id,
        });

        res.status(201).json({
            status: 'success',
            message: 'Item added to shopping list successfully',
            data: newItem,
        });
    }

    /**
     * Update item with user-provided price
     */
    static async updateItemPrice(req: AuthenticatedRequest, res: Response) {
        const { id, itemId } = req.params;
        const { userProvidedPrice, quantity } = req.body;

        const updateData: Partial<any> = {};
        if (userProvidedPrice !== undefined) updateData.userProvidedPrice = userProvidedPrice;
        if (quantity !== undefined) updateData.quantity = quantity;

        const updatedItem = await ShoppingListService.updateListItem(
            id,
            itemId,
            req.user.id,
            updateData,
        );

        res.status(200).json({
            status: 'success',
            message: 'Item updated successfully',
            data: updatedItem,
        });
    }
}
