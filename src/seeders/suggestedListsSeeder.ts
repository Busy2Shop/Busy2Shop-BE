import ShoppingList from '../models/shoppingList.model';
import ShoppingListItem from '../models/shoppingListItem.model';
import User from '../models/user.model';
import Market from '../models/market.model';
import { logger } from '../utils/logger';

interface SuggestedListData {
    name: string;
    notes: string;
    category: string;
    tags: string[];
    estimatedTime: string;
    estimatedCost: string;
    minPrice: number;
    maxPrice: number;
    marketType: string;
    image: string;
    isPopular: boolean;
    sortOrder: number;
    items: Array<{
        name: string;
        quantity: number;
        unit: string;
        estimatedPrice: number;
    }>;
}

const suggestedListsData: SuggestedListData[] = [
    {
        name: 'Weekly Grocery Essentials',
        notes: 'Everything you need for a week of home cooking and family meals',
        category: 'grocery',
        tags: ['essential', 'weekly', 'family'],
        estimatedTime: '2-3 hours',
        estimatedCost: '₦8,500 - ₦12,000',
        minPrice: 8500,
        maxPrice: 12000,
        marketType: 'Supermarket',
        image: '/images/weekly-groceries.jpg',
        isPopular: true,
        sortOrder: 1,
        items: [
            { name: 'Rice (5kg bag)', quantity: 1, unit: 'bag', estimatedPrice: 2500 },
            { name: 'Beans', quantity: 2, unit: 'cups', estimatedPrice: 1500 },
            { name: 'Fresh Tomatoes', quantity: 5, unit: 'pieces', estimatedPrice: 800 },
            { name: 'Onions', quantity: 3, unit: 'pieces', estimatedPrice: 500 },
            { name: 'Cooking Oil', quantity: 1, unit: 'bottle', estimatedPrice: 1800 },
            { name: 'Salt', quantity: 1, unit: 'pack', estimatedPrice: 200 },
            { name: 'Fresh Milk', quantity: 2, unit: 'cartons', estimatedPrice: 1200 },
            { name: 'Bread', quantity: 2, unit: 'loaves', estimatedPrice: 500 },
            { name: 'Eggs', quantity: 12, unit: 'pieces', estimatedPrice: 1500 },
            { name: 'Chicken', quantity: 1, unit: 'kg', estimatedPrice: 2000 },
        ]
    },
    {
        name: 'Healthy Living Basket',
        notes: 'Fresh ingredients for nutritious meals and healthy lifestyle',
        category: 'health',
        tags: ['healthy', 'fresh', 'organic'],
        estimatedTime: '1-2 hours',
        estimatedCost: '₦6,000 - ₦10,000',
        minPrice: 6000,
        maxPrice: 10000,
        marketType: 'Fresh Market',
        image: '/images/healthy-basket.jpg',
        isPopular: false,
        sortOrder: 2,
        items: [
            { name: 'Mixed Vegetables', quantity: 1, unit: 'bunch', estimatedPrice: 1000 },
            { name: 'Fresh Fruits', quantity: 1, unit: 'basket', estimatedPrice: 1500 },
            { name: 'Fish', quantity: 1, unit: 'kg', estimatedPrice: 2500 },
            { name: 'Whole Grain Bread', quantity: 1, unit: 'loaf', estimatedPrice: 800 },
            { name: 'Nuts & Seeds', quantity: 1, unit: 'pack', estimatedPrice: 1200 },
            { name: 'Greek Yogurt', quantity: 2, unit: 'cups', estimatedPrice: 1000 },
            { name: 'Avocado', quantity: 3, unit: 'pieces', estimatedPrice: 900 },
            { name: 'Spinach', quantity: 1, unit: 'bunch', estimatedPrice: 300 },
        ]
    },
    {
        name: 'Weekend Party Essentials',
        notes: 'Everything you need to host a perfect weekend gathering',
        category: 'entertainment',
        tags: ['party', 'weekend', 'social'],
        estimatedTime: '1-2 hours',
        estimatedCost: '₦15,000 - ₦25,000',
        minPrice: 15000,
        maxPrice: 25000,
        marketType: 'Local Market',
        image: '/images/party-supplies.jpg',
        isPopular: true,
        sortOrder: 3,
        items: [
            { name: 'Soft Drinks', quantity: 6, unit: 'bottles', estimatedPrice: 3000 },
            { name: 'Snacks Variety Pack', quantity: 3, unit: 'packs', estimatedPrice: 2500 },
            { name: 'Ice Blocks', quantity: 2, unit: 'bags', estimatedPrice: 1000 },
            { name: 'Disposable Cups', quantity: 50, unit: 'pieces', estimatedPrice: 800 },
            { name: 'Napkins', quantity: 5, unit: 'packs', estimatedPrice: 500 },
            { name: 'Grilled Meat', quantity: 2, unit: 'kg', estimatedPrice: 8000 },
            { name: 'Seasoning & Spices', quantity: 1, unit: 'set', estimatedPrice: 1500 },
            { name: 'Plastic Plates', quantity: 20, unit: 'pieces', estimatedPrice: 700 },
        ]
    },
    {
        name: 'Breakfast for the Week',
        notes: 'Start every morning right with these nutritious breakfast essentials',
        category: 'breakfast',
        tags: ['morning', 'quick', 'essential'],
        estimatedTime: '30-45 mins',
        estimatedCost: '₦4,500 - ₦7,000',
        minPrice: 4500,
        maxPrice: 7000,
        marketType: 'Supermarket',
        image: '/images/breakfast-essentials.jpg',
        isPopular: true,
        sortOrder: 4,
        items: [
            { name: 'Fresh Eggs', quantity: 12, unit: 'pieces', estimatedPrice: 1500 },
            { name: 'Sliced Bread', quantity: 2, unit: 'loaves', estimatedPrice: 800 },
            { name: 'Butter', quantity: 1, unit: 'pack', estimatedPrice: 600 },
            { name: 'Jam/Honey', quantity: 1, unit: 'jar', estimatedPrice: 800 },
            { name: 'Cereals', quantity: 1, unit: 'box', estimatedPrice: 1200 },
            { name: 'Fresh Milk', quantity: 2, unit: 'cartons', estimatedPrice: 1200 },
            { name: 'Bananas', quantity: 6, unit: 'pieces', estimatedPrice: 600 },
            { name: 'Tea/Coffee', quantity: 1, unit: 'pack', estimatedPrice: 800 },
        ]
    },
    {
        name: 'Student Budget Pack',
        notes: 'Affordable essentials for students on a tight budget',
        category: 'budget',
        tags: ['budget', 'student', 'affordable'],
        estimatedTime: '45 mins',
        estimatedCost: '₦2,500 - ₦4,000',
        minPrice: 2500,
        maxPrice: 4000,
        marketType: 'Local Market',
        image: '/images/student-budget.jpg',
        isPopular: true,
        sortOrder: 5,
        items: [
            { name: 'Instant Noodles', quantity: 10, unit: 'packs', estimatedPrice: 1000 },
            { name: 'Rice', quantity: 2, unit: 'cups', estimatedPrice: 800 },
            { name: 'Beans', quantity: 1, unit: 'cup', estimatedPrice: 400 },
            { name: 'Eggs', quantity: 6, unit: 'pieces', estimatedPrice: 750 },
            { name: 'Onions', quantity: 2, unit: 'pieces', estimatedPrice: 300 },
            { name: 'Tomatoes', quantity: 3, unit: 'pieces', estimatedPrice: 450 },
            { name: 'Cooking Oil (small)', quantity: 1, unit: 'bottle', estimatedPrice: 800 },
            { name: 'Salt', quantity: 1, unit: 'pack', estimatedPrice: 200 },
        ]
    },
    {
        name: 'Baby Care Essentials',
        notes: 'Everything you need for your little one\'s care and nutrition',
        category: 'baby',
        tags: ['baby', 'care', 'essential'],
        estimatedTime: '1 hour',
        estimatedCost: '₦8,000 - ₦15,000',
        minPrice: 8000,
        maxPrice: 15000,
        marketType: 'Pharmacy/Supermarket',
        image: '/images/baby-care.jpg',
        isPopular: false,
        sortOrder: 6,
        items: [
            { name: 'Baby Food', quantity: 3, unit: 'jars', estimatedPrice: 2400 },
            { name: 'Diapers', quantity: 1, unit: 'pack', estimatedPrice: 3500 },
            { name: 'Baby Formula', quantity: 1, unit: 'tin', estimatedPrice: 4000 },
            { name: 'Wet Wipes', quantity: 3, unit: 'packs', estimatedPrice: 1800 },
            { name: 'Baby Oil', quantity: 1, unit: 'bottle', estimatedPrice: 800 },
            { name: 'Baby Soap', quantity: 1, unit: 'pack', estimatedPrice: 600 },
            { name: 'Baby Powder', quantity: 1, unit: 'bottle', estimatedPrice: 700 },
        ]
    }
];

export class SuggestedListsSeeder {

    static async seed(): Promise<void> {
        try {
            logger.info('🌱 Starting suggested lists seeding...');

            // Check if we have any admin users
            const adminUser = await User.findOne({
                where: { userType: 'admin' }
            });

            if (!adminUser) {
                logger.error('❌ No admin user found. Please create an admin user first.');
                return;
            }

            logger.info(`✅ Found admin user: ${adminUser.name}`);

            // Get first available market (optional)
            const market = await Market.findOne();

            let seedCount = 0;

            for (const listData of suggestedListsData) {
                // Check if this suggested list already exists
                const existingList = await ShoppingList.findOne({
                    where: {
                        name: listData.name,
                        listType: 'suggested'
                    }
                });

                if (existingList) {
                    logger.info(`⏭️  Skipping "${listData.name}" - already exists`);
                    continue;
                }

                // Create the suggested shopping list
                const shoppingList = await ShoppingList.create({
                    name: listData.name,
                    notes: listData.notes,
                    customerId: adminUser.id,
                    marketId: market?.id || null,
                    status: 'draft',
                    creatorType: 'system',
                    listType: 'suggested',
                    category: listData.category,
                    tags: listData.tags,
                    estimatedTime: listData.estimatedTime,
                    estimatedCost: listData.estimatedCost,
                    minPrice: listData.minPrice,
                    maxPrice: listData.maxPrice,
                    marketType: listData.marketType,
                    image: listData.image,
                    isPopular: listData.isPopular,
                    isActive: true,
                    sortOrder: listData.sortOrder,
                    createdBy: adminUser.id,
                });

                // Add items to the list
                const items = await Promise.all(
                    listData.items.map(itemData =>
                        ShoppingListItem.create({
                            name: itemData.name,
                            quantity: itemData.quantity,
                            unit: itemData.unit,
                            estimatedPrice: itemData.estimatedPrice,
                            shoppingListId: shoppingList.id,
                            notes: null,
                            actualPrice: null,
                            productId: null,
                        })
                    )
                );

                seedCount++;
                logger.info(`✅ Created "${listData.name}" with ${items.length} items`);
            }

            logger.info(`🎉 Seeding completed! Created ${seedCount} suggested shopping lists.`);

        } catch (error) {
            logger.error('❌ Error seeding suggested lists:', error);
            throw error;
        }
    }

    static async clear(): Promise<void> {
        try {
            logger.info('🧹 Clearing existing suggested lists...');

            // Delete all suggested lists and their items (cascade should handle items)
            const deletedCount = await ShoppingList.destroy({
                where: {
                    listType: 'suggested'
                }
            });

            logger.info(`🗑️  Deleted ${deletedCount} suggested lists`);

        } catch (error) {
            logger.error('❌ Error clearing suggested lists:', error);
            throw error;
        }
    }

    static async reseed(): Promise<void> {
        await this.clear();
        await this.seed();
    }
}

// Export for direct use
export default SuggestedListsSeeder; 