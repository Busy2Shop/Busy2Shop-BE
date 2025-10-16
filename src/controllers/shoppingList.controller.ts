/* eslint-disable @typescript-eslint/no-explicit-any */
import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import ShoppingListService from '../services/shoppingList.service';
import DiscountCampaignService from '../services/discountCampaign.service';
import SystemSettingsService from '../services/systemSettings.service';
import PriceCalculatorService from '../services/priceCalculator.service';
import ShipBubbleService from '../services/shipbubble.service';
import { SYSTEM_SETTING_KEYS } from '../models/systemSettings.model';
import { BadRequestError, ForbiddenError, NotFoundError } from '../utils/customErrors';
import ShoppingListItem from '../models/shoppingListItem.model';
import Product from '../models/product.model';
import UserAddress from '../models/userAddress.model';
import User from '../models/user.model';
import Market from '../models/market.model';
import ShipBubbleAddress from '../models/shipBubbleAddress.model';
import DeliveryQuote from '../models/deliveryQuote.model';
import moment from 'moment';

/**
 * Helper to normalize and validate Nigerian phone numbers
 * Converts various formats to international format (+234...)
 * Returns empty string if invalid
 */
const normalizePhoneNumber = (phone: string | null | undefined): string => {
    if (!phone) return '';

    // Remove all non-digit characters except leading +
    const cleaned = phone.replace(/[^\d+]/g, '');
    // Remove any + that's not at the start
    const normalized = cleaned.replace(/(?!^)\+/g, '');

    let result = '';
    // If starts with 0, replace with +234
    if (normalized.startsWith('0')) {
        result = '+234' + normalized.substring(1);
    }
    // If starts with 234, add +
    else if (normalized.startsWith('234')) {
        result = '+' + normalized;
    }
    // If already has +234, return as is
    else if (normalized.startsWith('+234')) {
        result = normalized;
    }
    // If has + but not +234, try to keep it
    else if (normalized.startsWith('+')) {
        result = normalized;
    }
    // Default: assume it's missing country code
    else {
        result = '+234' + normalized;
    }

    // Validate Nigerian phone: +234 + valid carrier prefix (70-91) + 8 digits
    // Valid prefixes: 070x, 080x, 081x, 090x, 091x, etc.
    const nigerianPhoneRegex = /^\+234[7-9][0-1]\d{8}$/;
    if (!nigerianPhoneRegex.test(result)) {
        return ''; // Return empty if invalid
    }

    return result;
};

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

        // Show appropriate lists based on context:
        // - draft: User can edit and create orders
        // - accepted: Payment confirmed, moved to order processing (not shown in shopping lists)
        // - processing: Currently being shopped (shown in orders, not shopping lists)
        // - completed/cancelled: Historical (viewed through order history)
        if (status) {
            // Allow specific status filtering if requested
            queryParams.status = status;
        } else {
            // Default to show only draft lists (user can edit and create orders from these)
            // Accepted/processing lists are shown in orders section, not shopping lists
            queryParams.status = ['draft'];
        }
        
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

        console.log('🛒 [CONTROLLER] Add Item Request Received:', {
            listId,
            userId: req.user.id,
            itemName: name,
            quantity: quantity || 1,
            unit,
            estimatedPrice,
            productId,
            timestamp: new Date().toISOString(),
        });

        if (!name) {
            console.error('❌ [CONTROLLER] Validation failed: Item name is required');
            throw new BadRequestError('Item name is required');
        }

        console.log('✅ [CONTROLLER] Validation passed, calling service layer...');

        const startTime = Date.now();
        const newItem = await ShoppingListService.addItemToList(listId, req.user.id, {
            name,
            quantity: quantity || 1,
            unit,
            notes,
            estimatedPrice,
            productId,
            shoppingListId: listId,
        });
        const duration = Date.now() - startTime;

        console.log('✅ [CONTROLLER] Item added successfully:', {
            itemId: newItem.id,
            itemName: newItem.name,
            listId,
            duration: `${duration}ms`,
            timestamp: new Date().toISOString(),
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

        // Check if the list is draft (ready for acceptance)
        if (list.status !== 'draft') {
            throw new BadRequestError('Can only accept draft shopping lists');
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
     * Update item with user-provided price (only for items without estimated price)
     */
    static async updateItemPrice(req: AuthenticatedRequest, res: Response) {
        const { id, itemId } = req.params;
        const { userProvidedPrice, quantity } = req.body;

        const updateData: Partial<any> = {};

        // Find the item to check if price editing is allowed
        const item = await ShoppingListItem.findOne({
            where: { id: itemId, shoppingListId: id },
            include: [{
                model: Product,
                as: 'product',
                attributes: ['price'],
            }],
        });

        if (!item) {
            throw new NotFoundError('Shopping list item not found');
        }

        // Check if user can edit price (only for items without product price or estimated price)
        const productPrice = item.product?.price || 0;
        const estimatedPrice = item.estimatedPrice || 0;

        if (productPrice > 0 || estimatedPrice > 0) {
            throw new BadRequestError('Cannot edit price for items that already have a catalog price or estimated price');
        }

        // Validate price if provided
        if (userProvidedPrice !== undefined) {
            const validation = PriceCalculatorService.validatePrice(userProvidedPrice);
            if (!validation.valid) {
                throw new BadRequestError(validation.error || 'Invalid price provided');
            }
            updateData.userProvidedPrice = PriceCalculatorService.roundPrice(userProvidedPrice);
        }

        if (quantity !== undefined) {
            if (quantity < 0) {
                throw new BadRequestError('Quantity cannot be negative');
            }
            updateData.quantity = quantity;
        }

        const updatedItem = await ShoppingListService.updateListItem(
            id,
            itemId,
            req.user.id,
            updateData,
        );

        // Add price source information to response
        const effectivePrice = PriceCalculatorService.getEffectivePrice(updatedItem);
        const priceSource = PriceCalculatorService.getPriceSource(updatedItem);

        res.status(200).json({
            status: 'success',
            message: 'Item updated successfully',
            data: {
                ...updatedItem.toJSON(),
                effectivePrice,
                priceSource,
            },
        });
    }

    /**
     * Create a Today's Shopping List
     */
    static async createTodaysShoppingList(req: AuthenticatedRequest, res: Response) {
        const { marketId } = req.body;

        const todaysList = await ShoppingListService.createTodaysShoppingList(
            req.user.id,
            marketId
        );

        res.status(201).json({
            status: 'success',
            message: 'Today\'s shopping list created successfully',
            data: todaysList,
        });
    }

    /**
     * Create shopping list from meal ingredients
     */
    static async createMealShoppingList(req: AuthenticatedRequest, res: Response) {
        const { mealName, servings, marketId, ingredients } = req.body;

        if (!mealName || !servings) {
            throw new BadRequestError('Meal name and servings are required');
        }

        const mealList = await ShoppingListService.createMealShoppingList(
            req.user.id,
            mealName,
            servings,
            marketId,
            ingredients || []
        );

        res.status(201).json({
            status: 'success',
            message: 'Meal shopping list created successfully',
            data: mealList,
        });
    }

    /**
     * Get shopping lists organized by market and category
     */
    static async getOrganizedShoppingLists(req: AuthenticatedRequest, res: Response) {
        const { page, size, status } = req.query;

        const queryParams: Record<string, unknown> = {};

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        if (status) {
            queryParams.status = status;
        } else {
            // Default to show only draft lists (user can edit and create orders from these)
            // Accepted/processing lists are shown in orders section, not shopping lists
            queryParams.status = ['draft'];
        }

        const organizedLists = await ShoppingListService.viewUserShoppingLists(
            req.user.id,
            queryParams,
        );

        res.status(200).json({
            status: 'success',
            message: 'Organized shopping lists retrieved successfully',
            data: organizedLists,
        });
    }

    /**
     * FAST: Get delivery quote only (skips full validation)
     * Use this when user changes address and you only need updated delivery fee
     * Much faster than full validateAndSyncList
     */
    static async getDeliveryQuote(req: AuthenticatedRequest, res: Response) {
        const { listId, userAddressId, subtotal } = req.body;

        if (!listId || !userAddressId || !subtotal) {
            throw new BadRequestError('Shopping list ID, user address ID, and subtotal are required');
        }

        try {
            console.log('🚀 [GET DELIVERY QUOTE] Fast delivery quote request:', {
                listId,
                userAddressId,
                subtotal,
                timestamp: new Date().toISOString(),
            });

            // Get shopping list (lightweight - just need market info)
            const shoppingList = await ShoppingListService.getShoppingList(listId);

            if (shoppingList.customerId !== req.user.id) {
                throw new ForbiddenError('You are not authorized to access this shopping list');
            }

            if (!shoppingList.marketId) {
                throw new BadRequestError('Shopping list must have a market selected');
            }

            // Get customer address with user info
            const userAddress = await UserAddress.findByPk(userAddressId, {
                include: [{ model: User, as: 'user' }],
            });

            if (!userAddress) {
                throw new NotFoundError('Customer address not found');
            }

            const user = (userAddress as any).user;
            if (!user) {
                throw new NotFoundError('User not found for address');
            }

            // Get market
            const market = await Market.findByPk(shoppingList.marketId);
            if (!market) {
                throw new NotFoundError('Market not found');
            }

            // Validate/cache receiver address (customer)
            const receiverHash = ShipBubbleService.calculateAddressHash(
                userAddress.address || userAddress.fullAddress,
                userAddress.city,
                userAddress.state
            );

            let receiverAddressCode: number;
            const cachedReceiver = await ShipBubbleAddress.findOne({
                where: { user_address_id: userAddressId, address_hash: receiverHash },
            });

            if (cachedReceiver) {
                receiverAddressCode = cachedReceiver.address_code;
            } else {
                const adminPhone = await SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.ADMIN_PHONE);
                const userPhone = normalizePhoneNumber(user.phone || userAddress.contactPhone) || adminPhone || '+2349012345678';

                const validated = await ShipBubbleService.validateAddress({
                    name: `${user.firstName} ${user.lastName}`.trim() || 'Customer',
                    email: user.email || 'customer@busy2shop.com',
                    phone: userPhone,
                    address: userAddress.fullAddress || userAddress.address,
                    city: userAddress.city,
                    state: userAddress.state,
                    country: userAddress.country || 'Nigeria',
                });

                await ShipBubbleAddress.create({
                    user_address_id: userAddressId,
                    address_code: validated.address_code,
                    formatted_address: validated.formatted_address,
                    latitude: validated.latitude,
                    longitude: validated.longitude,
                    address_hash: receiverHash,
                    validation_date: new Date(),
                });

                receiverAddressCode = validated.address_code;
            }

            // Validate/cache sender address (market)
            const marketLocation = typeof market.location === 'string'
                ? JSON.parse(market.location)
                : market.location;

            const senderHash = ShipBubbleService.calculateAddressHash(
                market.address,
                marketLocation.city || '',
                marketLocation.state || ''
            );

            let senderAddressCode: number;
            const cachedSender = await ShipBubbleAddress.findOne({
                where: { market_id: shoppingList.marketId, address_hash: senderHash },
            });

            if (cachedSender) {
                senderAddressCode = cachedSender.address_code;
            } else {
                const adminPhone = await SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.ADMIN_PHONE);
                const marketPhone = normalizePhoneNumber(market.phoneNumber) || adminPhone || '+2349012345678';

                const validated = await ShipBubbleService.validateAddress({
                    name: market.name || 'Market',
                    email: 'market@busy2shop.com',
                    phone: marketPhone,
                    address: market.address,
                    city: marketLocation.city || '',
                    state: marketLocation.state || '',
                    country: marketLocation.country || 'Nigeria',
                });

                await ShipBubbleAddress.create({
                    market_id: shoppingList.marketId,
                    address_code: validated.address_code,
                    formatted_address: validated.formatted_address,
                    latitude: validated.latitude,
                    longitude: validated.longitude,
                    address_hash: senderHash,
                    validation_date: new Date(),
                });

                senderAddressCode = validated.address_code;
            }

            // Calculate package weight and dimensions
            const totalWeight = ShipBubbleService.calculatePackageWeight(
                shoppingList.items.map(item => ({
                    quantity: item.quantity,
                    unit: item.unit || undefined,
                }))
            );

            const dimensions = ShipBubbleService.getPackageDimensions(totalWeight);

            // Calculate smart pickup date based on time constraints and market hours
            const pickup_date = ShipBubbleService.calculatePickupDate({
                // Pre-order quote - no shopping completed yet
                // Will respect 6 PM cutoff and market-specific hours
                marketOperatingHours: market.operatingHours,
            });

            // Fetch rates from ShipBubble
            const ratesResponse = await ShipBubbleService.fetchShippingRates({
                sender_address_code: senderAddressCode,
                reciever_address_code: receiverAddressCode,
                pickup_date,
                category_id: 0,
                package_items: shoppingList.items.map(item => ({
                    name: item.name || 'Grocery Item',
                    description: item.notes || 'Food item',
                    unit_weight: (item.quantity || 1).toString(),
                    unit_amount: ((item.estimatedPrice || 1000)).toString(),
                    quantity: (item.quantity || 1).toString(),
                })),
                package_dimension: dimensions,
                delivery_instructions: 'Handle with care - food items',
            });

            // Get courier selection settings
            const courierSettings = await SystemSettingsService.getSetting(
                SYSTEM_SETTING_KEYS.COURIER_SELECTION_SETTINGS
            );

            const settings = courierSettings || {
                highValueThreshold: 50000,
                mediumValueThreshold: 20000,
                maxDeliveryCostPercentage: 5,
                prioritizeSpeed: false,
                autoSelectRecommended: false,
            };

            // Get smart courier recommendation
            const recommendation = ShipBubbleService.recommendCourier({
                couriers: ratesResponse.couriers,
                fastestCourier: ratesResponse.fastest_courier,
                cheapestCourier: ratesResponse.cheapest_courier,
                orderTotal: subtotal,
                systemSettings: settings,
            });

            // Create or update delivery quote
            const quote = await DeliveryQuote.create({
                shopping_list_id: shoppingList.id,
                request_token: ratesResponse.request_token,
                sender_address_code: senderAddressCode,
                receiver_address_code: receiverAddressCode,
                category_id: ratesResponse.categoryId || 69709726,
                package_weight: totalWeight,
                package_dimensions: dimensions,
                couriers: ratesResponse.couriers,
                status: 'quoted',
                expires_at: moment().add(24, 'hours').toDate(),
            });

            // Get ShipBubble delivery fee from recommended courier (round UP to whole number)
            const shipBubbleDeliveryFee = Math.ceil(recommendation.recommended.amount || recommendation.recommended.total || 0);

            // Get delivery surcharge from system settings (ensure whole number)
            const deliverySurcharge = Math.ceil(await SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.DELIVERY_SURCHARGE) || 0);

            // Calculate final delivery fee (ShipBubble fee + system surcharge) - both already whole numbers
            const deliveryFee = shipBubbleDeliveryFee + deliverySurcharge;

            const deliveryQuoteData = {
                quoteId: quote.id,
                shipBubbleFee: shipBubbleDeliveryFee,
                systemSurcharge: deliverySurcharge,
                totalDeliveryFee: deliveryFee,
                recommendedCourier: {
                    courier: recommendation.recommended,
                    reason: recommendation.reason,
                    score: recommendation.score,
                },
                allCouriers: ratesResponse.couriers,
                fastestCourier: ratesResponse.fastest_courier,
                cheapestCourier: ratesResponse.cheapest_courier,
                expiresAt: quote.expires_at,
            };

            console.log('✅ [GET DELIVERY QUOTE] Quote generated successfully:', {
                deliveryFee,
                shipBubbleFee: shipBubbleDeliveryFee,
                surcharge: deliverySurcharge,
                courier: recommendation.recommended.courier_name,
            });

            res.status(200).json({
                status: 'success',
                message: 'Delivery quote generated successfully',
                data: {
                    deliveryFee,
                    deliveryQuote: deliveryQuoteData,
                    deliveryQuoteId: quote.id,
                },
            });

        } catch (error: any) {
            console.error('❌ [GET DELIVERY QUOTE] Error:', error);
            // Fall back to system default delivery fee
            const deliveryFee = await SystemSettingsService.getDeliveryFee();

            res.status(200).json({
                status: 'success',
                message: 'Using fallback delivery fee',
                data: {
                    deliveryFee,
                    deliveryQuote: null,
                    deliveryQuoteId: null,
                    error: error.message,
                },
            });
        }
    }

    /**
     * Validate and sync shopping list with server
     * OPTIMIZED: Only requires listId and optional userAddressId
     * Integrates ShipBubble delivery quotes when address is provided
     */
    static async validateAndSyncList(req: AuthenticatedRequest, res: Response) {
        const { listId, userAddressId } = req.body;

        if (!listId) {
            throw new BadRequestError('Shopping list ID is required');
        }

        try {
            console.log('📦 [VALIDATE & SYNC] Starting validation:', {
                listId,
                hasAddress: !!userAddressId,
                userId: req.user.id,
                timestamp: new Date().toISOString(),
            });

            // Get shopping list with items and market in one query
            const shoppingList = await ShoppingListService.getShoppingList(listId);

            if (shoppingList.customerId !== req.user.id) {
                throw new ForbiddenError('You are not authorized to access this shopping list');
            }

            if (!shoppingList.marketId) {
                throw new BadRequestError('Shopping list must have a market selected');
            }

            console.log('✅ [VALIDATE & SYNC] Shopping list retrieved:', {
                listId: shoppingList.id,
                itemCount: shoppingList.items?.length || 0,
                marketId: shoppingList.marketId,
                marketName: shoppingList.market?.name,
            });

            // Calculate subtotal from shopping list items
            const productIds = shoppingList.items.map((item: any) => item.productId).filter(Boolean);

            // First pass: Get raw discounts to identify product-specific discounts
            const rawDiscounts = await DiscountCampaignService.getAvailableDiscountsForUser({
                userId: req.user.id,
                orderAmount: 0, // We'll calculate this properly after price calculations
                marketId: shoppingList.marketId,
                productIds,
            });

            // Get product-specific discounts that should be auto-applied
            const productDiscounts = rawDiscounts.filter(discount =>
                discount.targetType === 'product' &&
                discount.isAutomaticApply &&
                discount.targetProductIds?.some((productId: string) =>
                    shoppingList.items.some((item: any) => item.productId === productId)
                )
            );

            console.log('💰 [VALIDATE & SYNC] Discounts retrieved:', {
                totalDiscounts: rawDiscounts.length,
                productDiscounts: productDiscounts.length,
            });

            // Calculate subtotal and apply product-specific discounts
            let subtotal = 0;
            const itemValidationResults: Array<{
                itemId: string;
                itemName: string;
                originalPrice: number;
                finalPrice: number;
                quantity: number;
                totalPrice: number;
                appliedDiscounts: any[];
                isAvailable: boolean;
            }> = [];

            for (const item of shoppingList.items) {
                // Use standardized price calculation
                const currentPrice = PriceCalculatorService.getEffectivePrice(item);

                // Apply product-specific discounts to the item price
                const itemProductDiscounts = productDiscounts.filter(discount =>
                    discount.targetProductIds?.includes(item.productId)
                );

                let discountedPrice = currentPrice;
                for (const discount of itemProductDiscounts) {
                    discountedPrice = PriceCalculatorService.applyDiscount(
                        discountedPrice,
                        discount.type as 'percentage' | 'fixed_amount',
                        discount.value,
                        discount.maximumDiscountAmount
                    );
                }

                subtotal += PriceCalculatorService.calculateItemTotal(
                    { ...item, discountedPrice },
                    item.quantity
                );

                itemValidationResults.push({
                    itemId: item.id,
                    itemName: item.name,
                    originalPrice: currentPrice,
                    finalPrice: discountedPrice,
                    quantity: item.quantity,
                    totalPrice: discountedPrice * item.quantity,
                    appliedDiscounts: itemProductDiscounts,
                    isAvailable: true,
                });
            }

            console.log('💵 [VALIDATE & SYNC] Subtotal calculated:', {
                subtotal,
                itemCount: shoppingList.items.length,
            });

            // Update the discount query with the calculated subtotal
            const updatedRawDiscounts = await DiscountCampaignService.getAvailableDiscountsForUser({
                userId: req.user.id,
                orderAmount: subtotal,
                marketId: shoppingList.marketId,
                productIds,
            });

            // Enhanced discount validation with system constraints
            const [MAX_DISCOUNT_PERCENTAGE, MIN_ORDER_FOR_DISCOUNT, MAX_SINGLE_DISCOUNT_AMOUNT] = await Promise.all([
                SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.MAXIMUM_DISCOUNT_PERCENTAGE),
                SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.MINIMUM_ORDER_FOR_DISCOUNT),
                SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.MAXIMUM_SINGLE_DISCOUNT_AMOUNT),
            ]);

            let secureDiscounts: any[] = [];

            // Validate against minimum order requirement
            const minOrderValidation = await SystemSettingsService.validateDiscountConstraints(subtotal, 0);
            if (!minOrderValidation.valid) {
                console.log('Order too small for discounts:', minOrderValidation.error);
                secureDiscounts = [];
            } else {
                // Filter discounts with enhanced security validation
                secureDiscounts = updatedRawDiscounts.filter(discount => {
                    // Calculate potential discount amount
                    let potentialDiscountAmount = 0;

                    if (discount.type === 'percentage') {
                        potentialDiscountAmount = PriceCalculatorService.applyDiscount(
                            subtotal, 'percentage', discount.value, discount.maximumDiscountAmount
                        ) - subtotal;
                        potentialDiscountAmount = Math.abs(potentialDiscountAmount);
                    } else if (discount.type === 'fixed_amount') {
                        potentialDiscountAmount = Math.min(discount.value, subtotal);
                    }

                    // Use centralized discount validation
                    const discountValidation = PriceCalculatorService.validateDiscountConstraints(
                        subtotal,
                        potentialDiscountAmount,
                        MAX_DISCOUNT_PERCENTAGE,
                        MAX_SINGLE_DISCOUNT_AMOUNT
                    );

                    if (!discountValidation.valid) {
                        return false;
                    }

                    // Additional business rules
                    if (discount.minimumOrderAmount && subtotal < discount.minimumOrderAmount * 1.1) return false;
                    if (discount.endDate && new Date(discount.endDate) < new Date()) return false;
                    if (discount.isActive === false) return false;

                    return true;
                });
            }

            // Categorize secure discounts by their application type
            const updatedProductDiscounts = secureDiscounts.filter(discount =>
                discount.targetType === 'product' &&
                discount.targetProductIds?.some((productId: string) =>
                    shoppingList.items.some((item: any) => item.productId === productId)
                )
            );

            const generalDiscounts = secureDiscounts.filter(discount => 
                ['market', 'global', 'first_order', 'referral', 'category', 'user'].includes(discount.targetType)
            );

            // Limit general discounts to maximum 3, prioritizing by potential savings and priority
            const MAX_GENERAL_DISCOUNTS = 3;
            const limitedGeneralDiscounts = generalDiscounts
                .sort((a, b) => {
                    // Calculate potential savings for sorting
                    const getSavings = (disc: any) => {
                        if (disc.type === 'percentage') {
                            const amount = (subtotal * disc.value) / 100;
                            return disc.maximumDiscountAmount ? Math.min(amount, disc.maximumDiscountAmount) : amount;
                        }
                        return disc.value;
                    };

                    // Sort by priority (higher first) then by savings (higher first)
                    if (a.priority !== b.priority) return b.priority - a.priority;
                    return getSavings(b) - getSavings(a);
                })
                .slice(0, MAX_GENERAL_DISCOUNTS);

            // Auto-apply product discounts (already applied in pricing)
            const autoAppliedProductDiscounts = updatedProductDiscounts.filter(discount => 
                discount.isAutomaticApply
            );

            // Final filtered discounts (only non-auto-applied general discounts)
            const availableDiscounts = [...limitedGeneralDiscounts];
            
            // Include product discounts that are not auto-applied
            const selectableProductDiscounts = updatedProductDiscounts.filter(discount => 
                !discount.isAutomaticApply
            );

            const categorizedDiscounts = {
                itemSpecific: selectableProductDiscounts,
                autoAppliedProducts: autoAppliedProductDiscounts,
                marketSpecific: limitedGeneralDiscounts.filter(discount => 
                    discount.targetType === 'market' && 
                    discount.targetMarketIds?.includes(shoppingList.marketId)
                ),
                globalDiscounts: limitedGeneralDiscounts.filter(discount => 
                    ['global', 'first_order', 'referral'].includes(discount.targetType)
                ),
                categorySpecific: limitedGeneralDiscounts.filter(discount => 
                    discount.targetType === 'category'
                ),
                userSpecific: limitedGeneralDiscounts.filter(discount => 
                    discount.targetType === 'user' && 
                    discount.targetUserIds?.includes(req.user.id)
                ),
            };

            // Calculate service fee using system settings
            const serviceFee = await SystemSettingsService.calculateServiceFee(subtotal);

            // Calculate auto-applied discount amount (already applied to item prices)
            let autoAppliedDiscountAmount = 0;
            for (const itemResult of itemValidationResults) {
                if (itemResult.finalPrice < itemResult.originalPrice) {
                    autoAppliedDiscountAmount += (itemResult.originalPrice - itemResult.finalPrice) * itemResult.quantity;
                }
            }

            console.log('🎁 [VALIDATE & SYNC] Auto-applied discounts calculated:', {
                autoAppliedDiscountAmount,
                productDiscountsCount: productDiscounts.length,
            });

            // ShipBubble Delivery Quote Integration
            let deliveryFee = 0;
            let deliveryQuoteId: string | null = null;
            let deliveryQuoteData: any = null;

            if (userAddressId) {
                console.log('📍 [VALIDATE & SYNC] User address provided, fetching ShipBubble quote...');

                try {
                    // Get customer address with user info
                    const userAddress = await UserAddress.findByPk(userAddressId, {
                        include: [{ model: User, as: 'user' }],
                    });

                    if (!userAddress) {
                        throw new NotFoundError('Customer address not found');
                    }

                    const user = (userAddress as any).user;
                    if (!user) {
                        throw new NotFoundError('User not found for address');
                    }

                    // Get market
                    const market = await Market.findByPk(shoppingList.marketId);
                    if (!market) {
                        throw new NotFoundError('Market not found');
                    }

                    // Validate/cache receiver address (customer)
                    const receiverHash = ShipBubbleService.calculateAddressHash(
                        userAddress.address || userAddress.fullAddress,
                        userAddress.city,
                        userAddress.state
                    );

                    let receiverAddressCode: number;
                    const cachedReceiver = await ShipBubbleAddress.findOne({
                        where: { user_address_id: userAddressId, address_hash: receiverHash },
                    });

                    if (cachedReceiver) {
                        console.log('✅ [ShipBubble] Using cached receiver address code:', cachedReceiver.address_code);
                        receiverAddressCode = cachedReceiver.address_code;
                    } else {
                        console.log('🔄 [ShipBubble] Validating receiver address with API');
                        const adminPhone = await SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.ADMIN_PHONE);
                        const userPhone = normalizePhoneNumber(user.phone || userAddress.contactPhone) || adminPhone || '+2348167291741';

                        const validated = await ShipBubbleService.validateAddress({
                            name: `${user.firstName} ${user.lastName}`.trim() || 'Customer',
                            email: user.email || 'customer@busy2shop.com',
                            phone: userPhone,
                            address: userAddress.fullAddress || userAddress.address,
                            city: userAddress.city,
                            state: userAddress.state,
                            country: userAddress.country || 'Nigeria',
                        });

                        await ShipBubbleAddress.create({
                            user_address_id: userAddressId,
                            address_code: validated.address_code,
                            formatted_address: validated.formatted_address,
                            latitude: validated.latitude,
                            longitude: validated.longitude,
                            address_hash: receiverHash,
                            validation_date: new Date(),
                        });

                        receiverAddressCode = validated.address_code;
                    }

                    // Validate/cache sender address (market)
                    const marketLocation = typeof market.location === 'string'
                        ? JSON.parse(market.location)
                        : market.location;

                    const senderHash = ShipBubbleService.calculateAddressHash(
                        market.address,
                        marketLocation.city || '',
                        marketLocation.state || ''
                    );

                    let senderAddressCode: number;
                    const cachedSender = await ShipBubbleAddress.findOne({
                        where: { market_id: shoppingList.marketId, address_hash: senderHash },
                    });

                    if (cachedSender) {
                        console.log('✅ [ShipBubble] Using cached sender address code:', cachedSender.address_code);
                        senderAddressCode = cachedSender.address_code;
                    } else {
                        console.log('🔄 [ShipBubble] Validating sender address with API');
                        const adminPhone = await SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.ADMIN_PHONE);
                        const marketPhone = normalizePhoneNumber(market.phoneNumber) || adminPhone || '+2348167291741';

                        const validated = await ShipBubbleService.validateAddress({
                            name: market.name || 'Market',
                            email: 'market@busy2shop.com',
                            phone: marketPhone,
                            address: market.address,
                            city: marketLocation.city || '',
                            state: marketLocation.state || '',
                            country: marketLocation.country || 'Nigeria',
                        });

                        await ShipBubbleAddress.create({
                            market_id: shoppingList.marketId,
                            address_code: validated.address_code,
                            formatted_address: validated.formatted_address,
                            latitude: validated.latitude,
                            longitude: validated.longitude,
                            address_hash: senderHash,
                            validation_date: new Date(),
                        });

                        senderAddressCode = validated.address_code;
                    }

                    // Calculate package weight and dimensions
                    const totalWeight = ShipBubbleService.calculatePackageWeight(
                        shoppingList.items.map(item => ({
                            quantity: item.quantity,
                            unit: item.unit || undefined,
                        }))
                    );

                    const dimensions = ShipBubbleService.getPackageDimensions(totalWeight);

                    console.log('📦 [ShipBubble] Package details calculated:', {
                        totalWeight,
                        dimensions,
                    });

                    // Calculate smart pickup date based on time constraints and market hours
                    const pickup_date = ShipBubbleService.calculatePickupDate({
                        // Pre-order validation - no shopping completed yet
                        // Will respect 6 PM cutoff and market-specific hours
                        marketOperatingHours: market.operatingHours,
                    });

                    // Fetch rates from ShipBubble
                    const ratesResponse = await ShipBubbleService.fetchShippingRates({
                        sender_address_code: senderAddressCode,
                        reciever_address_code: receiverAddressCode,
                        pickup_date,
                        category_id: 0, // Will be overridden by ShipBubbleService
                        package_items: shoppingList.items.map(item => ({
                            name: item.name || 'Grocery Item',
                            description: item.notes || 'Food item',
                            unit_weight: (item.quantity || 1).toString(),
                            unit_amount: ((itemValidationResults.find(r => r.itemId === item.id)?.finalPrice || item.estimatedPrice || 1000)).toString(),
                            quantity: (item.quantity || 1).toString(),
                        })),
                        package_dimension: dimensions,
                        delivery_instructions: 'Handle with care - food items',
                    });

                    console.log('✅ [ShipBubble] Rates fetched successfully:', {
                        couriersCount: ratesResponse.couriers.length,
                        fastestCourier: ratesResponse.fastest_courier?.courier_name,
                        cheapestCourier: ratesResponse.cheapest_courier?.courier_name,
                    });

                    // Get courier selection settings
                    const courierSettings = await SystemSettingsService.getSetting(
                        SYSTEM_SETTING_KEYS.COURIER_SELECTION_SETTINGS
                    );

                    const settings = courierSettings || {
                        highValueThreshold: 50000,
                        mediumValueThreshold: 20000,
                        maxDeliveryCostPercentage: 5,
                        prioritizeSpeed: false,
                        autoSelectRecommended: false,
                    };

                    // Get smart courier recommendation
                    const recommendation = ShipBubbleService.recommendCourier({
                        couriers: ratesResponse.couriers,
                        fastestCourier: ratesResponse.fastest_courier,
                        cheapestCourier: ratesResponse.cheapest_courier,
                        orderTotal: subtotal,
                        systemSettings: settings,
                    });

                    console.log('🎯 [ShipBubble] Recommended courier:', {
                        courier: recommendation.recommended.courier_name,
                        reason: recommendation.reason,
                        score: recommendation.score,
                    });

                    // Create or update delivery quote
                    const quote = await DeliveryQuote.create({
                        shopping_list_id: shoppingList.id,
                        request_token: ratesResponse.request_token,
                        sender_address_code: senderAddressCode,
                        receiver_address_code: receiverAddressCode,
                        category_id: ratesResponse.categoryId || 69709726,
                        package_weight: totalWeight,
                        package_dimensions: dimensions,
                        couriers: ratesResponse.couriers,
                        status: 'quoted',
                        expires_at: moment().add(24, 'hours').toDate(),
                    });

                    deliveryQuoteId = quote.id;

                    // Get ShipBubble delivery fee from recommended courier (round UP to whole number)
                    const shipBubbleDeliveryFee = Math.ceil(recommendation.recommended.amount || recommendation.recommended.total || 0);

                    // Get delivery surcharge from system settings (ensure whole number)
                    const deliverySurcharge = Math.ceil(await SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.DELIVERY_SURCHARGE) || 0);

                    // Calculate final delivery fee (ShipBubble fee + system surcharge) - both already whole numbers
                    deliveryFee = shipBubbleDeliveryFee + deliverySurcharge;

                    deliveryQuoteData = {
                        quoteId: quote.id,
                        shipBubbleFee: shipBubbleDeliveryFee,
                        systemSurcharge: deliverySurcharge,
                        totalDeliveryFee: deliveryFee,
                        recommendedCourier: {
                            courier: recommendation.recommended,
                            reason: recommendation.reason,
                            score: recommendation.score,
                        },
                        allCouriers: ratesResponse.couriers,
                        fastestCourier: ratesResponse.fastest_courier,
                        cheapestCourier: ratesResponse.cheapest_courier,
                        expiresAt: quote.expires_at,
                    };

                    console.log('💰 [ShipBubble] Delivery fee calculated:', {
                        shipBubbleFee: shipBubbleDeliveryFee,
                        surcharge: deliverySurcharge,
                        total: deliveryFee,
                    });

                } catch (shipBubbleError: any) {
                    console.error('❌ [ShipBubble] Error fetching delivery quote:', shipBubbleError);
                    // Fall back to system default delivery fee
                    deliveryFee = await SystemSettingsService.getDeliveryFee();
                    console.log('⚠️ [VALIDATE & SYNC] Using fallback delivery fee:', deliveryFee);
                }
            } else {
                // No address provided, use system default delivery fee
                deliveryFee = await SystemSettingsService.getDeliveryFee();
                console.log('📍 [VALIDATE & SYNC] No address provided, using default delivery fee:', deliveryFee);
            }

            // Calculate total
            const total = subtotal + serviceFee + deliveryFee - autoAppliedDiscountAmount;

            console.log('✅ [VALIDATE & SYNC] Validation completed successfully:', {
                subtotal,
                serviceFee,
                deliveryFee,
                autoAppliedDiscountAmount,
                total,
                hasDeliveryQuote: !!deliveryQuoteId,
            });

            res.status(200).json({
                status: 'success',
                message: 'Shopping list validated successfully',
                data: {
                    shoppingList,
                    itemValidations: itemValidationResults,
                    availableDiscounts, // Only selectable discounts (max 3 general)
                    categorizedDiscounts,
                    autoAppliedDiscountAmount,
                    subtotal,
                    serviceFee,
                    deliveryFee,
                    total,
                    deliveryQuote: deliveryQuoteData, // ShipBubble delivery quote data if address provided
                    deliveryQuoteId, // ID for reference in order creation
                    syncedAt: new Date().toISOString(),
                    discountSummary: {
                        totalSelectableDiscounts: availableDiscounts.length,
                        autoAppliedCount: productDiscounts.filter(d => d.isAutomaticApply).length,
                        itemSpecificCount: categorizedDiscounts.itemSpecific.length,
                        marketSpecificCount: categorizedDiscounts.marketSpecific.length,
                        globalDiscountCount: categorizedDiscounts.globalDiscounts.length,
                        categorySpecificCount: categorizedDiscounts.categorySpecific.length,
                        userSpecificCount: categorizedDiscounts.userSpecific.length,
                        hasAutoApplyDiscounts: autoAppliedDiscountAmount > 0,
                        hasCodeBasedDiscounts: availableDiscounts.some(d => d.code && !d.isAutomaticApply),
                        maxDiscountPercentage: MAX_DISCOUNT_PERCENTAGE,
                        maxSelectableDiscounts: 1, // Only 1 general discount can be selected
                        minOrderForDiscount: MIN_ORDER_FOR_DISCOUNT,
                    },
                    securityLimits: {
                        maxDiscountPercentage: MAX_DISCOUNT_PERCENTAGE,
                        maxDiscountAmount: subtotal * (MAX_DISCOUNT_PERCENTAGE / 100),
                        maxSingleDiscountAmount: MAX_SINGLE_DISCOUNT_AMOUNT,
                        maxGeneralDiscounts: MAX_GENERAL_DISCOUNTS,
                        minOrderAmount: MIN_ORDER_FOR_DISCOUNT,
                        enforced: true,
                    },
                },
            });
        } catch (error) {
            console.error('Error validating shopping list:', error);
            throw error;
        }
    }
}
