import { Request, Response } from 'express';
import { Database } from '../../models';
import Category from '../../models/category.model';
import Market from '../../models/market.model';
import MarketCategory from '../../models/marketCategory.model';
import Product from '../../models/product.model';
import { BadRequestError } from '../../utils/customErrors';
import { logger } from '../../utils/logger';
import { Transaction } from 'sequelize';
import * as path from 'path';
import * as fs from 'fs';
import ShoppingList from '../../models/shoppingList.model';
import ShoppingListItem from '../../models/shoppingListItem.model';
import User from '../../models/user.model';
import Order from '../../models/order.model';
import OrderTrail from '../../models/orderTrail.model';
import ChatMessage from '../../models/chatMessage.model';
import MealSeeder from '../../seeders/mealSeeder';
import DiscountCampaignService from '../../services/discountCampaign.service';
import { IDiscountCampaign, DiscountType, DiscountTargetType, CampaignStatus } from '../../models/discountCampaign.model';
import SystemSettingsService from '../../services/systemSettings.service';
import { Op } from 'sequelize';

interface SeedData {
    categories: Array<{
        id: string;
        name: string;
        description?: string;
        images: string[];
        isPinned: boolean;
        icon?: string;
    }>;
    markets: Array<{
        id: string;
        name?: string;
        address: string;
        location: {
            latitude: number;
            longitude: number;
            city: string;
            state: string;
            country: string;
        };
        phoneNumber?: string;
        marketType: 'supermarket' | 'local_market' | 'pharmacy' | 'specialty_store';
        description?: string;
        images: string[];
        isPinned: boolean;
        operatingHours?: {
            monday: { open: string; close: string };
            tuesday: { open: string; close: string };
            wednesday: { open: string; close: string };
            thursday: { open: string; close: string };
            friday: { open: string; close: string };
            saturday: { open: string; close: string };
            sunday: { open: string; close: string };
        };
        isActive: boolean;
        ownerId?: string;
    }>;
    marketCategories: Array<{
        id: string;
        marketId: string;
        categoryId: string;
    }>;
    products: Array<{
        id: string;
        name: string;
        description?: string;
        price: number;
        images: string[];
        barcode?: string;
        sku?: string;
        stockQuantity: number;
        attributes?: object;
        isAvailable: boolean;
        marketId: string;
    }>;
}

class SeederController {
    /**
     * Seed the database with sample data
     */
    async seedDatabase(req: Request, res: Response) {
        try {
            logger.info('Starting database seeding process...');

            // Read the JSON file
            const jsonFilePath = path.join(__dirname, '../../data/seed-data.json');

            let seedData: SeedData;

            // Check if the file exists
            if (fs.existsSync(jsonFilePath)) {
                const jsonData = fs.readFileSync(jsonFilePath, 'utf8');
                seedData = JSON.parse(jsonData);
            } else {
                // Fallback to the data provided in the request body or use default data
                if (req.body && Object.keys(req.body).length > 0) {
                    seedData = req.body as SeedData;
                } else {
                    throw new BadRequestError('No seed data provided and seed file not found');
                }
            }

            // Validate seed data structure
            if (!seedData.categories || !seedData.markets || !seedData.marketCategories || !seedData.products) {
                throw new BadRequestError('Invalid seed data structure. Missing required arrays.');
            }

            const results = await Database.transaction(async (transaction: Transaction) => {
                const seededData = {
                    categories: 0,
                    markets: 0,
                    marketCategories: 0,
                    products: 0,
                    skipped: {
                        categories: 0,
                        markets: 0,
                        marketCategories: 0,
                        products: 0,
                    },
                };

                // 1. Seed Categories
                logger.info('Seeding categories...');
                for (const categoryData of seedData.categories) {
                    try {
                        const existingCategory = await Category.findByPk(categoryData.id, { transaction });

                        if (!existingCategory) {
                            await Category.create({
                                id: categoryData.id,
                                name: categoryData.name,
                                description: categoryData.description,
                                images: categoryData.images,
                                isPinned: categoryData.isPinned,
                                icon: categoryData.icon,
                            }, { transaction });
                            seededData.categories++;
                            logger.info(`Created category: ${categoryData.name}`);
                        } else {
                            seededData.skipped.categories++;
                            logger.info(`Skipped existing category: ${categoryData.name}`);
                        }
                    } catch (error) {
                        logger.error(`Error seeding category ${categoryData.name}:`, error);
                        // Continue with other categories
                    }
                }

                // 2. Seed Markets
                logger.info('Seeding markets...');
                for (const marketData of seedData.markets) {
                    try {
                        const existingMarket = await Market.findByPk(marketData.id, { transaction });

                        if (!existingMarket) {
                            await Market.create({
                                id: marketData.id,
                                name: marketData.name,
                                address: marketData.address,
                                location: marketData.location,
                                phoneNumber: marketData.phoneNumber,
                                marketType: marketData.marketType,
                                description: marketData.description,
                                images: marketData.images,
                                isPinned: marketData.isPinned,
                                operatingHours: marketData.operatingHours,
                                isActive: marketData.isActive,
                                ownerId: marketData.ownerId,
                            }, { transaction });
                            seededData.markets++;
                            logger.info(`Created market: ${marketData.name || marketData.address}`);
                        } else {
                            seededData.skipped.markets++;
                            logger.info(`Skipped existing market: ${marketData.name || marketData.address}`);
                        }
                    } catch (error) {
                        logger.error(`Error seeding market ${marketData.name || marketData.address}:`, error);
                        // Continue with other markets
                    }
                }

                // 3. Seed Market-Category Associations
                logger.info('Seeding market-category associations...');
                for (const mcData of seedData.marketCategories) {
                    try {
                        const existingAssociation = await MarketCategory.findByPk(mcData.id, { transaction });

                        if (!existingAssociation) {
                            // Verify that both market and category exist
                            const market = await Market.findByPk(mcData.marketId, { transaction });
                            const category = await Category.findByPk(mcData.categoryId, { transaction });

                            if (market && category) {
                                await MarketCategory.create({
                                    id: mcData.id,
                                    marketId: mcData.marketId,
                                    categoryId: mcData.categoryId,
                                }, { transaction });
                                seededData.marketCategories++;
                                logger.info(`Created market-category association: ${market.name || market.address} <-> ${category.name}`);
                            } else {
                                logger.warn('Skipping market-category association due to missing market or category');
                                seededData.skipped.marketCategories++;
                            }
                        } else {
                            seededData.skipped.marketCategories++;
                        }
                    } catch (error) {
                        logger.error('Error seeding market-category association:', error);
                        // Continue with other associations
                    }
                }

                // 4. Seed Products
                logger.info('Seeding products...');
                const skippedProducts = [];
                for (const productData of seedData.products) {
                    try {
                        const existingProduct = await Product.findByPk(productData.id, { transaction });

                        if (!existingProduct) {
                            // Verify that the market exists
                            const market = await Market.findByPk(productData.marketId, { transaction });

                            if (market) {
                                await Product.create({
                                    id: productData.id,
                                    name: productData.name,
                                    description: productData.description,
                                    price: productData.price,
                                    images: productData.images,
                                    barcode: productData.barcode,
                                    sku: productData.sku,
                                    stockQuantity: productData.stockQuantity,
                                    attributes: productData.attributes,
                                    isAvailable: productData.isAvailable,
                                    marketId: productData.marketId,
                                }, { transaction });
                                seededData.products++;
                                logger.info(`Created product: ${productData.name}`);
                            } else {
                                const skipReason = `Market not found (ID: ${productData.marketId})`;
                                logger.warn(`Skipping product ${productData.name} - ${skipReason}`);
                                skippedProducts.push({
                                    name: productData.name,
                                    marketId: productData.marketId,
                                    reason: skipReason,
                                });
                                seededData.skipped.products++;
                            }
                        } else {
                            const skipReason = 'Product already exists';
                            logger.info(`Skipped existing product: ${productData.name}`);
                            skippedProducts.push({
                                name: productData.name,
                                marketId: productData.marketId,
                                reason: skipReason,
                            });
                            seededData.skipped.products++;
                        }
                    } catch (error: any) {
                        logger.error(`Error seeding product ${productData.name}:`, error);
                        skippedProducts.push({
                            name: productData.name,
                            marketId: productData.marketId,
                            reason: `Error: ${error?.message || 'Unknown error'}`,
                        });
                        // Continue with other products
                    }
                }

                return { seededData, skippedProducts };
            });

            logger.info('Database seeding completed successfully');

            res.status(200).json({
                status: 'success',
                message: 'Database seeded successfully',
                data: {
                    summary: results.seededData,
                    details: {
                        totalAttempted: {
                            categories: seedData.categories.length,
                            markets: seedData.markets.length,
                            marketCategories: seedData.marketCategories.length,
                            products: seedData.products.length,
                        },
                        created: {
                            categories: results.seededData.categories,
                            markets: results.seededData.markets,
                            marketCategories: results.seededData.marketCategories,
                            products: results.seededData.products,
                        },
                        skipped: results.seededData.skipped,
                        skippedProducts: results.skippedProducts,
                    },
                },
            });

        } catch (error: any) {
            logger.error('Database seeding failed:', error);

            res.status(error.statusCode || 500).json({
                status: 'error',
                message: error.message || 'Database seeding failed',
                error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            });
        }
    }

    /**
     * Clear all seeded data
     */
    async clearSeedData(req: Request, res: Response) {
        try {
            logger.info('Starting database clearing process...');

            const results = await Database.transaction(async (transaction: Transaction) => {
                const deletedCounts = {
                    products: 0,
                    marketCategories: 0,
                    markets: 0,
                    categories: 0,
                };

                // Delete in reverse order to respect foreign key constraints

                // 1. Delete Products
                const deletedProducts = await Product.destroy({
                    where: {},
                    transaction,
                    force: true, // Hard delete
                });
                deletedCounts.products = deletedProducts;

                // 2. Delete Market-Category associations
                const deletedMarketCategories = await MarketCategory.destroy({
                    where: {},
                    transaction,
                    force: true,
                });
                deletedCounts.marketCategories = deletedMarketCategories;

                // 3. Delete Markets
                const deletedMarkets = await Market.destroy({
                    where: {},
                    transaction,
                    force: true,
                });
                deletedCounts.markets = deletedMarkets;

                // 4. Delete Categories
                const deletedCategories = await Category.destroy({
                    where: {},
                    transaction,
                    force: true,
                });
                deletedCounts.categories = deletedCategories;

                return deletedCounts;
            });

            logger.info('Database clearing completed successfully');

            res.status(200).json({
                status: 'success',
                message: 'Database cleared successfully',
                data: {
                    deletedCounts: results,
                },
            });

        } catch (error: any) {
            logger.error('Database clearing failed:', error);

            res.status(error.statusCode || 500).json({
                status: 'error',
                message: error.message || 'Database clearing failed',
                error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            });
        }
    }

    /**
     * Get seeding status/stats
     */
    async getSeedingStatus(req: Request, res: Response) {
        try {
            const stats = {
                categories: await Category.count(),
                markets: await Market.count(),
                marketCategories: await MarketCategory.count(),
                products: await Product.count(),
            };

            res.status(200).json({
                status: 'success',
                message: 'Database seeding status retrieved',
                data: {
                    counts: stats,
                    isEmpty: Object.values(stats).every(count => count === 0),
                },
            });

        } catch (error: any) {
            logger.error('Failed to get seeding status:', error);

            res.status(error.statusCode || 500).json({
                status: 'error',
                message: error.message || 'Failed to get seeding status',
            });
        }
    }

    async seedShoppingLists(req: Request, res: Response) {
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

    async clearShoppingLists(req: Request, res: Response) {
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

    async seedMeals(req: Request, res: Response) {
        try {
            const result = await MealSeeder.seedMeals();

            res.status(200).json({
                status: 'success',
                ...result,
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

    async clearMeals(req: Request, res: Response) {
        try {
            const result = await MealSeeder.clearMeals();

            res.status(200).json({
                status: 'success',
                ...result,
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


    // Seed discount campaigns with realistic data
    async seedDiscountCampaigns(req: Request, res: Response) {
        const userId = '046ee1e3-38c1-49d9-9e8c-3c3621ed1385';
        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        try {
            // Get existing data from database for realistic seeding
            const markets = await Market.findAll({ limit: 10 });
            const products = await Product.findAll({ limit: 20 });
            const users = await User.findAll({ limit: 10 });

            if (markets.length === 0) {
                throw new BadRequestError('No markets found. Please seed markets first.');
            }

            const now = new Date();
            const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
            const pastDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

            // Sample discount campaigns with realistic data
            const campaignSeeds: IDiscountCampaign[] = [
                // Global percentage discounts
                {
                    name: 'Welcome Discount',
                    description: 'New customer welcome discount - 10% off your first order',
                    code: 'WELCOME10',
                    type: DiscountType.PERCENTAGE,
                    targetType: DiscountTargetType.FIRST_ORDER,
                    value: 10,
                    minimumOrderAmount: 2000,
                    maximumDiscountAmount: 500,
                    usageLimit: 1000,
                    usageLimitPerUser: 1,
                    startDate: pastDate,
                    endDate: futureDate,
                    status: CampaignStatus.ACTIVE,
                    isAutomaticApply: false,
                    isStackable: false,
                    priority: 1,
                    createdBy: userId,
                    conditions: {
                        userType: 'customer',
                        orderCount: { max: 1 },
                    },
                },
                {
                    name: 'Weekend Special',
                    description: 'Weekend shopping bonus - 15% off all orders',
                    code: 'WEEKEND15',
                    type: DiscountType.PERCENTAGE,
                    targetType: DiscountTargetType.GLOBAL,
                    value: 15,
                    minimumOrderAmount: 5000,
                    maximumDiscountAmount: 1000,
                    usageLimit: 500,
                    usageLimitPerUser: 2,
                    startDate: now,
                    endDate: futureDate,
                    status: CampaignStatus.ACTIVE,
                    isAutomaticApply: false,
                    isStackable: true,
                    priority: 2,
                    createdBy: userId,
                    conditions: {
                        dayOfWeek: [6, 0], // Saturday and Sunday
                        includeShippingInMinimum: false,
                    },
                },
                // Market-specific discounts
                {
                    name: `${markets[0].name || 'Market'} Exclusive`,
                    description: `Special 20% discount for ${markets[0].name || 'Market'} shoppers`,
                    code: 'MARKET20',
                    type: DiscountType.PERCENTAGE,
                    targetType: DiscountTargetType.MARKET,
                    value: 20,
                    minimumOrderAmount: 3000,
                    maximumDiscountAmount: 800,
                    usageLimit: 200,
                    usageLimitPerUser: 1,
                    startDate: pastDate,
                    endDate: futureDate,
                    status: CampaignStatus.ACTIVE,
                    isAutomaticApply: true,
                    isStackable: false,
                    priority: 3,
                    createdBy: userId,
                    targetMarketIds: [markets[0].id],
                    conditions: {
                        userType: 'customer',
                    },
                },
                // Product-specific discounts
                ...(products.length > 0 ? [{
                    name: 'Product Flash Sale',
                    description: 'Limited time 25% off selected products',
                    code: 'FLASH25',
                    type: DiscountType.PERCENTAGE,
                    targetType: DiscountTargetType.PRODUCT,
                    value: 25,
                    minimumOrderAmount: 1000,
                    maximumDiscountAmount: 600,
                    usageLimit: 100,
                    usageLimitPerUser: 1,
                    startDate: now,
                    endDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
                    status: CampaignStatus.ACTIVE,
                    isAutomaticApply: false,
                    isStackable: true,
                    priority: 1,
                    createdBy: userId,
                    targetProductIds: products.slice(0, 5).map(p => p.id),
                    conditions: {
                        excludeDiscountedItems: false,
                    },
                }] : []),
                // Fixed amount discounts
                {
                    name: 'Fixed ₦500 Off',
                    description: 'Get ₦500 off orders above ₦7,000',
                    code: 'SAVE500',
                    type: DiscountType.FIXED_AMOUNT,
                    targetType: DiscountTargetType.GLOBAL,
                    value: 500,
                    minimumOrderAmount: 7000,
                    usageLimit: 300,
                    usageLimitPerUser: 1,
                    startDate: pastDate,
                    endDate: futureDate,
                    status: CampaignStatus.ACTIVE,
                    isAutomaticApply: false,
                    isStackable: true,
                    priority: 4,
                    createdBy: userId,
                    conditions: {
                        userType: 'customer',
                        includeShippingInMinimum: true,
                    },
                },
                // User-specific (referral) discounts
                {
                    name: 'Referral Bonus',
                    description: 'Earn 10% discount for successful referrals',
                    type: DiscountType.PERCENTAGE,
                    targetType: DiscountTargetType.REFERRAL,
                    value: 10,
                    minimumOrderAmount: 2000,
                    maximumDiscountAmount: 300,
                    usageLimit: 1000,
                    usageLimitPerUser: 5,
                    startDate: pastDate,
                    endDate: futureDate,
                    status: CampaignStatus.ACTIVE,
                    isAutomaticApply: true,
                    isStackable: true,
                    priority: 5,
                    createdBy: userId,
                    conditions: {
                        userType: 'customer',
                    },
                },
                // Buy X Get Y discount
                {
                    name: 'Buy 2 Get 1 Free',
                    description: 'Buy 2 items, get 1 free on selected products',
                    code: 'BUY2GET1',
                    type: DiscountType.BUY_X_GET_Y,
                    targetType: DiscountTargetType.PRODUCT,
                    value: 100, // 100% off the free item
                    minimumOrderAmount: 1500,
                    usageLimit: 150,
                    usageLimitPerUser: 3,
                    startDate: now,
                    endDate: futureDate,
                    status: CampaignStatus.ACTIVE,
                    isAutomaticApply: false,
                    isStackable: false,
                    priority: 2,
                    createdBy: userId,
                    buyXGetYConfig: {
                        buyQuantity: 2,
                        getQuantity: 1,
                        applyToSameProduct: true,
                    },
                    targetProductIds: products.length > 10 ? products.slice(10, 15).map(p => p.id) : [],
                    conditions: {
                        excludeDiscountedItems: true,
                    },
                },
                // Category-specific discount
                {
                    name: 'Grocery Essentials',
                    description: '12% off grocery essentials',
                    code: 'GROCERY12',
                    type: DiscountType.PERCENTAGE,
                    targetType: DiscountTargetType.CATEGORY,
                    value: 12,
                    minimumOrderAmount: 2500,
                    maximumDiscountAmount: 400,
                    usageLimit: 400,
                    usageLimitPerUser: 2,
                    startDate: pastDate,
                    endDate: futureDate,
                    status: CampaignStatus.ACTIVE,
                    isAutomaticApply: true,
                    isStackable: true,
                    priority: 3,
                    createdBy: userId,
                    targetCategories: ['groceries', 'food', 'beverages'],
                    conditions: {
                        userType: 'customer',
                        timeOfDay: {
                            start: '08:00',
                            end: '18:00',
                        },
                    },
                },
                // Free shipping discount
                {
                    name: 'Free Delivery',
                    description: 'Free delivery on orders above ₦4,000',
                    code: 'FREESHIP',
                    type: DiscountType.FREE_SHIPPING,
                    targetType: DiscountTargetType.GLOBAL,
                    value: 0, // Free shipping doesn't have a percentage/amount value
                    minimumOrderAmount: 4000,
                    usageLimit: 1000,
                    usageLimitPerUser: 3,
                    startDate: pastDate,
                    endDate: futureDate,
                    status: CampaignStatus.ACTIVE,
                    isAutomaticApply: true,
                    isStackable: true,
                    priority: 6,
                    createdBy: userId,
                    conditions: {
                        userType: 'customer',
                        includeShippingInMinimum: false,
                    },
                },
                // Loyalty discount for returning customers
                {
                    name: 'Loyalty Reward',
                    description: 'Special 18% discount for loyal customers',
                    code: 'LOYAL18',
                    type: DiscountType.PERCENTAGE,
                    targetType: DiscountTargetType.USER,
                    value: 18,
                    minimumOrderAmount: 6000,
                    maximumDiscountAmount: 1200,
                    usageLimit: 50,
                    usageLimitPerUser: 1,
                    startDate: now,
                    endDate: futureDate,
                    status: CampaignStatus.ACTIVE,
                    isAutomaticApply: false,
                    isStackable: false,
                    priority: 1,
                    createdBy: userId,
                    targetUserIds: users.slice(0, 5).map(u => u.id),
                    conditions: {
                        orderCount: { min: 5 },
                        lastOrderDays: 30,
                    },
                },
            ];

            // Create campaigns
            const createdCampaigns = [];
            for (const campaignData of campaignSeeds) {
                try {
                    const campaign = await DiscountCampaignService.createCampaign(campaignData);
                    createdCampaigns.push(campaign);
                } catch (error) {
                    console.error(`Failed to create campaign ${campaignData.name}:`, error);
                    // Continue with other campaigns
                }
            }

            res.status(201).json({
                status: 'success',
                message: `Successfully seeded ${createdCampaigns.length} discount campaigns`,
                data: {
                    createdCampaigns: createdCampaigns.length,
                    campaigns: createdCampaigns,
                    seedingDetails: {
                        totalAttempted: campaignSeeds.length,
                        successful: createdCampaigns.length,
                        failed: campaignSeeds.length - createdCampaigns.length,
                        marketsUsed: markets.length,
                        productsUsed: products.length,
                        usersUsed: users.length,
                    },
                },
            });

        } catch (error) {
            console.error('Error seeding discount campaigns:', error);
            throw error;
        }
    }

    /**
     * Seed system settings with default values
     */
    async seedSystemSettings(req: Request, res: Response) {
        try {
            logger.info('Starting system settings seeding process...');

            // Initialize default system settings
            await SystemSettingsService.initializeDefaultSettings();

            // Get all settings to verify they were created
            const allSettings = await SystemSettingsService.getAllSettings();
            
            // Get public settings to show what's available to frontend
            const publicSettings = await SystemSettingsService.getPublicSettings();

            res.status(200).json({
                status: 'success',
                message: 'System settings seeded successfully',
                data: {
                    totalSettings: allSettings.length,
                    publicSettingsCount: Object.keys(publicSettings).length,
                    settings: allSettings.map(setting => ({
                        key: setting.key,
                        type: setting.value.type,
                        category: setting.value.category,
                        description: setting.value.description,
                        isPublic: setting.value.isPublic,
                        value: setting.value.isPublic ? setting.value.value : '[HIDDEN]',
                        isActive: setting.isActive,
                    })),
                    publicSettings,
                },
            });

        } catch (error) {
            logger.error('Error seeding system settings:', error);
            throw error;
        }
    }

    /**
     * Clear all system settings
     */
    async clearSystemSettings(req: Request, res: Response) {
        try {
            logger.info('Starting system settings clearing process...');

            // Get all settings before clearing
            const allSettings = await SystemSettingsService.getAllSettings();
            const settingsCount = allSettings.length;

            // Clear all settings by deactivating them
            await Database.transaction(async (transaction: Transaction) => {
                // Deactivate all settings instead of deleting them
                await Database.models.SystemSettings.update(
                    { isActive: false },
                    { where: {}, transaction }
                );
            });

            // Clear the cache
            SystemSettingsService.clearCache();

            res.status(200).json({
                status: 'success',
                message: 'System settings cleared successfully',
                data: {
                    clearedCount: settingsCount,
                    action: 'deactivated',
                },
            });

        } catch (error) {
            logger.error('Error clearing system settings:', error);
            throw error;
        }
    }

    /**
     * Get system settings status
     */
    async getSystemSettingsStatus(req: Request, res: Response) {
        try {
            const allSettings = await SystemSettingsService.getAllSettings();
            const publicSettings = await SystemSettingsService.getPublicSettings();
            const activeSettings = allSettings.filter(setting => setting.isActive);

            // Group settings by category
            const settingsByCategory = activeSettings.reduce((acc, setting) => {
                const category = setting.value.category || 'general';
                if (!acc[category]) {
                    acc[category] = [];
                }
                acc[category].push(setting);
                return acc;
            }, {} as Record<string, any[]>);

            res.status(200).json({
                status: 'success',
                message: 'System settings status retrieved successfully',
                data: {
                    summary: {
                        totalSettings: allSettings.length,
                        activeSettings: activeSettings.length,
                        inactiveSettings: allSettings.length - activeSettings.length,
                        publicSettings: Object.keys(publicSettings).length,
                        categories: Object.keys(settingsByCategory).length,
                    },
                    settingsByCategory,
                    publicSettings,
                    lastUpdated: activeSettings.length > 0 ?
                        Math.max(...activeSettings.map(s => new Date(s.updatedAt).getTime())) :
                        null,
                },
            });

        } catch (error) {
            logger.error('Error getting system settings status:', error);
            throw error;
        }
    }

    /**
     * Drop all orders and related data (order trails, chat messages)
     */
    async dropOrders(req: Request, res: Response) {
        try {
            logger.info('🗑️ Starting orders cleanup process...');

            const results = await Database.transaction(async (transaction: Transaction) => {
                const deletedCounts = {
                    chatMessages: 0,
                    orderTrails: 0,
                    orders: 0,
                };

                // Delete in reverse order to respect foreign key constraints

                // 1. Delete Chat Messages related to orders
                const deletedChatMessages = await ChatMessage.destroy({
                    where: {},
                    transaction,
                    force: true, // Hard delete
                });
                deletedCounts.chatMessages = deletedChatMessages;
                logger.info(`🗑️ Deleted ${deletedChatMessages} chat messages`);

                // 2. Delete Order Trails
                const deletedOrderTrails = await OrderTrail.destroy({
                    where: {},
                    transaction,
                    force: true,
                });
                deletedCounts.orderTrails = deletedOrderTrails;
                logger.info(`🗑️ Deleted ${deletedOrderTrails} order trails`);

                // 3. Delete Orders
                const deletedOrders = await Order.destroy({
                    where: {},
                    transaction,
                    force: true,
                });
                deletedCounts.orders = deletedOrders;
                logger.info(`🗑️ Deleted ${deletedOrders} orders`);

                return deletedCounts;
            });

            logger.info('✅ Orders cleanup completed successfully');

            res.status(200).json({
                status: 'success',
                message: 'All orders and related data dropped successfully',
                data: {
                    deletedCounts: results,
                    totalDeleted: results.chatMessages + results.orderTrails + results.orders,
                    completedAt: new Date().toISOString(),
                },
            });

        } catch (error: any) {
            logger.error('❌ Orders cleanup failed:', error);

            res.status(error.statusCode || 500).json({
                status: 'error',
                message: error.message || 'Orders cleanup failed',
                error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            });
        }
    }

    /**
     * Seed comprehensive products for all markets
     * Ensures every market has at least 5 products
     */
    async seedMarketProducts(req: Request, res: Response) {
        try {
            logger.info('🚀 Starting comprehensive market products seeding...');

            // Get all markets
            const markets = await Market.findAll({
                include: [
                    {
                        model: Product,
                        as: 'products',
                    },
                ],
            });

            if (markets.length === 0) {
                return res.status(400).json({
                    status: 'error',
                    message: 'No markets found. Please seed markets first.',
                });
            }

            logger.info(`Found ${markets.length} markets to process`);

            // Product templates for different market types
            const productTemplates = {
                supermarket: [
                    {
                        name: 'Golden Penny Semovita 1kg',
                        description: 'Premium quality semovita flour for making swallow',
                        price: 850,
                        images: ['https://images.unsplash.com/photo-1586201375761-83865001e8c3?w=600&h=400&fit=crop'],
                        barcode: 'GP-SEMO-1KG',
                        sku: 'GP001',
                        stockQuantity: 150,
                        attributes: { weight: '1kg', brand: 'Golden Penny', type: 'Semovita' },
                        isAvailable: true,
                    },
                    {
                        name: 'Peak Milk Powder 400g',
                        description: 'Instant full cream milk powder, rich and creamy',
                        price: 2150,
                        images: ['https://images.unsplash.com/photo-1563636619-e9143da7973b?w=600&h=400&fit=crop'],
                        barcode: 'PEAK-MILK-400G',
                        sku: 'PEAK002',
                        stockQuantity: 200,
                        attributes: { weight: '400g', brand: 'Peak', type: 'Full Cream' },
                        isAvailable: true,
                    },
                    {
                        name: 'Indomie Instant Noodles (Chicken)',
                        description: 'Quick and delicious chicken-flavored instant noodles',
                        price: 150,
                        images: ['https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=600&h=400&fit=crop'],
                        barcode: 'INDO-CHICKEN-70G',
                        sku: 'INDO003',
                        stockQuantity: 500,
                        attributes: { weight: '70g', brand: 'Indomie', flavor: 'Chicken' },
                        isAvailable: true,
                    },
                    {
                        name: 'Gino Tomato Paste 70g',
                        description: 'Rich tomato paste for cooking soups and stews',
                        price: 200,
                        images: ['https://images.unsplash.com/photo-1546548970-71785318a17b?w=600&h=400&fit=crop'],
                        barcode: 'GINO-TP-70G',
                        sku: 'GINO004',
                        stockQuantity: 300,
                        attributes: { weight: '70g', brand: 'Gino', type: 'Tomato Paste' },
                        isAvailable: true,
                    },
                    {
                        name: 'Dangote Sugar 1kg',
                        description: 'Pure refined granulated white sugar',
                        price: 1100,
                        images: ['https://images.unsplash.com/photo-1587735243615-c03f25aaff15?w=600&h=400&fit=crop'],
                        barcode: 'DANG-SUGAR-1KG',
                        sku: 'DANG005',
                        stockQuantity: 180,
                        attributes: { weight: '1kg', brand: 'Dangote', type: 'Granulated Sugar' },
                        isAvailable: true,
                    },
                    {
                        name: 'Maggi Star Cube Seasoning',
                        description: 'Multi-purpose seasoning cubes for all Nigerian dishes',
                        price: 50,
                        images: ['https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&h=400&fit=crop'],
                        barcode: 'MAGGI-STAR-4G',
                        sku: 'MAG006',
                        stockQuantity: 600,
                        attributes: { pieces: '1 cube', brand: 'Maggi', type: 'Star Cube' },
                        isAvailable: true,
                    },
                    {
                        name: 'Honeywell Pasta 500g',
                        description: 'Premium quality spaghetti pasta',
                        price: 450,
                        images: ['https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=600&h=400&fit=crop'],
                        barcode: 'HON-PASTA-500G',
                        sku: 'HON007',
                        stockQuantity: 220,
                        attributes: { weight: '500g', brand: 'Honeywell', type: 'Spaghetti' },
                        isAvailable: true,
                    },
                    {
                        name: 'Devon Kings Vegetable Oil 750ml',
                        description: 'Pure vegetable cooking oil',
                        price: 1350,
                        images: ['https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&h=400&fit=crop'],
                        barcode: 'DEV-OIL-750ML',
                        sku: 'DEV008',
                        stockQuantity: 150,
                        attributes: { volume: '750ml', brand: 'Devon Kings', type: 'Vegetable Oil' },
                        isAvailable: true,
                    },
                ],
                local_market: [
                    {
                        name: 'Fresh Tomatoes (Big basket)',
                        description: 'Fresh local tomatoes, perfect for Nigerian soups and stews',
                        price: 3500,
                        images: ['https://images.unsplash.com/photo-1546548970-71785318a17b?w=600&h=400&fit=crop'],
                        stockQuantity: 50,
                        attributes: { quantity: 'Big basket', freshness: 'Farm fresh', origin: 'Local' },
                        isAvailable: true,
                    },
                    {
                        name: 'Scotch Bonnet Peppers (Ata rodo)',
                        description: 'Spicy fresh red peppers for authentic Nigerian dishes',
                        price: 1200,
                        images: ['https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=600&h=400&fit=crop'],
                        stockQuantity: 80,
                        attributes: { quantity: 'Medium bowl', spice: 'Very hot', freshness: 'Daily harvest' },
                        isAvailable: true,
                    },
                    {
                        name: 'Fresh Onions (Alubosa)',
                        description: 'Large fresh onions for cooking',
                        price: 2000,
                        images: ['https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=600&h=400&fit=crop'],
                        stockQuantity: 100,
                        attributes: { quantity: 'Big basket', size: 'Large', origin: 'Northern Nigeria' },
                        isAvailable: true,
                    },
                    {
                        name: 'Ugwu Leaves (Fluted Pumpkin)',
                        description: 'Fresh ugwu vegetable leaves, rich in nutrients',
                        price: 500,
                        images: ['https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&h=400&fit=crop'],
                        stockQuantity: 60,
                        attributes: { quantity: 'Bunch', freshness: 'Morning harvest', type: 'Fluted pumpkin' },
                        isAvailable: true,
                    },
                    {
                        name: 'Sweet Plantain (Ripe)',
                        description: 'Ripe sweet plantains, ready to fry or roast',
                        price: 1500,
                        images: ['https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=600&h=400&fit=crop'],
                        stockQuantity: 120,
                        attributes: { quantity: 'Bundle (8-10 pieces)', ripeness: 'Ripe', size: 'Large' },
                        isAvailable: true,
                    },
                    {
                        name: 'Fresh Yam Tubers',
                        description: 'Premium quality white yam tubers',
                        price: 4500,
                        images: ['https://images.unsplash.com/photo-1522930845072-7a72a7c352f5?w=600&h=400&fit=crop'],
                        stockQuantity: 40,
                        attributes: { quantity: '1 large tuber', size: 'Extra large', type: 'White yam' },
                        isAvailable: true,
                    },
                    {
                        name: 'Palm Oil (Red oil)',
                        description: 'Pure local palm oil, traditionally processed',
                        price: 2500,
                        images: ['https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&h=400&fit=crop'],
                        stockQuantity: 70,
                        attributes: { volume: '1 liter', processing: 'Traditional', purity: '100% pure' },
                        isAvailable: true,
                    },
                    {
                        name: 'Okra (Fresh)',
                        description: 'Fresh green okra for drawing soups',
                        price: 800,
                        images: ['https://images.unsplash.com/photo-1607623814075-e51df1bdc82f?w=600&h=400&fit=crop'],
                        stockQuantity: 90,
                        attributes: { quantity: 'Medium bowl', freshness: 'Farm fresh', size: 'Medium' },
                        isAvailable: true,
                    },
                ],
                pharmacy: [
                    {
                        name: 'Paracetamol 500mg Tablets',
                        description: 'Pain relief and fever reducer (Pack of 10)',
                        price: 150,
                        images: ['https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&h=400&fit=crop'],
                        barcode: 'PARA-500-10',
                        sku: 'MED001',
                        stockQuantity: 500,
                        attributes: { dosage: '500mg', quantity: '10 tablets', type: 'Analgesic' },
                        isAvailable: true,
                    },
                    {
                        name: 'Vitamin C 1000mg (30 tablets)',
                        description: 'Immune system support and antioxidant supplement',
                        price: 2500,
                        images: ['https://images.unsplash.com/photo-1550572017-4a6e8c8d3e8c?w=600&h=400&fit=crop'],
                        barcode: 'VITC-1000-30',
                        sku: 'SUP002',
                        stockQuantity: 200,
                        attributes: { dosage: '1000mg', quantity: '30 tablets', type: 'Supplement' },
                        isAvailable: true,
                    },
                    {
                        name: 'Hand Sanitizer 500ml',
                        description: 'Antibacterial hand sanitizer with 70% alcohol',
                        price: 1200,
                        images: ['https://images.unsplash.com/photo-1584483766041-8dd012a8e0e8?w=600&h=400&fit=crop'],
                        barcode: 'SANI-500-ALC',
                        sku: 'HYG003',
                        stockQuantity: 300,
                        attributes: { volume: '500ml', alcohol: '70%', type: 'Sanitizer' },
                        isAvailable: true,
                    },
                    {
                        name: 'Multivitamin Tablets (60 count)',
                        description: 'Daily multivitamin and mineral supplement',
                        price: 3500,
                        images: ['https://images.unsplash.com/photo-1550572017-4a6e8c8d3e8c?w=600&h=400&fit=crop'],
                        barcode: 'MULTI-VIT-60',
                        sku: 'SUP004',
                        stockQuantity: 150,
                        attributes: { quantity: '60 tablets', frequency: 'Daily', type: 'Multivitamin' },
                        isAvailable: true,
                    },
                    {
                        name: 'First Aid Kit (Complete)',
                        description: 'Comprehensive first aid kit with essential medical supplies',
                        price: 5500,
                        images: ['https://images.unsplash.com/photo-1603398938378-e54eab446dde?w=600&h=400&fit=crop'],
                        barcode: 'FAK-COMP-01',
                        sku: 'KIT005',
                        stockQuantity: 80,
                        attributes: { items: '50+ pieces', type: 'Emergency kit', case: 'Portable' },
                        isAvailable: true,
                    },
                    {
                        name: 'Face Masks (Surgical, 50pcs)',
                        description: '3-ply disposable surgical face masks',
                        price: 1800,
                        images: ['https://images.unsplash.com/photo-1603273220212-cd6f85eab779?w=600&h=400&fit=crop'],
                        barcode: 'MASK-3PLY-50',
                        sku: 'PPE006',
                        stockQuantity: 400,
                        attributes: { quantity: '50 pieces', layers: '3-ply', type: 'Disposable' },
                        isAvailable: true,
                    },
                    {
                        name: 'Antiseptic Liquid 500ml',
                        description: 'Multi-purpose antiseptic for wound cleaning',
                        price: 900,
                        images: ['https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=600&h=400&fit=crop'],
                        barcode: 'ANTI-LIQ-500',
                        sku: 'MED007',
                        stockQuantity: 250,
                        attributes: { volume: '500ml', type: 'Antiseptic', use: 'External' },
                        isAvailable: true,
                    },
                    {
                        name: 'Digital Thermometer',
                        description: 'Fast and accurate digital body thermometer',
                        price: 2200,
                        images: ['https://images.unsplash.com/photo-1585435557343-3b092031a831?w=600&h=400&fit=crop'],
                        barcode: 'THERM-DIG-01',
                        sku: 'DEV008',
                        stockQuantity: 120,
                        attributes: { type: 'Digital', accuracy: '±0.1°C', battery: 'Included' },
                        isAvailable: true,
                    },
                ],
                specialty_store: [
                    {
                        name: 'Organic Honey (500g)',
                        description: 'Pure raw organic honey from local beekeepers',
                        price: 4500,
                        images: ['https://images.unsplash.com/photo-1587049352846-4a222e784176?w=600&h=400&fit=crop'],
                        barcode: 'HON-ORG-500',
                        sku: 'ORG001',
                        stockQuantity: 100,
                        attributes: { weight: '500g', type: 'Raw honey', organic: true },
                        isAvailable: true,
                    },
                    {
                        name: 'Shea Butter (Natural, 250g)',
                        description: 'Premium quality unrefined African shea butter',
                        price: 2800,
                        images: ['https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=600&h=400&fit=crop'],
                        barcode: 'SHEA-NAT-250',
                        sku: 'NAT002',
                        stockQuantity: 150,
                        attributes: { weight: '250g', type: 'Unrefined', origin: 'Nigeria' },
                        isAvailable: true,
                    },
                    {
                        name: 'Moringa Powder (200g)',
                        description: 'Organic moringa leaf powder superfood supplement',
                        price: 3200,
                        images: ['https://images.unsplash.com/photo-1505576399279-565b52d4ac71?w=600&h=400&fit=crop'],
                        barcode: 'MOR-POW-200',
                        sku: 'SUP003',
                        stockQuantity: 80,
                        attributes: { weight: '200g', organic: true, type: 'Superfood' },
                        isAvailable: true,
                    },
                    {
                        name: 'African Black Soap (500g)',
                        description: 'Traditional handmade African black soap',
                        price: 1500,
                        images: ['https://images.unsplash.com/photo-1585838908481-8831d44ea3c1?w=600&h=400&fit=crop'],
                        barcode: 'SOAP-BLK-500',
                        sku: 'SOAP004',
                        stockQuantity: 200,
                        attributes: { weight: '500g', handmade: true, natural: true },
                        isAvailable: true,
                    },
                    {
                        name: 'Coconut Oil (Cold Pressed, 500ml)',
                        description: 'Extra virgin cold-pressed coconut oil',
                        price: 3800,
                        images: ['https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=600&h=400&fit=crop'],
                        barcode: 'COCO-OIL-500',
                        sku: 'OIL005',
                        stockQuantity: 120,
                        attributes: { volume: '500ml', processing: 'Cold pressed', virgin: true },
                        isAvailable: true,
                    },
                    {
                        name: 'Ginger Tea (Organic, 100g)',
                        description: 'Premium organic ginger tea blend',
                        price: 2200,
                        images: ['https://images.unsplash.com/photo-1597318181592-63ec5e4ef8e1?w=600&h=400&fit=crop'],
                        barcode: 'TEA-GING-100',
                        sku: 'TEA006',
                        stockQuantity: 150,
                        attributes: { weight: '100g', organic: true, caffeine: 'Free' },
                        isAvailable: true,
                    },
                    {
                        name: 'Turmeric Powder (Organic, 150g)',
                        description: 'Pure organic turmeric powder with high curcumin',
                        price: 2500,
                        images: ['https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=600&h=400&fit=crop'],
                        barcode: 'TURM-POW-150',
                        sku: 'SPI007',
                        stockQuantity: 100,
                        attributes: { weight: '150g', organic: true, curcumin: 'High' },
                        isAvailable: true,
                    },
                    {
                        name: 'Aloe Vera Gel (Pure, 250ml)',
                        description: '100% pure aloe vera gel for skin and hair',
                        price: 1800,
                        images: ['https://images.unsplash.com/photo-1620916244616-598775e33f70?w=600&h=400&fit=crop'],
                        barcode: 'ALOE-GEL-250',
                        sku: 'GEL008',
                        stockQuantity: 180,
                        attributes: { volume: '250ml', purity: '100%', use: 'Multipurpose' },
                        isAvailable: true,
                    },
                ],
            };

            const seededResults = {
                marketsProcessed: 0,
                marketsSkipped: 0,
                totalProductsAdded: 0,
                marketDetails: [] as any[],
            };

            // Process each market
            for (const market of markets) {
                const existingProductsCount = market.products?.length || 0;
                const minimumProducts = 5;

                if (existingProductsCount >= minimumProducts) {
                    logger.info(`✅ Market "${market.name || market.address}" already has ${existingProductsCount} products. Skipping...`);
                    seededResults.marketsSkipped++;
                    continue;
                }

                const productsNeeded = minimumProducts - existingProductsCount;
                logger.info(`📦 Market "${market.name || market.address}" needs ${productsNeeded} more products`);

                // Get appropriate product template based on market type
                const templates = productTemplates[market.marketType] || productTemplates.supermarket;

                // Shuffle templates to get variety
                const shuffled = templates.sort(() => 0.5 - Math.random());
                const selectedTemplates = shuffled.slice(0, productsNeeded);

                let productsAdded = 0;
                for (const template of selectedTemplates) {
                    try {
                        await Product.create({
                            ...template,
                            marketId: market.id,
                        });
                        productsAdded++;
                        logger.info(`  ✅ Added "${template.name}" to ${market.name || market.address}`);
                    } catch (error: any) {
                        logger.error(`  ❌ Failed to add product: ${error.message}`);
                    }
                }

                seededResults.marketsProcessed++;
                seededResults.totalProductsAdded += productsAdded;
                seededResults.marketDetails.push({
                    marketName: market.name || market.address,
                    marketType: market.marketType,
                    previousProductCount: existingProductsCount,
                    productsAdded: productsAdded,
                    newTotalProducts: existingProductsCount + productsAdded,
                });
            }

            logger.info('✅ Market products seeding completed successfully');

            res.status(200).json({
                status: 'success',
                message: 'Market products seeded successfully',
                data: {
                    summary: {
                        totalMarkets: markets.length,
                        marketsProcessed: seededResults.marketsProcessed,
                        marketsSkipped: seededResults.marketsSkipped,
                        totalProductsAdded: seededResults.totalProductsAdded,
                    },
                    marketDetails: seededResults.marketDetails,
                },
            });

        } catch (error: any) {
            logger.error('❌ Market products seeding failed:', error);

            res.status(error.statusCode || 500).json({
                status: 'error',
                message: error.message || 'Market products seeding failed',
                error: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            });
        }
    }

}

export default new SeederController();