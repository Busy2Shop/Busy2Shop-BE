/* eslint-disable @typescript-eslint/no-explicit-any */
import { Response } from 'express';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import ShoppingListService from '../services/shoppingList.service';
import DiscountCampaignService from '../services/discountCampaign.service';
import SystemSettingsService from '../services/systemSettings.service';
import { SYSTEM_SETTING_KEYS } from '../models/systemSettings.model';
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

        // Only show draft and pending lists for regular shopping list view
        // Completed/cancelled lists are viewed through order sections
        // Processing lists are active orders, also viewed through order sections
        if (status) {
            // Allow specific status filtering if requested
            queryParams.status = status;
        } else {
            // Default to only show draft and pending lists
            queryParams.status = ['draft', 'pending'];
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

        if (status) queryParams.status = status;

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
     * Validate and sync local shopping list with server
     * This endpoint checks item prices, availability and provides update information
     */
    static async validateAndSyncList(req: AuthenticatedRequest, res: Response) {
        const { listData, marketId } = req.body;

        if (!listData || !listData.items || listData.items.length === 0) {
            throw new BadRequestError('Shopping list data with items is required');
        }

        try {
            // Get or create shopping list on server if needed
            let shoppingList;
            if (listData.id && !listData.isLocal) {
                // Get existing server list
                shoppingList = await ShoppingListService.getShoppingList(listData.id);
                if (shoppingList.customerId !== req.user.id) {
                    throw new ForbiddenError('You are not authorized to access this shopping list');
                }
            } else {
                // For local lists, create a minimal list record for validation context
                shoppingList = await ShoppingListService.createShoppingList(
                    {
                        name: listData.name || 'Shopping List',
                        notes: listData.notes,
                        marketId: marketId || listData.marketId,
                        customerId: req.user.id,
                        status: 'draft',
                    },
                    listData.items || [] // Save items if this is a local list being synced
                );
            }

            // First pass: Get raw discounts to identify product-specific discounts
            const rawDiscounts = await DiscountCampaignService.getAvailableDiscountsForUser({
                userId: req.user.id,
                orderAmount: 0, // We'll calculate this properly after price corrections
                marketId: shoppingList.marketId,
                productIds: listData.items.map((item: any) => item.productId).filter(Boolean),
            });

            // Get product-specific discounts that should be auto-applied
            const productDiscounts = rawDiscounts.filter(discount => 
                discount.targetType === 'product' && 
                discount.isAutomaticApply &&
                discount.targetProductIds?.some((productId: string) => 
                    listData.items.some((item: any) => item.productId === productId)
                )
            );

            // Validate items without saving them
            const itemValidationResults = [];
            const priceCorrections = [];
            let subtotal = 0;

            for (const item of listData.items) {
                const currentPrice = item.userSetPrice || item.estimatedPrice || 0;
                
                // Apply product-specific discounts to the item price
                const itemProductDiscounts = productDiscounts.filter(discount => 
                    discount.targetProductIds?.includes(item.productId)
                );
                
                let discountedPrice = currentPrice;
                for (const discount of itemProductDiscounts) {
                    if (discount.type === 'percentage') {
                        const discountAmount = (currentPrice * discount.value) / 100;
                        const maxDiscount = discount.maximumDiscountAmount ? 
                            Math.min(discountAmount, discount.maximumDiscountAmount) : discountAmount;
                        discountedPrice = Math.max(0, discountedPrice - maxDiscount);
                    } else if (discount.type === 'fixed_amount') {
                        discountedPrice = Math.max(0, discountedPrice - discount.value);
                    }
                }
                
                subtotal += discountedPrice * item.quantity;

                const validationResult: {
                    originalItem: any;
                    isAvailable: boolean;
                    priceCorrection: number | null;
                    suggestedPrice: number | null;
                    warnings: string[];
                    appliedDiscounts: any[];
                    finalPrice: number;
                } = {
                    originalItem: item,
                    isAvailable: true,
                    priceCorrection: null,
                    suggestedPrice: null,
                    warnings: [],
                    appliedDiscounts: itemProductDiscounts,
                    finalPrice: discountedPrice,
                };

                // Price validation logic - check against market prices or business rules
                if (currentPrice > 0) {
                    // Simple price validation - in a real app, you'd check against market prices
                    if (currentPrice < 50) {
                        validationResult.warnings.push('Price seems unusually low');
                        validationResult.suggestedPrice = Math.max(100, currentPrice * 2);
                    } else if (currentPrice > 10000) {
                        validationResult.warnings.push('Price seems unusually high');
                        validationResult.suggestedPrice = Math.min(5000, currentPrice * 0.7);
                    }
                } else {
                    validationResult.warnings.push('No price provided - using estimated price');
                    validationResult.suggestedPrice = Math.floor(Math.random() * 2000) + 500;
                }

                itemValidationResults.push(validationResult);

                // Create price correction if there's a suggested price or product discount applied
                if (validationResult.suggestedPrice !== null) {
                    priceCorrections.push({
                        itemId: item.id || item.name,
                        itemName: item.name,
                        originalPrice: currentPrice,
                        correctedPrice: validationResult.suggestedPrice,
                        reason: validationResult.warnings.join(', ') || 'Price adjustment',
                        type: 'suggestion',
                    });
                } else if (discountedPrice !== currentPrice) {
                    priceCorrections.push({
                        itemId: item.id || item.name,
                        itemName: item.name,
                        originalPrice: currentPrice,
                        correctedPrice: discountedPrice,
                        reason: `Product discount applied: ${itemProductDiscounts.map(d => d.name).join(', ')}`,
                        type: 'product_discount',
                    });
                }
            }

            // Update the discount query with the calculated subtotal
            const updatedRawDiscounts = await DiscountCampaignService.getAvailableDiscountsForUser({
                userId: req.user.id,
                orderAmount: subtotal,
                marketId: shoppingList.marketId,
                productIds: listData.items.map((item: any) => item.productId).filter(Boolean),
            });

            // Get system settings for validation and security filters
            const [MAX_DISCOUNT_PERCENTAGE, MIN_ORDER_FOR_DISCOUNT, MAX_SINGLE_DISCOUNT_AMOUNT] = await Promise.all([
                SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.MAXIMUM_DISCOUNT_PERCENTAGE),
                SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.MINIMUM_ORDER_FOR_DISCOUNT),
                SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.MAXIMUM_SINGLE_DISCOUNT_AMOUNT)
            ]);
            const MAX_DISCOUNT_AMOUNT = subtotal * (MAX_DISCOUNT_PERCENTAGE / 100);
            const MAX_GENERAL_DISCOUNTS = 3; // Maximum 3 general discounts to show

            let secureDiscounts: any[] = [];
            
            // Don't allow any discounts if order is too small
            if (subtotal < MIN_ORDER_FOR_DISCOUNT) {
                console.log('Order too small for discounts:', subtotal);
                secureDiscounts = [];
            } else {
                // Filter and validate discounts
                secureDiscounts = updatedRawDiscounts.filter(discount => {
                    // Calculate potential discount amount
                    let potentialDiscountAmount = 0;
                    
                    if (discount.type === 'percentage') {
                        potentialDiscountAmount = (subtotal * discount.value) / 100;
                        // Cap percentage discounts
                        if (discount.maximumDiscountAmount) {
                            potentialDiscountAmount = Math.min(potentialDiscountAmount, discount.maximumDiscountAmount);
                        }
                    } else if (discount.type === 'fixed_amount') {
                        potentialDiscountAmount = discount.value;
                    }

                    // Enhanced security checks
                    const discountPercentage = (potentialDiscountAmount / subtotal) * 100;
                    
                    // Filter out discounts that are too large
                    if (discountPercentage > MAX_DISCOUNT_PERCENTAGE) return false;
                    if (potentialDiscountAmount > MAX_DISCOUNT_AMOUNT) return false;
                    if (potentialDiscountAmount > MAX_SINGLE_DISCOUNT_AMOUNT) return false;
                    
                    // Filter out discounts where the discount amount is greater than 70% of the order
                    if (potentialDiscountAmount >= subtotal * 0.7) return false;
                    
                    // Check minimum order amount eligibility with additional buffer
                    if (discount.minimumOrderAmount && subtotal < discount.minimumOrderAmount * 1.1) return false;
                    
                    // Additional security: Cap fixed amount discounts to reasonable values
                    if (discount.type === 'fixed_amount') {
                        // More restrictive limits for fixed amount discounts
                        if (discount.value > 1000 && subtotal < discount.value * 3) return false;
                        if (discount.value > 2000) return false; // Hard cap at ₦2000
                    }
                    
                    // Security: Ensure percentage discounts don't exceed reasonable bounds
                    if (discount.type === 'percentage' && discount.value > 25) return false;
                    
                    // Security: Validate discount is not expired or inactive
                    if (discount.endDate && new Date(discount.endDate) < new Date()) return false;
                    if (discount.isActive === false) return false;
                    
                    return true;
                });
            }

            // Categorize secure discounts by their application type
            const updatedProductDiscounts = secureDiscounts.filter(discount => 
                discount.targetType === 'product' && 
                discount.targetProductIds?.some((productId: string) => 
                    listData.items.some((item: any) => item.productId === productId)
                )
            );

            const generalDiscounts = secureDiscounts.filter(discount => 
                ['market', 'global', 'first_order', 'referral', 'category', 'user'].includes(discount.targetType)
            );

            // Limit general discounts to maximum 3, prioritizing by potential savings and priority
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

            // Get the updated shopping list with items if they were saved
            const finalShoppingList = await ShoppingListService.getShoppingList(shoppingList.id);
            
            // Calculate service fee and delivery fee using system settings
            const serviceFee = await SystemSettingsService.calculateServiceFee(subtotal);
            const deliveryFee = await SystemSettingsService.getDeliveryFee();
            
            // Calculate auto-applied discount amounts (already applied to item prices)
            let autoAppliedDiscountAmount = 0;
            const autoAppliedDiscountDetails = [];

            // Calculate the total amount saved from product discounts
            for (const item of listData.items) {
                const originalPrice = item.userSetPrice || item.estimatedPrice || 0;
                const itemValidation = itemValidationResults.find(v => v.originalItem.id === item.id);
                
                if (itemValidation && itemValidation.finalPrice < originalPrice) {
                    const itemSavings = (originalPrice - itemValidation.finalPrice) * item.quantity;
                    autoAppliedDiscountAmount += itemSavings;
                }
            }

            // Create details for auto-applied discounts
            for (const discount of autoAppliedProductDiscounts) {
                // Find items that this discount applies to
                const applicableItems = listData.items.filter((item: any) => 
                    discount.targetProductIds?.includes(item.productId)
                );
                
                let discountAmount = 0;
                for (const item of applicableItems) {
                    const originalPrice = item.userSetPrice || item.estimatedPrice || 0;
                    const itemValidation = itemValidationResults.find(v => v.originalItem.id === item.id);
                    
                    if (itemValidation && itemValidation.finalPrice < originalPrice) {
                        discountAmount += (originalPrice - itemValidation.finalPrice) * item.quantity;
                    }
                }
                
                if (discountAmount > 0) {
                    autoAppliedDiscountDetails.push({
                        id: discount.id,
                        name: discount.name,
                        amount: discountAmount,
                        type: discount.type,
                        value: discount.value,
                    });
                }
            }

            res.status(200).json({
                status: 'success',
                message: 'Shopping list validated successfully',
                data: {
                    shoppingList: finalShoppingList,
                    validationResults: itemValidationResults,
                    priceCorrections,
                    availableDiscounts, // Only selectable discounts (max 3 general)
                    categorizedDiscounts,
                    autoAppliedDiscounts: autoAppliedDiscountDetails,
                    autoAppliedDiscountAmount,
                    subtotal,
                    serviceFee,
                    deliveryFee,
                    total: subtotal + serviceFee + deliveryFee - autoAppliedDiscountAmount,
                    syncedAt: new Date().toISOString(),
                    needsReview: itemValidationResults.some(r => r.warnings.length > 0),
                    discountSummary: {
                        totalSelectableDiscounts: availableDiscounts.length,
                        autoAppliedCount: autoAppliedDiscountDetails.length,
                        itemSpecificCount: categorizedDiscounts.itemSpecific.length,
                        marketSpecificCount: categorizedDiscounts.marketSpecific.length,
                        globalDiscountCount: categorizedDiscounts.globalDiscounts.length,
                        categorySpecificCount: categorizedDiscounts.categorySpecific.length,
                        userSpecificCount: categorizedDiscounts.userSpecific.length,
                        hasAutoApplyDiscounts: autoAppliedDiscountDetails.length > 0,
                        hasCodeBasedDiscounts: availableDiscounts.some(d => d.code && !d.isAutomaticApply),
                        maxDiscountPercentage: MAX_DISCOUNT_PERCENTAGE,
                        maxSelectableDiscounts: 1, // Only 1 general discount can be selected
                        minOrderForDiscount: MIN_ORDER_FOR_DISCOUNT,
                    },
                    securityLimits: {
                        maxDiscountPercentage: MAX_DISCOUNT_PERCENTAGE,
                        maxDiscountAmount: MAX_DISCOUNT_AMOUNT,
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
