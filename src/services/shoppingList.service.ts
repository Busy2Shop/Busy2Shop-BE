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
import AgentService from './agent.service';

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
        queryData?: IViewShoppingListsQuery,
    ): Promise<{ lists: ShoppingList[]; count: number; totalPages?: number }> {
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

    static async createShoppingList(
        listData: IShoppingList,
        items: Omit<IShoppingListItem, 'shoppingListId'>[] = [],
    ): Promise<ShoppingList> {
        // Validate required fields
        if (!listData.name || !listData.customerId) {
            throw new BadRequestError('Shopping list name and user ID are required');
        }

        // Enhanced duplicate prevention - check for existing lists with the same name
        const existingListsWithSameName = await ShoppingList.findAll({
            where: {
                customerId: listData.customerId,
                name: listData.name.trim(),
                status: {
                    [Op.ne]: 'cancelled', // Exclude cancelled lists from duplicate check
                },
            },
        });

        let finalListName = listData.name.trim();
        
        if (existingListsWithSameName.length > 0) {
            // Check if there are any draft lists with the same name - remove them to prevent duplication
            const draftDuplicates = existingListsWithSameName.filter(list => list.status === 'draft');
            
            if (draftDuplicates.length > 0) {
                console.log(`Found ${draftDuplicates.length} draft list(s) with same name. Removing duplicates...`);
                
                await Database.transaction(async (transaction: Transaction) => {
                    for (const draftList of draftDuplicates) {
                        // Delete items first
                        await ShoppingListItem.destroy({
                            where: { shoppingListId: draftList.id },
                            transaction,
                        });
                        // Then delete the list
                        await draftList.destroy({ transaction });
                    }
                });
            } else {
                // If non-draft lists exist with same name, create unique name
                const timestamp = new Date().toISOString().slice(-13, -8);
                finalListName = `${listData.name.trim()} (${timestamp})`;
                console.log(`Creating list with unique name: "${finalListName}"`);
            }
        }

        // Use a transaction to ensure all operations succeed or fail together
        return await Database.transaction(async (transaction: Transaction) => {
            // Create the shopping list with final name
            const newList = await ShoppingList.create({ 
                ...listData, 
                name: finalListName,
                // Set category based on name patterns
                category: listData.category || this.inferCategory(finalListName),
            }, { transaction });

            // Add items if provided
            if (items.length > 0) {
                for (const item of items) {
                    await ShoppingListItem.create(
                        {
                            ...item,
                            shoppingListId: newList.id,
                        },
                        { transaction },
                    );
                }
            }

            // Return the newly created list with its items
            return (await ShoppingList.findByPk(newList.id, {
                include: [
                    {
                        model: ShoppingListItem,
                        as: 'items',
                    },
                ],
                transaction,
            })) as ShoppingList;
        });
    }

    static async viewUserShoppingLists(
        customerId: string,
        queryData?: IViewShoppingListsQuery,
    ): Promise<{ lists: ShoppingList[]; count: number; totalPages?: number; listsByMarket?: Record<string, ShoppingList[]>; specialLists?: { todaysLists: ShoppingList[]; mealLists: ShoppingList[] } }> {
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

        // Get paginated results
        const result = await this.executePaginatedListQuery(queryOptions, queryData);
        
        // Organize lists by market for better frontend display
        const listsByMarket: Record<string, ShoppingList[]> = {};
        const todaysLists: ShoppingList[] = [];
        const mealLists: ShoppingList[] = [];
        
        result.lists.forEach(list => {
            // Check if it's a Today's Shopping List
            if (list.name.includes('Today\'s Collection') || list.category === 'todays_collection') {
                todaysLists.push(list);
            }
            // Check if it's a Meal Ingredients list
            else if (list.name.includes('servings') || list.category === 'meal_ingredients') {
                mealLists.push(list);
            }
            // Otherwise, organize by market
            else if (list.marketId) {
                const marketName = list.market?.name || 'Unknown Market';
                if (!listsByMarket[marketName]) {
                    listsByMarket[marketName] = [];
                }
                listsByMarket[marketName].push(list);
            } else {
                // Lists without a market go to a "General" category
                if (!listsByMarket['General']) {
                    listsByMarket['General'] = [];
                }
                listsByMarket['General'].push(list);
            }
        });
        
        return {
            ...result,
            listsByMarket,
            specialLists: {
                todaysLists,
                mealLists,
            },
        };
    }

    static async viewAgentAssignedLists(
        agentId: string,
        queryData?: IViewShoppingListsQuery,
    ): Promise<{ lists: ShoppingList[]; count: number; totalPages?: number }> {
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

    /**
     * Get a shopping list by ID
     */
    static async getShoppingList(id: string, transaction?: Transaction): Promise<ShoppingList> {
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
            transaction,
        });

        if (!list) {
            throw new NotFoundError('Shopping list not found');
        }

        return list;
    }

    static async updateShoppingList(
        id: string,
        customerId: string,
        updateData: Partial<IShoppingList>,
    ): Promise<ShoppingList> {
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

    static async addItemToList(
        listId: string,
        customerId: string,
        itemData: IShoppingListItem,
    ): Promise<ShoppingListItem> {
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

    static async updateListItem(
        listId: string,
        itemId: string,
        customerId: string,
        updateData: Partial<IShoppingListItem>,
    ): Promise<ShoppingListItem> {
        const list = await this.getShoppingList(listId);

        // Check if the user is the owner of the list
        if (list.customerId !== customerId) {
            throw new ForbiddenError('You are not authorized to modify this shopping list');
        }

        // Can only update items if the list is in draft or pending status
        const allowedListStatuses = ['draft', 'pending'];
        if (!allowedListStatuses.includes(list.status)) {
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

    static async removeItemFromList(
        listId: string,
        itemId: string,
        customerId: string,
    ): Promise<void> {
        const list = await this.getShoppingList(listId);

        // Check if the user is the owner of the list
        if (list.customerId !== customerId) {
            throw new ForbiddenError('You are not authorized to modify this shopping list');
        }

        // Can only remove items if the list is in draft status
        const allowedListStatuses = ['draft', 'pending'];
        if (!allowedListStatuses.includes(list.status)) {
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

    /**
     * Update shopping list total calculation to include user-provided prices
     */
    private static async updateShoppingListTotal(listId: string): Promise<void> {
        const items = await ShoppingListItem.findAll({
            where: { shoppingListId: listId },
        });

        // Calculate new total using estimated price or user-provided price
        let estimatedTotal = 0;
        for (const item of items) {
            const priceToUse = item.estimatedPrice || item.userProvidedPrice || 0;
            estimatedTotal += priceToUse * (item.quantity || 1);
        }

        // Update the shopping list
        await ShoppingList.update({ estimatedTotal }, { where: { id: listId } });
    }

    static async submitShoppingList(id: string, customerId: string): Promise<ShoppingList> {
        const list = await this.getShoppingList(id);

        // Check if the user is the owner of the list
        if (list.customerId !== customerId) {
            throw new ForbiddenError('You are not authorized to submit this shopping list');
        }

        // Can only submit lists in draft status
        const allowedListStatuses = ['draft', 'pending'];
        if (!allowedListStatuses.includes(list.status)) {
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

    static async createOrderFromShoppingList(
        listId: string,
        customerId: string,
        orderData: Partial<IOrder>,
    ): Promise<Order> {
        const list = await this.getShoppingList(listId);

        // Check if the user is the owner of the list
        if (list.customerId !== customerId) {
            throw new ForbiddenError(
                'You are not authorized to create an order from this shopping list',
            );
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
        return await Database.transaction(async (transaction: Transaction) => {
            const list = await this.getShoppingList(listId, transaction);

            // Can only assign agents to pending lists
            if (list.status !== 'pending') {
                throw new BadRequestError('Can only assign agents to pending shopping lists');
            }

            // Make sure the agent exists
            const agent = await User.findByPk(agentId, { transaction });
            if (!agent) {
                throw new NotFoundError('Agent not found');
            }

            // Make sure the agent is actually an agent
            if (agent.status.userType !== 'agent') {
                throw new BadRequestError('Selected user is not a agent');
            }

            // Update the agent and status
            await list.update(
                {
                    agentId: agentId,
                    status: 'accepted',
                },
                { transaction },
            );

            // Update agent status to busy
            await AgentService.setAgentBusy(agentId, listId, transaction);

            return await this.getShoppingList(listId, transaction);
        });
    }

    static async updateListStatus(
        listId: string,
        customerId: string,
        status: 'draft' | 'pending' | 'accepted' | 'processing' | 'completed' | 'cancelled',
    ): Promise<ShoppingList> {
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
                throw new ForbiddenError(
                    'Agents can only update to processing or completed status',
                );
            }
        } else if (list.customerId === customerId) {
            // List owners can cancel or modify their own lists
            if (!['cancelled', 'draft'].includes(status)) {
                throw new ForbiddenError(
                    'You can only cancel or revert to draft your shopping lists',
                );
            }

            // Can't revert to draft if already accepted by an agent
            if (
                status === 'draft' &&
                ['accepted', 'processing', 'completed'].includes(list.status)
            ) {
                throw new BadRequestError(
                    'Cannot revert to draft a list that has been accepted or processed',
                );
            }
        } else {
            throw new ForbiddenError('You are not authorized to update this shopping list');
        }

        // Update the status
        await list.update({ status });

        return await this.getShoppingList(listId);
    }

    /**
     * Process payment for a shopping list
     * @param shoppingListId The ID of the shopping list to process payment for
     * @param paymentId The ID of the payment record
     */
    static async processShoppingListPayment(
        shoppingListId: string,
        paymentId: string,
    ): Promise<void> {
        const list = await this.getShoppingList(shoppingListId);

        if (!list) {
            throw new NotFoundError('Shopping list not found');
        }

        // Update shopping list status to indicate payment is processed
        await list.update({
            status: 'accepted',
            paymentId,
            paymentStatus: 'completed',
            paymentProcessedAt: new Date(),
        });
    }

    private static isValidStatusTransition(currentStatus: string, newStatus: string): boolean {
        const validTransitions: Record<string, string[]> = {
            draft: ['pending', 'cancelled'],
            pending: ['accepted', 'draft', 'cancelled'],
            accepted: ['processing', 'cancelled'],
            processing: ['completed', 'cancelled'],
            completed: [],
            cancelled: ['draft'],
        };

        return validTransitions[currentStatus]?.includes(newStatus) || false;
    }

    static async updateActualPrices(
        listId: string,
        agentId: string,
        items: { itemId: string; actualPrice: number }[],
    ): Promise<ShoppingList> {
        return await Database.transaction(async (transaction: Transaction) => {
            const list = await this.getShoppingList(listId, transaction);

            // Only the assigned agent can update actual prices
            if (list.agentId !== agentId) {
                throw new ForbiddenError('You are not assigned to this shopping list');
            }

            // Update each item's actual price
            for (const item of items) {
                await ShoppingListItem.update(
                    { actualPrice: item.actualPrice },
                    {
                        where: {
                            id: item.itemId,
                            shoppingListId: listId,
                        },
                        transaction,
                    },
                );
            }

            // Recalculate totals
            await this.updateShoppingListTotal(listId);

            return await this.getShoppingList(listId, transaction);
        });
    }

    /**
     * Copy a suggested list to a user's personal shopping list
     */
    static async copySuggestedListToPersonal(
        suggestedListId: string,
        customerId: string,
        marketId?: string,
    ): Promise<ShoppingList> {
        return await Database.transaction(async (transaction: Transaction) => {
            // Get the suggested list with items
            const suggestedList = await ShoppingList.findOne({
                where: {
                    id: suggestedListId,
                    listType: 'suggested',
                    isActive: true,
                },
                include: [
                    {
                        model: ShoppingListItem,
                        as: 'items',
                        include: [
                            {
                                model: Product,
                                as: 'product',
                                required: false,
                            },
                        ],
                    },
                ],
                transaction,
            });

            if (!suggestedList) {
                throw new NotFoundError('Suggested list not found or inactive');
            }

            // Create a new personal list based on the suggested list
            const personalList = await ShoppingList.create(
                {
                    name: suggestedList.name,
                    notes: `Copied from: ${suggestedList.name}`,
                    customerId,
                    marketId: marketId || suggestedList.marketId,
                    status: 'draft',
                    creatorType: 'user',
                    listType: 'personal',
                    sourceSuggestedListId: suggestedListId,
                    isReadOnly: false,
                },
                { transaction },
            );

            // Copy items from suggested list
            if (suggestedList.items && suggestedList.items.length > 0) {
                for (const originalItem of suggestedList.items) {
                    // Determine the price to use
                    let estimatedPrice = originalItem.estimatedPrice;
                    const userProvidedPrice = null;

                    // If the item has a product and the product has no price, leave estimatedPrice null
                    if (originalItem.product && originalItem.product.price === null) {
                        estimatedPrice = null;
                        // User will need to provide price later
                    }

                    await ShoppingListItem.create(
                        {
                            name: originalItem.name,
                            quantity: originalItem.quantity,
                            unit: originalItem.unit,
                            notes: originalItem.notes,
                            estimatedPrice,
                            userProvidedPrice,
                            productId: originalItem.productId,
                            shoppingListId: personalList.id,
                        },
                        { transaction },
                    );
                }
            }

            // Update estimated total
            await this.updateShoppingListTotal(personalList.id);

            // Return the created list with items
            return await ShoppingList.findByPk(personalList.id, {
                include: [
                    {
                        model: ShoppingListItem,
                        as: 'items',
                        include: [
                            {
                                model: Product,
                                as: 'product',
                                required: false,
                            },
                        ],
                    },
                    {
                        model: Market,
                        as: 'market',
                        attributes: ['id', 'name', 'marketType', 'address'],
                    },
                ],
                transaction,
            }) as ShoppingList;
        });
    }

    /**
     * Get all suggested lists for users to browse
     */
    static async getSuggestedLists(
        queryData?: IViewShoppingListsQuery & { category?: string; popular?: boolean },
    ): Promise<{ lists: ShoppingList[]; count: number; totalPages?: number }> {
        const { category, popular } = queryData || {};

        const where: Record<string, unknown> = {
            listType: 'suggested',
            isActive: true,
        };

        if (category) {
            where.category = category;
        }

        if (popular !== undefined) {
            where.isPopular = popular;
        }

        const queryOptions: FindAndCountOptions<ShoppingList> = {
            where,
            include: [
                {
                    model: ShoppingListItem,
                    as: 'items',
                    include: [
                        {
                            model: Product,
                            as: 'product',
                            required: false,
                        },
                    ],
                },
                {
                    model: Market,
                    as: 'market',
                    attributes: ['id', 'name', 'marketType', 'address'],
                    required: false,
                },
            ],
            order: [
                ['isPopular', 'DESC'],
                ['sortOrder', 'ASC'],
                ['createdAt', 'DESC'],
            ],
        };

        return this.executePaginatedListQuery(queryOptions, queryData);
    }

    /**
     * Enhanced add item to list with user price support
     */
    static async addItemToListWithPrice(
        listId: string,
        customerId: string,
        itemData: IShoppingListItem & { userProvidedPrice?: number },
    ): Promise<ShoppingListItem> {
        const list = await this.getShoppingList(listId);

        // Check if the user is the owner of the list
        if (list.customerId !== customerId) {
            throw new ForbiddenError('You are not authorized to modify this shopping list');
        }

        // Can only add items if the list is in draft status
        const allowedListStatuses = ['draft', 'pending'];
        if (!allowedListStatuses.includes(list.status)) {
            throw new BadRequestError('Cannot add items to a submitted shopping list');
        }

        // Check if the list is read-only (system/suggested list)
        if (list.isReadOnly) {
            throw new BadRequestError('Cannot modify a read-only list');
        }

        let finalEstimatedPrice = itemData.estimatedPrice;
        let userProvidedPrice = itemData.userProvidedPrice || null;

        // If product ID is provided, get its information
        if (itemData.productId) {
            const product = await Product.findByPk(itemData.productId);
            if (!product) {
                throw new NotFoundError('Product not found');
            }

            // Use product information for the item
            itemData.name = product.name;

            // Handle pricing logic
            if (product.price !== null) {
                // Product has a price, use it
                finalEstimatedPrice = product.discountPrice || product.price;
                userProvidedPrice = null; // Clear user provided price
            } else {
                // Product has no price, require user to provide one
                if (!itemData.userProvidedPrice) {
                    throw new BadRequestError(
                        'This product has no preset price. Please provide your expected price.',
                    );
                }
                finalEstimatedPrice = null;
                userProvidedPrice = itemData.userProvidedPrice;
            }
        }

        const newItem = await ShoppingListItem.create({
            ...itemData,
            estimatedPrice: finalEstimatedPrice,
            userProvidedPrice,
            shoppingListId: listId,
        });

        // Update estimated total of the shopping list
        await this.updateShoppingListTotal(listId);

        return newItem;
    }

    /**
     * Infer category based on shopping list name
     */
    private static inferCategory(listName: string): string {
        const lowerName = listName.toLowerCase();
        
        if (lowerName.includes('today\'s collection') || lowerName.includes('today\'s shopping')) {
            return 'todays_collection';
        }
        
        if (lowerName.includes('servings') || lowerName.includes('ingredients') || lowerName.includes('recipe')) {
            return 'meal_ingredients';
        }
        
        if (lowerName.includes('weekly') || lowerName.includes('monthly')) {
            return 'recurring';
        }
        
        if (lowerName.includes('grocery') || lowerName.includes('groceries')) {
            return 'grocery';
        }
        
        return 'general';
    }

    /**
     * Create a special Today's Shopping List
     */
    static async createTodaysShoppingList(
        customerId: string,
        marketId?: string
    ): Promise<ShoppingList> {
        const todayDate = new Date().toLocaleDateString();
        const listName = `Today's Collection - ${todayDate}`;
        
        return await this.createShoppingList({
            name: listName,
            customerId,
            marketId,
            category: 'todays_collection',
            notes: 'Items from Today\'s Collection',
            status: 'draft',
        }, []);
    }

    /**
     * Create a shopping list from meal ingredients
     */
    static async createMealShoppingList(
        customerId: string,
        mealName: string,
        servings: number,
        marketId?: string,
        ingredients: Omit<IShoppingListItem, 'shoppingListId'>[] = []
    ): Promise<ShoppingList> {
        const listName = `${mealName} - ${servings} servings`;
        
        return await this.createShoppingList({
            name: listName,
            customerId,
            marketId,
            category: 'meal_ingredients',
            notes: `Ingredients for ${mealName} (${servings} servings)`,
            status: 'draft',
        }, ingredients);
    }
}
