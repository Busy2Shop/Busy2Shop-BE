import { Request, Response } from 'express';
import ShoppingList from '../models/shoppingList.model';
import ShoppingListItem from '../models/shoppingListItem.model';
import User from '../models/user.model';
import Product from '../models/product.model';
import Market from '../models/market.model';
import MealSeeder from '../seeders/mealSeeder';
import { logger } from '../utils/logger';
import { Op } from 'sequelize';

export default class SeedController {
    /**
     * Seed shopping lists with real products
     * GET /api/v0/seed/shopping-lists
     */
    static async seedShoppingLists(req: Request, res: Response) {
        try {
            logger.info('🚀 Starting shopping list seeding via endpoint...');

            // Step 1: Clear existing data
            logger.info('🧹 Clearing existing shopping list data...');
            await ShoppingListItem.destroy({ where: {}, truncate: false });
            await ShoppingList.destroy({ where: {}, truncate: false });
            logger.info('✅ Cleared all shopping lists and items');

            // Step 2: Get system data
            const user = await User.findOne();
            if (!user) {
                return res.status(400).json({
                    status: 'error',
                    message: 'No users found in the system. Please create users first.',
                });
            }

            const products = await Product.findAll({
                limit: 15,
                where: { isAvailable: true },
                include: [{ model: Market, as: 'market', required: false }],
            });

            if (products.length === 0) {
                return res.status(400).json({
                    status: 'error',
                    message: 'No products found in the system. Please create products first.',
                });
            }

            logger.info(`📦 Found ${products.length} products to work with`);

            const supermarket = await Market.findOne({
                where: { marketType: { [Op.ne]: 'local_market' } },
            });

            const localMarket = await Market.findOne({
                where: { marketType: 'local_market' },
            });

            // Step 3: Create "Today's Essential Shopping List" (SUGGESTED - READ-ONLY)
            logger.info('📝 Creating suggested shopping list...');
            const suggestedList = await ShoppingList.create({
                name: 'Today\'s Essential Shopping List',
                notes: 'Everything you need for today - curated by our shopping experts',
                customerId: user.id,
                marketId: supermarket?.id,
                status: 'draft',
                creatorType: 'system',
                listType: 'suggested',
                category: 'daily_essentials',
                tags: ['today', 'essential', 'curated'],
                estimatedTime: '1-2 hours',
                estimatedCost: '₦8,000 - ₦15,000',
                marketType: 'supermarket',
                image: '/images/todays-essentials.jpg',
                isPopular: true,
                isActive: true,
                sortOrder: 1,
                createdBy: user.id,
                isReadOnly: true, // READ-ONLY system list
            });

            // Add items with real product links
            let suggestedTotal = 0;
            const suggestedItems = products.slice(0, 6);

            for (const product of suggestedItems) {
                const quantity = Math.floor(Math.random() * 3) + 1;
                const price = Number(product.price) || 0;
                suggestedTotal += price * quantity;

                await ShoppingListItem.create({
                    name: product.name,
                    quantity: quantity,
                    unit: 'pieces',
                    estimatedPrice: product.price,
                    productId: product.id,
                    shoppingListId: suggestedList.id,
                });

                logger.info(`  ✅ Added "${product.name}" (₦${price}) x${quantity} - LINKED TO PRODUCT`);
            }

            await suggestedList.update({ estimatedTotal: suggestedTotal });
            logger.info(`✅ Suggested list created with ₦${suggestedTotal} total`);

            // Step 4: Create "Local Market Fresh Finds" (SUGGESTED - with user prices)
            logger.info('📝 Creating local market suggested list...');
            const localSuggestedList = await ShoppingList.create({
                name: 'Local Market Fresh Finds',
                notes: 'Fresh local produce where you set your own price expectations',
                customerId: user.id,
                marketId: localMarket?.id,
                status: 'draft',
                creatorType: 'system',
                listType: 'suggested',
                category: 'local_fresh',
                tags: ['local', 'fresh', 'flexible_pricing'],
                estimatedTime: '1-1.5 hours',
                estimatedCost: 'Price varies - set your budget',
                marketType: 'local_market',
                image: '/images/local-market.jpg',
                isPopular: false,
                isActive: true,
                sortOrder: 2,
                createdBy: user.id,
                isReadOnly: true, // READ-ONLY system list
            });

            // Add local market items with user-provided prices
            const localItems = [
                { name: 'Fresh Tomatoes', qty: 10, userPrice: 1500 },
                { name: 'Hot Peppers', qty: 5, userPrice: 800 },
                { name: 'Red Onions', qty: 8, userPrice: 1200 },
                { name: 'Green Vegetables', qty: 3, userPrice: 2000 },
                { name: 'Plantain', qty: 6, userPrice: 1800 },
                { name: 'Yam Tubers', qty: 2, userPrice: 3000 },
            ];

            let localTotal = 0;
            for (const item of localItems) {
                localTotal += item.userPrice;

                // Try to find matching product (optional)
                const matchingProduct = products.find(p =>
                    p.name.toLowerCase().includes(item.name.split(' ')[0].toLowerCase()) ||
                    p.name.toLowerCase().includes(item.name.split(' ')[1]?.toLowerCase() || '')
                );

                await ShoppingListItem.create({
                    name: item.name,
                    quantity: item.qty,
                    unit: 'pieces',
                    estimatedPrice: null, // No preset price for local market
                    userProvidedPrice: item.userPrice, // User sets the price
                    productId: matchingProduct?.id || null,
                    shoppingListId: localSuggestedList.id,
                });

                logger.info(`  ✅ Added "${item.name}" with USER PRICE ₦${item.userPrice}${matchingProduct ? ' - LINKED' : ' - NO LINK'}`);
            }

            await localSuggestedList.update({ estimatedTotal: localTotal });
            logger.info(`✅ Local market list created with ₦${localTotal} total`);

            // Step 5: Create "Weekend Family Feast" (SUGGESTED)
            const familyList = await ShoppingList.create({
                name: 'Weekend Family Feast',
                notes: 'Perfect ingredients for a wonderful weekend family meal',
                customerId: user.id,
                marketId: supermarket?.id,
                status: 'draft',
                creatorType: 'system',
                listType: 'suggested',
                category: 'family_meal',
                tags: ['weekend', 'family', 'feast'],
                estimatedTime: '2-3 hours',
                estimatedCost: '₦12,000 - ₦20,000',
                marketType: 'supermarket',
                image: '/images/family-feast.jpg',
                isPopular: true,
                isActive: true,
                sortOrder: 3,
                createdBy: user.id,
                isReadOnly: true,
            });

            let familyTotal = 0;
            const familyItems = products.slice(7, 12);

            for (const product of familyItems) {
                const quantity = Math.floor(Math.random() * 2) + 2;
                const price = Number(product.price) || 0;
                familyTotal += price * quantity;

                await ShoppingListItem.create({
                    name: product.name,
                    quantity: quantity,
                    unit: 'pieces',
                    estimatedPrice: product.price,
                    productId: product.id,
                    shoppingListId: familyList.id,
                });
            }

            await familyList.update({ estimatedTotal: familyTotal });

            // Step 6: Create Personal Shopping List (EDITABLE)
            logger.info('📝 Creating personal shopping list...');
            const personalList = await ShoppingList.create({
                name: `My Weekly Groceries - ${user.firstName || 'User'}`,
                notes: 'My regular weekly shopping list',
                customerId: user.id,
                marketId: supermarket?.id,
                status: 'draft',
                creatorType: 'user',
                listType: 'personal',
                category: 'personal_weekly',
                tags: ['weekly', 'personal', 'routine'],
                estimatedTime: '1.5-2 hours',
                estimatedCost: '₦10,000 - ₦18,000',
                marketType: 'supermarket',
                isPopular: false,
                isActive: true,
                sortOrder: 1,
                createdBy: user.id,
                isReadOnly: false, // EDITABLE personal list
            });

            // Add personal items
            let personalTotal = 0;
            const personalItems = products.slice(3, 8);

            for (const product of personalItems) {
                const quantity = Math.floor(Math.random() * 4) + 1;
                const price = Number(product.price) || 0;
                personalTotal += price * quantity;

                await ShoppingListItem.create({
                    name: product.name,
                    quantity: quantity,
                    unit: 'pieces',
                    estimatedPrice: product.price,
                    productId: product.id,
                    shoppingListId: personalList.id,
                });

                logger.info(`  ✅ Added "${product.name}" (₦${price}) x${quantity} - PERSONAL & EDITABLE`);
            }

            await personalList.update({ estimatedTotal: personalTotal });
            logger.info(`✅ Personal list created with ₦${personalTotal} total`);

            // Step 7: Create another personal list for local market
            const personalLocalList = await ShoppingList.create({
                name: `My Local Market Shopping - ${user.firstName || 'User'}`,
                notes: 'Shopping from my local market with custom prices',
                customerId: user.id,
                marketId: localMarket?.id,
                status: 'draft',
                creatorType: 'user',
                listType: 'personal',
                category: 'local_personal',
                tags: ['local', 'personal', 'budget'],
                estimatedTime: '1 hour',
                estimatedCost: 'Custom pricing',
                marketType: 'local_market',
                isPopular: false,
                isActive: true,
                sortOrder: 2,
                createdBy: user.id,
                isReadOnly: false,
            });

            const personalLocalItems = [
                { name: 'Fresh Pepper', qty: 10, userPrice: 1000 },
                { name: 'Local Tomatoes', qty: 15, userPrice: 2000 },
                { name: 'Sweet Plantain', qty: 8, userPrice: 2400 },
                { name: 'Fresh Yam', qty: 3, userPrice: 4500 },
                { name: 'Leafy Vegetables', qty: 3, userPrice: 2500 },
            ];

            let personalLocalTotal = 0;
            for (const item of personalLocalItems) {
                personalLocalTotal += item.userPrice;

                const matchingProduct = products.find(p =>
                    p.name.toLowerCase().includes(item.name.split(' ')[0].toLowerCase()) ||
                    p.name.toLowerCase().includes(item.name.split(' ')[1]?.toLowerCase() || '')
                );

                await ShoppingListItem.create({
                    name: item.name,
                    quantity: item.qty,
                    unit: 'pieces',
                    estimatedPrice: null,
                    userProvidedPrice: item.userPrice,
                    productId: matchingProduct?.id || null,
                    shoppingListId: personalLocalList.id,
                });
            }

            await personalLocalList.update({ estimatedTotal: personalLocalTotal });

            // Step 8: Create Test Copy Scenario
            logger.info('📝 Creating test copy scenario...');
            const copiedList = await ShoppingList.create({
                name: 'My Copy of Today\'s Essentials',
                notes: 'Copied from suggested list and customized for my needs',
                customerId: user.id,
                marketId: localMarket?.id,
                status: 'draft',
                creatorType: 'user',
                listType: 'personal',
                category: 'copied_from_suggested',
                tags: ['copied', 'personal', 'customized'],
                estimatedTime: '1-2 hours',
                estimatedCost: 'Custom budget',
                marketType: 'local_market',
                image: '/images/copied-list.jpg',
                isPopular: false,
                isActive: true,
                sortOrder: 3,
                createdBy: user.id,
                isReadOnly: false, // EDITABLE copied list
                sourceSuggestedListId: suggestedList.id, // TRACKS SOURCE
            });

            // Copy some items from suggested list but modify for local market
            const copiedItems = suggestedItems.slice(0, 4);
            let copiedTotal = 0;

            for (const product of copiedItems) {
                const quantity = Math.floor(Math.random() * 2) + 1;
                const userPrice = Math.floor(Math.random() * 1500) + 500;
                copiedTotal += userPrice * quantity;

                await ShoppingListItem.create({
                    name: product.name,
                    quantity: quantity,
                    unit: 'pieces',
                    estimatedPrice: null, // No preset price in local market
                    userProvidedPrice: userPrice, // User sets custom price
                    productId: product.id,
                    shoppingListId: copiedList.id,
                });

                logger.info(`  ✅ Copied "${product.name}" with custom price ₦${userPrice} - COPIED & CUSTOMIZED`);
            }

            await copiedList.update({ estimatedTotal: copiedTotal });
            logger.info(`✅ Copied list created with ₦${copiedTotal} total`);

            // Step 9: Generate comprehensive summary
            const totalLists = await ShoppingList.count();
            const totalItems = await ShoppingListItem.count();
            const suggestedLists = await ShoppingList.count({ where: { listType: 'suggested' } });
            const personalLists = await ShoppingList.count({ where: { listType: 'personal' } });

            // Get counts for items with product links
            const linkedItems = await ShoppingListItem.count({
                where: { productId: { [Op.ne]: null } },
            });

            // Get counts for items with user-provided prices
            const userPricedItems = await ShoppingListItem.count({
                where: { userProvidedPrice: { [Op.ne]: null } },
            });

            const readOnlyLists = await ShoppingList.count({ where: { isReadOnly: true } });
            const editableLists = await ShoppingList.count({ where: { isReadOnly: false } });

            // Get lists with source tracking
            const listsWithSource = await ShoppingList.count({
                where: { sourceSuggestedListId: { [Op.ne]: null } },
            });

            const supermarketLists = await ShoppingList.count({ where: { marketType: 'supermarket' } });
            const localMarketLists = await ShoppingList.count({ where: { marketType: 'local_market' } });

            const summary = {
                totalLists,
                totalItems,
                suggestedLists,
                personalLists,
                linkedItems,
                userPricedItems,
                readOnlyLists,
                editableLists,
                listsWithSource,
                supermarketLists,
                localMarketLists,
            };

            logger.info('📊 Seeding completed successfully!');

            res.status(200).json({
                status: 'success',
                message: 'Shopping lists seeded successfully with real products!',
                data: {
                    summary,
                    details: {
                        productsFound: products.length,
                        userFound: `${user.firstName || 'Unknown'} (${user.email})`,
                        marketsFound: {
                            supermarket: supermarket?.name || 'None',
                            localMarket: localMarket?.name || 'None',
                        },
                    },
                    listsCreated: [
                        {
                            name: 'Today\'s Essential Shopping List',
                            type: 'suggested',
                            readonly: true,
                            items: suggestedItems.length,
                            total: `₦${suggestedTotal}`,
                            marketType: 'supermarket',
                        },
                        {
                            name: 'Local Market Fresh Finds',
                            type: 'suggested',
                            readonly: true,
                            items: localItems.length,
                            total: `₦${localTotal}`,
                            marketType: 'local_market',
                        },
                        {
                            name: 'Weekend Family Feast',
                            type: 'suggested',
                            readonly: true,
                            items: familyItems.length,
                            total: `₦${familyTotal}`,
                            marketType: 'supermarket',
                        },
                        {
                            name: `My Weekly Groceries - ${user.firstName || 'User'}`,
                            type: 'personal',
                            readonly: false,
                            items: personalItems.length,
                            total: `₦${personalTotal}`,
                            marketType: 'supermarket',
                        },
                        {
                            name: `My Local Market Shopping - ${user.firstName || 'User'}`,
                            type: 'personal',
                            readonly: false,
                            items: personalLocalItems.length,
                            total: `₦${personalLocalTotal}`,
                            marketType: 'local_market',
                        },
                        {
                            name: 'My Copy of Today\'s Essentials',
                            type: 'personal',
                            readonly: false,
                            items: copiedItems.length,
                            total: `₦${copiedTotal}`,
                            marketType: 'local_market',
                            copiedFrom: 'Today\'s Essential Shopping List',
                        },
                    ],
                    testEndpoints: [
                        'GET /api/v0/home/suggested-lists',
                        'GET /api/v0/shopping-lists/suggested',
                        'POST /api/v0/shopping-lists/suggested/:id/copy',
                        'POST /api/v0/shopping-lists/:id/items/with-price',
                    ],
                },
            });

        } catch (error) {
            logger.error('❌ Shopping list seeding failed:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to seed shopping lists',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Clear all shopping lists
     * DELETE /api/v0/seed/shopping-lists
     */
    static async clearShoppingLists(req: Request, res: Response) {
        try {
            logger.info('🧹 Clearing all shopping list data...');

            const itemsDeleted = await ShoppingListItem.destroy({ where: {}, truncate: false });
            const listsDeleted = await ShoppingList.destroy({ where: {}, truncate: false });

            logger.info(`✅ Cleared ${itemsDeleted} items and ${listsDeleted} lists`);

            res.status(200).json({
                status: 'success',
                message: 'All shopping lists cleared successfully',
                data: {
                    itemsDeleted,
                    listsDeleted,
                },
            });

        } catch (error) {
            logger.error('❌ Failed to clear shopping lists:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to clear shopping lists',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Seed meals with ingredients
     * GET /api/v0/seed/meals
     */
    static async seedMeals(req: Request, res: Response) {
        try {
            const result = await MealSeeder.seedMeals();

            res.status(200).json({
                status: 'success',
                ...result
            });
        } catch (error) {
            logger.error('❌ Meal seeding failed:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to seed meals',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    /**
     * Clear all meals
     * DELETE /api/v0/seed/meals
     */
    static async clearMeals(req: Request, res: Response) {
        try {
            const result = await MealSeeder.clearMeals();

            res.status(200).json({
                status: 'success',
                ...result
            });
        } catch (error) {
            logger.error('❌ Failed to clear meals:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to clear meals',
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }
} 