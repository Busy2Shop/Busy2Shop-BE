import { Transaction, Op, FindAndCountOptions } from 'sequelize';
import ShoppingList, { IShoppingList } from '../models/shoppingList.model';
import ShoppingListItem, { IShoppingListItem } from '../models/shoppingListItem.model';
import Market from '../models/market.model';
import Product from '../models/product.model';
import User from '../models/user.model';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/customErrors';
import Pagination, { IPaging } from '../utils/pagination';
import Order, { IOrder } from '../models/order.model';
import { Database } from '../models';

export interface IViewShoppingListsQuery {
    page?: number;
    size?: number;
    status?: string;
    marketId?: string;
}

export default class ShoppingListService {
    
    /**
     * Executes a paginated query for shopping lists and formats the results
     *
     * @param queryOptions - The query configuration for finding shopping lists
     * @param queryData - Pagination parameters
     * @returns Formatted query results with pagination metadata if applicable
     */
    private static async executePaginatedListQuery(
        queryOptions: FindAndCountOptions<ShoppingList>,
        queryData?: IViewShoppingListsQuery
    ): Promise<{ lists: ShoppingList[], count: number, totalPages?: number }> {
        const { page, size } = queryData || {};

        // Handle pagination
        if (page && size && page > 0 && size > 0) {
            const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);
            queryOptions.limit = limit ?? 0;
            queryOptions.offset = offset ?? 0;
        }

        const { rows: lists, count } = await ShoppingList.findAndCountAll(queryOptions);
    
        // Calculate pagination metadata if applicable
        if (page && size && lists.length > 0) {
            const totalPages = Pagination.estimateTotalPage({ count, limit: size } as IPaging);
            return { lists, count, ...totalPages };
        } else {
            return { lists, count };
        }
    }
    
    static async createShoppingList(listData: IShoppingList, items: IShoppingListItem[] = []): Promise<ShoppingList> {
        // Validate required fields
        if (!listData.name || !listData.customerId) {
            throw new BadRequestError('Shopping list name and user ID are required');
        }

        // Use a transaction to ensure all operations succeed or fail together
        return await Database.transaction(async (transaction: Transaction) => {
            // Create the shopping list
            const newList = await ShoppingList.create({ ...listData }, { transaction });

            // Add items if provided
            if (items.length > 0) {
                for (const item of items) {
                    await ShoppingListItem.create({
                        ...item,
                        shoppingListId: newList.id,
                    }, { transaction });
                }
            }

            // Return the newly created list with its items
            return await ShoppingList.findByPk(newList.id, {
                include: [
                    {
                        model: ShoppingListItem,
                        as: 'items',
                    },
                ],
                transaction,
            }) as ShoppingList;
        });
    }

    static async viewUserShoppingLists(customerId: string, queryData?: IViewShoppingListsQuery): Promise<{ lists: ShoppingList[], count: number, totalPages?: number }> {
        const { status, marketId } = queryData || {};

        const where: Record<string, unknown> = { customerId };

        // Filter by status if provided
        if (status) {
            where.status = status;
        }

        // Filter by market if provided
        if (marketId) {
            where.marketId = marketId;
        }

        // Basic query options
        const queryOptions: FindAndCountOptions<ShoppingList> = {
            where,
            include: [
                {
                    model: ShoppingListItem,
                    as: 'items',
                },
                {
                    model: Market,
                    as: 'market',
                    attributes: ['id', 'name', 'marketType', 'address'],
                },
                {
                    model: User,
                    as: 'agent',
                    attributes: ['id', 'firstName', 'lastName', 'email'],
                    required: false,
                },
            ],
            order: [['updatedAt', 'DESC']],
        };

        // Handle pagination
        return this.executePaginatedListQuery(queryOptions, queryData);

    }

    static async viewAgentAssignedLists(agentId: string, queryData?: IViewShoppingListsQuery): Promise<{ lists: ShoppingList[], count: number, totalPages?: number }> {
        const { status } = queryData || {};

        const where: Record<string, unknown> = {
            agentId,
            status: {
                [Op.ne]: 'draft', // Exclude lists in draft status
            },
        };

        // Filter by specific status if provided
        if (status) {
            where.status = status;
        }

        // Basic query options
        const queryOptions: FindAndCountOptions<ShoppingList> = {
            where,
            include: [
                {
                    model: ShoppingListItem,
                    as: 'items',
                },
                {
                    model: Market,
                    as: 'market',
                    attributes: ['id', 'name', 'marketType', 'address'],
                },
                {
                    model: User,
                    as: 'customer',
                    attributes: ['id', 'firstName', 'lastName', 'email'],
                },
            ],
            order: [['updatedAt', 'DESC']],
        };

        // Handle pagination
        return this.executePaginatedListQuery(queryOptions, queryData);
    }

    static async getShoppingList(id: string): Promise<ShoppingList> {
        const list = await ShoppingList.findByPk(id, {
            include: [
                {
                    model: ShoppingListItem,
                    as: 'items',
                },
                {
                    model: Market,
                    as: 'market',
                    attributes: ['id', 'name', 'marketType', 'address'],
                },
                {
                    model: User,
                    as: 'customer',
                    attributes: ['id', 'firstName', 'lastName', 'email'],
                },
                {
                    model: User,
                    as: 'agent',
                    attributes: ['id', 'firstName', 'lastName', 'email'],
                    required: false,
                },
            ],
        });

        if (!list) {
            throw new NotFoundError('Shopping list not found');
        }

        return list;
    }

    static async updateShoppingList(id: string, customerId: string, updateData: Partial<IShoppingList>): Promise<ShoppingList> {
        const list = await this.getShoppingList(id);

        // Check if the user is the owner of the list
        if (list.customerId !== customerId) {
            throw new ForbiddenError('You are not authorized to update this shopping list');
        }

        // Cannot update certain properties if the list is no longer in draft status
        if (list.status !== 'draft' && (updateData.marketId || updateData.name)) {
            throw new BadRequestError('Cannot modify market or name of a submitted shopping list');
        }

        await list.update(updateData);

        return await this.getShoppingList(id);
    }

    static async deleteShoppingList(id: string, customerId: string): Promise<void> {
        const list = await this.getShoppingList(id);

        // Check if the user is the owner of the list
        if (list.customerId !== customerId) {
            throw new ForbiddenError('You are not authorized to delete this shopping list');
        }

        // Can only delete lists in draft status
        if (list.status !== 'draft') {
            throw new BadRequestError('Cannot delete a shopping list that has been submitted');
        }

        await Database.transaction(async (transaction: Transaction) => {
            // Delete all items first
            await ShoppingListItem.destroy({
                where: { shoppingListId: id },
                transaction,
            });

            // Then delete the list
            await list.destroy({ transaction });
        });
    }

    static async addItemToList(listId: string, customerId: string, itemData: IShoppingListItem): Promise<ShoppingListItem> {
        const list = await this.getShoppingList(listId);

        // Check if the user is the owner of the list
        if (list.customerId !== customerId) {
            throw new ForbiddenError('You are not authorized to modify this shopping list');
        }

        // Can only add items if the list is in draft status
        if (list.status !== 'draft') {
            throw new BadRequestError('Cannot add items to a submitted shopping list');
        }

        // If product ID is provided, get its information
        if (itemData.productId) {
            const product = await Product.findByPk(itemData.productId);
            if (!product) {
                throw new NotFoundError('Product not found');
            }
            // Use product information for the item
            itemData.name = product.name;
            itemData.estimatedPrice = product.price;
        }

        const newItem = await ShoppingListItem.create({
            ...itemData,
            shoppingListId: listId,
        });

        // Update estimated total of the shopping lists
        await this.updateShoppingListTotal(listId);

        return newItem;
    }

    static async updateListItem(listId: string, itemId: string, customerId: string, updateData: Partial<IShoppingListItem>): Promise<ShoppingListItem> {
        const list = await this.getShoppingList(listId);

        // Check if the user is the owner of the list
        if (list.customerId !== customerId) {
            throw new ForbiddenError('You are not authorized to modify this shopping list');
        }

        // Can only update items if the list is in draft status
        if (list.status !== 'draft') {
            throw new BadRequestError('Cannot update items in a submitted shopping list');
        }

        const item = await ShoppingListItem.findOne({
            where: {
                id: itemId,
                shoppingListId: listId,
            },
        });

        if (!item) {
            throw new NotFoundError('Item not found in this shopping list');
        }

        await item.update(updateData);

        // Update estimated total of the shopping lists
        await this.updateShoppingListTotal(listId);

        return item;
    }

    static async removeItemFromList(listId: string, itemId: string, customerId: string): Promise<void> {
        const list = await this.getShoppingList(listId);

        // Check if the user is the owner of the list
        if (list.customerId !== customerId) {
            throw new ForbiddenError('You are not authorized to modify this shopping list');
        }

        // Can only remove items if the list is in draft status
        if (list.status !== 'draft') {
            throw new BadRequestError('Cannot remove items from a submitted shopping list');
        }

        const item = await ShoppingListItem.findOne({
            where: {
                id: itemId,
                shoppingListId: listId,
            },
        });

        if (!item) {
            throw new NotFoundError('Item not found in this shopping list');
        }

        await item.destroy();

        // Update estimated total of the shopping lists
        await this.updateShoppingListTotal(listId);
    }

    private static async updateShoppingListTotal(listId: string): Promise<void> {
        const items = await ShoppingListItem.findAll({
            where: { shoppingListId: listId },
        });

        // Calculate new total
        let estimatedTotal = 0;
        for (const item of items) {
            if (item.estimatedPrice) {
                estimatedTotal += item.estimatedPrice * (item.quantity || 1);
            }
        }

        // Update the shopping list
        await ShoppingList.update(
            { estimatedTotal },
            { where: { id: listId } }
        );
    }

    static async submitShoppingList(id: string, customerId: string): Promise<ShoppingList> {
        const list = await this.getShoppingList(id);

        // Check if the user is the owner of the list
        if (list.customerId !== customerId) {
            throw new ForbiddenError('You are not authorized to submit this shopping list');
        }

        // Can only submit lists in draft status
        if (list.status !== 'draft') {
            throw new BadRequestError('This shopping list has already been submitted');
        }

        // Make sure a market is selected
        if (!list.marketId) {
            throw new BadRequestError('Please select a market for this shopping list');
        }

        // Make sure there are items in the list
        const itemCount = await ShoppingListItem.count({
            where: { shoppingListId: id },
        });

        if (itemCount === 0) {
            throw new BadRequestError('Cannot submit an empty shopping list');
        }

        // Update the status to pending
        await list.update({ status: 'pending' });

        return await this.getShoppingList(id);
    }

    static async createOrderFromShoppingList(listId: string, customerId: string, orderData: Partial<IOrder>): Promise<Order> {
        const list = await this.getShoppingList(listId);

        // Check if the user is the owner of the list
        if (list.customerId !== customerId) {
            throw new ForbiddenError('You are not authorized to create an order from this shopping list');
        }

        // Can only create orders from pending lists
        if (list.status !== 'pending') {
            throw new BadRequestError('Can only create orders from pending shopping lists');
        }

        // Create the order
        const order = await Order.create({
            ...orderData,
            customerId: customerId,
            shoppingListId: listId,
            status: 'pending',
        } as IOrder);

        // Update the shopping list status
        await list.update({ status: 'processing' });

        return order;
    }

    static async assignAgentToList(listId: string, agentId: string): Promise<ShoppingList> {
        const list = await this.getShoppingList(listId);

        // Can only assign agents to pending lists
        if (list.status !== 'pending') {
            throw new BadRequestError('Can only assign agents to pending shopping lists');
        }

        // Make sure the agent exists
        const agent = await User.findByPk(agentId);
        if (!agent) {
            throw new NotFoundError('Agent not found');
        }

        // Make sure the agent is actually an agent
        if (agent.status.userType !== 'agent') {
            throw new BadRequestError('Selected user is not a agent');
        }

        // Update the agent and status
        await list.update({
            agentId: agentId,
            status: 'accepted',
        });

        return await this.getShoppingList(listId);
    }

    static async updateListStatus(listId: string, customerId: string, status: 'draft' | 'pending' | 'accepted' | 'processing' | 'completed' | 'cancelled'): Promise<ShoppingList> {
        const list = await this.getShoppingList(listId);

        // Validate the status transition
        if (!this.isValidStatusTransition(list.status, status)) {
            throw new BadRequestError(`Cannot change status from ${list.status} to ${status}`);
        }

        // Check permissions based on the user role
        const user = await User.findByPk(customerId);
        if (!user) {
            throw new NotFoundError('User not found');
        }

        if (user.status.userType === 'agent') {
            // Agents can only update lists assigned to them
            if (list.agentId !== customerId) {
                throw new ForbiddenError('You are not assigned to this shopping list');
            }

            // Agents can only set certain statuses
            if (!['processing', 'completed'].includes(status)) {
                throw new ForbiddenError('Agents can only update to processing or completed status');
            }
        } else if (list.customerId === customerId) {
            // List owners can cancel or modify their own lists
            if (!['cancelled', 'draft'].includes(status)) {
                throw new ForbiddenError('You can only cancel or revert to draft your shopping lists');
            }

            // Can't revert to draft if already accepted by an agent
            if (status === 'draft' && ['accepted', 'processing', 'completed'].includes(list.status)) {
                throw new BadRequestError('Cannot revert to draft a list that has been accepted or processed');
            }
        } else {
            throw new ForbiddenError('You are not authorized to update this shopping list');
        }

        // Update the status
        await list.update({ status });

        return await this.getShoppingList(listId);
    }

    private static isValidStatusTransition(currentStatus: string, newStatus: string): boolean {
        const validTransitions: Record<string, string[]> = {
            'draft': ['pending', 'cancelled'],
            'pending': ['accepted', 'draft', 'cancelled'],
            'accepted': ['processing', 'cancelled'],
            'processing': ['completed', 'cancelled'],
            'completed': [],
            'cancelled': ['draft'],
        };

        return validTransitions[currentStatus]?.includes(newStatus) || false;
    }

    static async updateActualPrices(listId: string, agentId: string, items: { itemId: string, actualPrice: number }[]): Promise<ShoppingList> {
        const list = await this.getShoppingList(listId);

        // Check if the agent is assigned to this list
        if (list.agentId !== agentId) {
            throw new ForbiddenError('You are not assigned to this shopping list');
        }

        // Can only update prices if the list is in accepted or processing status
        if (!['accepted', 'processing'].includes(list.status)) {
            throw new BadRequestError('Cannot update prices in the current list status');
        }

        // Update items one by one
        await Database.transaction(async (transaction: Transaction) => {
            for (const { itemId, actualPrice } of items) {
                const item = await ShoppingListItem.findOne({
                    where: {
                        id: itemId,
                        shoppingListId: listId,
                    },
                    transaction,
                });

                if (!item) {
                    throw new NotFoundError(`Item with ID ${itemId} not found in this shopping list`);
                }

                await item.update({ actualPrice }, { transaction });
            }
        });

        return await this.getShoppingList(listId);
    }
}