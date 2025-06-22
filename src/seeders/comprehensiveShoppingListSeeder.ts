import ShoppingList from '../models/shoppingList.model';
import ShoppingListItem from '../models/shoppingListItem.model';
import User from '../models/user.model';
import Market from '../models/market.model';
import Product from '../models/product.model';
import { logger } from '../utils/logger';
import { Op } from 'sequelize';

interface ShoppingListTemplate {
    name: string;
    notes: string;
    category: string;
    tags: string[];
    estimatedTime: string;
    estimatedCost: string;
    marketType: string;
    image: string;
    isPopular: boolean;
    sortOrder: number;
    listType: 'suggested' | 'personal';
    items: Array<{
        productName: string; // We'll search by name
        quantity: number;
        unit: string;
        notes?: string;
        userProvidedPrice?: number; // For local market items
    }>;
}

const suggestedListTemplates: ShoppingListTemplate[] = [
    {
        name: "Today's Essential Shopping List",
        notes: 'Everything you need for today - curated by our shopping experts',
        category: 'daily_essentials',
        tags: ['today', 'essential', 'curated'],
        estimatedTime: '1-2 hours',
        estimatedCost: '₦8,000 - ₦15,000',
        marketType: 'supermarket',
        image: '/images/todays-essentials.jpg',
        isPopular: true,
        sortOrder: 1,
        listType: 'suggested',
        items: [
            { productName: 'Rice', quantity: 2, unit: 'kg' },
            { productName: 'Bread', quantity: 2, unit: 'loaves' },
            { productName: 'Milk', quantity: 2, unit: 'cartons' },
            { productName: 'Eggs', quantity: 12, unit: 'pieces' },
            { productName: 'Oil', quantity: 1, unit: 'bottle' },
            { productName: 'Tomato', quantity: 5, unit: 'pieces' },
            { productName: 'Onion', quantity: 3, unit: 'pieces' },
            { productName: 'Chicken', quantity: 1, unit: 'kg' },
        ]
    },
    {
        name: "Weekend Family Feast",
        notes: 'Perfect ingredients for a wonderful weekend family meal',
        category: 'family_meal',
        tags: ['weekend', 'family', 'feast'],
        estimatedTime: '2-3 hours',
        estimatedCost: '₦12,000 - ₦20,000',
        marketType: 'supermarket',
        image: '/images/family-feast.jpg',
        isPopular: true,
        sortOrder: 2,
        listType: 'suggested',
        items: [
            { productName: 'Fish', quantity: 2, unit: 'kg' },
            { productName: 'Rice', quantity: 3, unit: 'kg' },
            { productName: 'Vegetables', quantity: 1, unit: 'basket' },
            { productName: 'Spices', quantity: 1, unit: 'set' },
            { productName: 'Fruit', quantity: 1, unit: 'basket' },
            { productName: 'Drinks', quantity: 4, unit: 'bottles' },
        ]
    },
    {
        name: "Local Market Fresh Finds",
        notes: 'Fresh local produce where you set your own price expectations',
        category: 'local_fresh',
        tags: ['local', 'fresh', 'flexible_pricing'],
        estimatedTime: '1-1.5 hours',
        estimatedCost: 'Price varies - set your budget',
        marketType: 'local_market',
        image: '/images/local-market.jpg',
        isPopular: false,
        sortOrder: 3,
        listType: 'suggested',
        items: [
            { productName: 'Tomato', quantity: 10, unit: 'pieces', userProvidedPrice: 1500 },
            { productName: 'Pepper', quantity: 5, unit: 'pieces', userProvidedPrice: 800 },
            { productName: 'Onion', quantity: 8, unit: 'pieces', userProvidedPrice: 1200 },
            { productName: 'Vegetables', quantity: 2, unit: 'bunches', userProvidedPrice: 2000 },
            { productName: 'Plantain', quantity: 6, unit: 'pieces', userProvidedPrice: 1800 },
            { productName: 'Yam', quantity: 2, unit: 'tubers', userProvidedPrice: 3000 },
        ]
    },
    {
        name: "Quick Breakfast Essentials",
        notes: 'Start your day right with these breakfast must-haves',
        category: 'breakfast',
        tags: ['breakfast', 'quick', 'morning'],
        estimatedTime: '30-45 mins',
        estimatedCost: '₦3,500 - ₦6,000',
        marketType: 'supermarket',
        image: '/images/breakfast.jpg',
        isPopular: true,
        sortOrder: 4,
        listType: 'suggested',
        items: [
            { productName: 'Bread', quantity: 2, unit: 'loaves' },
            { productName: 'Butter', quantity: 1, unit: 'pack' },
            { productName: 'Jam', quantity: 1, unit: 'jar' },
            { productName: 'Eggs', quantity: 6, unit: 'pieces' },
            { productName: 'Milk', quantity: 1, unit: 'carton' },
            { productName: 'Cereal', quantity: 1, unit: 'box' },
            { productName: 'Banana', quantity: 6, unit: 'pieces' },
        ]
    }
];

// Personal shopping list templates for users
const personalListTemplates: ShoppingListTemplate[] = [
    {
        name: "My Weekly Groceries",
        notes: 'My regular weekly shopping list',
        category: 'personal_weekly',
        tags: ['weekly', 'personal', 'routine'],
        estimatedTime: '1.5-2 hours',
        estimatedCost: '₦10,000 - ₦18,000',
        marketType: 'supermarket',
        image: '/images/weekly-groceries.jpg',
        isPopular: false,
        sortOrder: 1,
        listType: 'personal',
        items: [
            { productName: 'Rice', quantity: 5, unit: 'kg' },
            { productName: 'Beans', quantity: 2, unit: 'kg' },
            { productName: 'Oil', quantity: 1, unit: 'bottle' },
            { productName: 'Tomato', quantity: 8, unit: 'pieces' },
            { productName: 'Onion', quantity: 5, unit: 'pieces' },
            { productName: 'Meat', quantity: 2, unit: 'kg' },
            { productName: 'Fish', quantity: 1, unit: 'kg' },
        ]
    },
    {
        name: "Local Market Shopping",
        notes: 'Shopping from my local market with custom prices',
        category: 'local_personal',
        tags: ['local', 'personal', 'budget'],
        estimatedTime: '1 hour',
        estimatedCost: 'Custom pricing',
        marketType: 'local_market',
        image: '/images/local-personal.jpg',
        isPopular: false,
        sortOrder: 2,
        listType: 'personal',
        items: [
            { productName: 'Pepper', quantity: 10, unit: 'pieces', userProvidedPrice: 1000 },
            { productName: 'Tomato', quantity: 15, unit: 'pieces', userProvidedPrice: 2000 },
            { productName: 'Plantain', quantity: 8, unit: 'pieces', userProvidedPrice: 2400 },
            { productName: 'Yam', quantity: 3, unit: 'tubers', userProvidedPrice: 4500 },
            { productName: 'Vegetables', quantity: 3, unit: 'bunches', userProvidedPrice: 2500 },
        ]
    }
];

export class ComprehensiveShoppingListSeeder {

    static async clearExistingData(): Promise<void> {
        try {
            logger.info('🧹 Clearing existing shopping list data...');

            // Delete all shopping list items first (due to foreign key constraints)
            const itemsDeleted = await ShoppingListItem.destroy({
                where: {},
                truncate: true,
                cascade: true
            });

            // Delete all shopping lists
            const listsDeleted = await ShoppingList.destroy({
                where: {},
                truncate: true,
                cascade: true
            });

            logger.info(`🗑️ Cleared ${itemsDeleted} shopping list items and ${listsDeleted} shopping lists`);

        } catch (error) {
            logger.error('❌ Error clearing existing data:', error);
            throw error;
        }
    }

    static async findProductByName(productName: string, marketType: string = 'supermarket'): Promise<Product | null> {
        try {
            // Find product by name with fuzzy matching
            const product = await Product.findOne({
                where: {
                    name: {
                        [Op.iLike]: `%${productName}%`
                    },
                    isAvailable: true
                },
                include: [{
                    model: Market,
                    as: 'market',
                    where: {
                        marketType: marketType === 'local_market' ? 'local_market' : {
                            [Op.ne]: 'local_market'
                        }
                    },
                    required: false
                }],
                order: [
                    [
                        Product.sequelize?.literal(
                            `CASE WHEN LOWER("Product"."name") = LOWER('${productName}') THEN 0 ELSE 1 END`
                        ) as any, 'ASC'
                    ]
                ]
            });

            return product;
        } catch (error) {
            logger.error(`❌ Error finding product "${productName}":`, error);
            return null;
        }
    }

    static async createShoppingListFromTemplate(
        template: ShoppingListTemplate,
        customerId: string,
        marketId?: string
    ): Promise<ShoppingList | null> {
        try {
            logger.info(`📝 Creating shopping list: "${template.name}"`);

            // Create the shopping list
            const shoppingList = await ShoppingList.create({
                name: template.name,
                notes: template.notes,
                customerId: customerId,
                marketId: marketId,
                status: 'draft',
                creatorType: template.listType === 'suggested' ? 'system' : 'user',
                listType: template.listType,
                category: template.category,
                tags: template.tags,
                estimatedTime: template.estimatedTime,
                estimatedCost: template.estimatedCost,
                marketType: template.marketType,
                image: template.image,
                isPopular: template.isPopular,
                isActive: true,
                sortOrder: template.sortOrder,
                createdBy: customerId,
                isReadOnly: template.listType === 'suggested', // Make suggested lists read-only
            });

            // Add items to the list
            let itemsCreated = 0;
            let estimatedTotal = 0;

            for (const itemTemplate of template.items) {
                // Find the product
                const product = await this.findProductByName(itemTemplate.productName, template.marketType);

                let estimatedPrice: number | null = null;
                let userProvidedPrice: number | null = null;

                if (product) {
                    if (product.price !== null) {
                        // Product has a preset price
                        estimatedPrice = product.discountPrice || product.price;
                    } else if (itemTemplate.userProvidedPrice) {
                        // Product has no price, use user-provided price
                        userProvidedPrice = itemTemplate.userProvidedPrice;
                    }
                } else if (itemTemplate.userProvidedPrice) {
                    // No product found, but we have a user-provided price
                    userProvidedPrice = itemTemplate.userProvidedPrice;
                }

                // Create the shopping list item
                const item = await ShoppingListItem.create({
                    name: itemTemplate.productName,
                    quantity: itemTemplate.quantity,
                    unit: itemTemplate.unit,
                    notes: itemTemplate.notes || null,
                    estimatedPrice: estimatedPrice,
                    userProvidedPrice: userProvidedPrice,
                    productId: product?.id || null,
                    shoppingListId: shoppingList.id,
                });

                // Calculate estimated total
                const priceToUse = estimatedPrice || userProvidedPrice || 0;
                estimatedTotal += priceToUse * itemTemplate.quantity;
                itemsCreated++;

                if (product) {
                    logger.info(`  ✅ Added "${itemTemplate.productName}" (linked to product: ${product.name})`);
                } else {
                    logger.info(`  ⚠️  Added "${itemTemplate.productName}" (no product link, price: ₦${userProvidedPrice || 0})`);
                }
            }

            // Update the estimated total
            await shoppingList.update({ estimatedTotal });

            logger.info(`✅ Created "${template.name}" with ${itemsCreated} items (Total: ₦${estimatedTotal})`);
            return shoppingList;

        } catch (error) {
            logger.error(`❌ Error creating shopping list "${template.name}":`, error);
            return null;
        }
    }

    static async seedSuggestedLists(): Promise<void> {
        try {
            logger.info('🌱 Seeding suggested shopping lists...');

            // Get a system user (admin or create one)
            let systemUser = await User.findOne({
                where: {
                    email: {
                        [Op.iLike]: '%admin%'
                    }
                }
            });

            if (!systemUser) {
                systemUser = await User.findOne() || await User.create({
                    email: 'system@busy2shop.com',
                    firstName: 'System',
                    lastName: 'Admin',
                    status: {
                        activated: true,
                        emailVerified: true,
                        userType: 'customer'
                    }
                });
            }

            // Get markets for different types
            const supermarket = await Market.findOne({
                where: {
                    marketType: {
                        [Op.ne]: 'local_market'
                    }
                }
            });

            const localMarket = await Market.findOne({
                where: {
                    marketType: 'local_market'
                }
            });

            let suggestedCount = 0;

            for (const template of suggestedListTemplates) {
                const marketToUse = template.marketType === 'local_market' ? localMarket : supermarket;

                const list = await this.createShoppingListFromTemplate(
                    template,
                    systemUser.id,
                    marketToUse?.id
                );

                if (list) {
                    suggestedCount++;
                }
            }

            logger.info(`🎉 Successfully seeded ${suggestedCount} suggested shopping lists!`);

        } catch (error) {
            logger.error('❌ Error seeding suggested lists:', error);
            throw error;
        }
    }

    static async seedPersonalLists(): Promise<void> {
        try {
            logger.info('👤 Seeding personal shopping lists for users...');

            // Get some regular users
            const users = await User.findAll({
                where: {
                    status: {
                        userType: 'customer'
                    }
                },
                limit: 3
            });

            if (users.length === 0) {
                logger.warn('⚠️ No users found to create personal lists for');
                return;
            }

            const supermarket = await Market.findOne({
                where: {
                    marketType: {
                        [Op.ne]: 'local_market'
                    }
                }
            });

            const localMarket = await Market.findOne({
                where: {
                    marketType: 'local_market'
                }
            });

            let personalCount = 0;

            for (const user of users) {
                for (const template of personalListTemplates) {
                    const marketToUse = template.marketType === 'local_market' ? localMarket : supermarket;

                    const list = await this.createShoppingListFromTemplate(
                        {
                            ...template,
                            name: `${template.name} - ${user.firstName}`,
                            notes: `${template.notes} (Personal list for ${user.firstName})`
                        },
                        user.id,
                        marketToUse?.id
                    );

                    if (list) {
                        personalCount++;
                    }
                }
            }

            logger.info(`👥 Successfully seeded ${personalCount} personal shopping lists!`);

        } catch (error) {
            logger.error('❌ Error seeding personal lists:', error);
            throw error;
        }
    }

    static async seedTestScenarios(): Promise<void> {
        try {
            logger.info('🧪 Creating test scenarios...');

            // Get or create a test user
            let testUser = await User.findOne({
                where: {
                    email: 'test@busy2shop.com'
                }
            });

            if (!testUser) {
                testUser = await User.create({
                    email: 'test@busy2shop.com',
                    firstName: 'Test',
                    lastName: 'User',
                    status: {
                        activated: true,
                        emailVerified: true,
                        userType: 'customer'
                    }
                });
            }

            const localMarket = await Market.findOne({
                where: {
                    marketType: 'local_market'
                }
            });

            // Create a test scenario: Copy suggested list to personal
            const suggestedList = await ShoppingList.findOne({
                where: {
                    listType: 'suggested',
                    name: "Today's Essential Shopping List"
                }
            });

            if (suggestedList) {
                const copiedList = await ShoppingList.create({
                    name: "My Copy of Today's Essentials",
                    notes: "Copied from suggested list and customized",
                    customerId: testUser.id,
                    marketId: localMarket?.id,
                    status: 'draft',
                    creatorType: 'user',
                    listType: 'personal',
                    category: 'personal_copy',
                    tags: ['copied', 'personal', 'customized'],
                    estimatedTime: '1-2 hours',
                    estimatedCost: 'Custom budget',
                    marketType: 'local_market',
                    image: '/images/copied-list.jpg',
                    isPopular: false,
                    isActive: true,
                    sortOrder: 1,
                    createdBy: testUser.id,
                    isReadOnly: false,
                    sourceSuggestedListId: suggestedList.id, // Track the source
                });

                logger.info(`🔗 Created test copy scenario: "${copiedList.name}" sourced from "${suggestedList.name}"`);
            }

            logger.info('🧪 Test scenarios created successfully!');

        } catch (error) {
            logger.error('❌ Error creating test scenarios:', error);
            throw error;
        }
    }

    static async run(): Promise<void> {
        try {
            logger.info('🚀 Starting comprehensive shopping list seeding...');

            // Step 1: Clear existing data
            await this.clearExistingData();

            // Step 2: Seed suggested lists
            await this.seedSuggestedLists();

            // Step 3: Seed personal lists for users
            await this.seedPersonalLists();

            // Step 4: Create test scenarios
            await this.seedTestScenarios();

            logger.info('🎉 Comprehensive shopping list seeding completed successfully!');

            // Print summary
            const totalLists = await ShoppingList.count();
            const totalItems = await ShoppingListItem.count();
            const suggestedLists = await ShoppingList.count({ where: { listType: 'suggested' } });
            const personalLists = await ShoppingList.count({ where: { listType: 'personal' } });
            const listsWithProducts = await ShoppingListItem.count({ where: { productId: { [Op.ne]: null } } });
            const listsWithUserPrices = await ShoppingListItem.count({ where: { userProvidedPrice: { [Op.ne]: null } } });

            logger.info(`
📊 SEEDING SUMMARY:
   📝 Total Shopping Lists: ${totalLists}
   📦 Total Items: ${totalItems}
   🎯 Suggested Lists: ${suggestedLists}
   👤 Personal Lists: ${personalLists}
   🔗 Items linked to products: ${listsWithProducts}
   💰 Items with user-provided prices: ${listsWithUserPrices}
            `);

        } catch (error) {
            logger.error('❌ Comprehensive seeding failed:', error);
            throw error;
        }
    }

    static async clear(): Promise<void> {
        await this.clearExistingData();
    }
}

export default ComprehensiveShoppingListSeeder; 