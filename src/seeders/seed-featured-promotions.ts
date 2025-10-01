import FeaturedPromotion from '../models/featuredPromotion.model';
import { logger } from '../utils/logger';
import { Database } from '../models';

export const defaultPromotions = [
    {
        title: 'Computer Village',
        subtitle: 'Tech gadgets & accessories',
        icon: 'Laptop',
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/2972/2972351.png',
        backgroundColor: '#3B82F6',
        backgroundGradient: {
            from: '#3B82F6',
            to: '#1E40AF',
            direction: 'to-br'
        },
        searchQuery: 'Computer Village',
        searchType: 'location' as const,
        searchFilters: {
            location: 'Computer Village, Ikeja'
        },
        displayOrder: 1,
        isActive: true,
        metadata: {
            area: 'Ikeja',
            state: 'Lagos'
        }
    },
    {
        title: 'Alaba International',
        subtitle: 'Electronics & home appliances',
        icon: 'Tv',
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/2913/2913133.png',
        backgroundColor: '#8B5CF6',
        backgroundGradient: {
            from: '#8B5CF6',
            to: '#6D28D9',
            direction: 'to-br'
        },
        searchQuery: 'Alaba International Market',
        searchType: 'location' as const,
        searchFilters: {
            location: 'Alaba International Market'
        },
        displayOrder: 2,
        isActive: true,
        metadata: {
            area: 'Ojo',
            state: 'Lagos'
        }
    },
    {
        title: 'Balogun Market',
        subtitle: 'Fashion & fabrics',
        icon: 'ShoppingBag',
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/2331/2331970.png',
        backgroundColor: '#EC4899',
        backgroundGradient: {
            from: '#EC4899',
            to: '#BE185D',
            direction: 'to-br'
        },
        searchQuery: 'Balogun Market',
        searchType: 'location' as const,
        searchFilters: {
            location: 'Balogun Market, Lagos Island'
        },
        displayOrder: 3,
        isActive: true,
        metadata: {
            area: 'Lagos Island',
            state: 'Lagos'
        }
    },
    {
        title: 'Trade Fair',
        subtitle: 'Wholesale shopping hub',
        icon: 'Package',
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/3227/3227786.png',
        backgroundColor: '#F59E0B',
        backgroundGradient: {
            from: '#F59E0B',
            to: '#D97706',
            direction: 'to-br'
        },
        searchQuery: 'Trade Fair',
        searchType: 'location' as const,
        searchFilters: {
            location: 'Trade Fair Complex'
        },
        displayOrder: 4,
        isActive: true,
        metadata: {
            area: 'Ojo',
            state: 'Lagos'
        }
    },
    {
        title: 'Laptops',
        subtitle: 'All laptop brands & models',
        icon: 'Monitor',
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/3474/3474360.png',
        backgroundColor: '#10B981',
        backgroundGradient: {
            from: '#10B981',
            to: '#059669',
            direction: 'to-br'
        },
        searchQuery: 'laptops',
        searchType: 'product' as const,
        searchFilters: {
            category: 'Electronics'
        },
        displayOrder: 5,
        isActive: true,
        metadata: {
            category: 'Electronics'
        }
    },
    {
        title: 'Food Items',
        subtitle: 'Fresh groceries delivered',
        icon: 'Salad',
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/1046/1046784.png',
        backgroundColor: '#EF4444',
        backgroundGradient: {
            from: '#EF4444',
            to: '#DC2626',
            direction: 'to-br'
        },
        searchQuery: 'food',
        searchType: 'category' as const,
        searchFilters: {
            category: 'Food & Groceries'
        },
        displayOrder: 6,
        isActive: true,
        metadata: {
            category: 'Food & Groceries'
        }
    }
];

export async function seedFeaturedPromotions() {
    try {
        // Connect to database
        await Database.authenticate();
        logger.info('✅ Database connected successfully');

        // Check if promotions already exist
        const existingCount = await FeaturedPromotion.count();

        if (existingCount > 0) {
            logger.info(`ℹ️  Featured promotions already seeded (${existingCount} records exist)`);
            process.exit(0);
        }

        // Seed promotions
        logger.info('🌱 Seeding featured promotions...');

        for (const promotion of defaultPromotions) {
            await FeaturedPromotion.create(promotion);
            logger.info(`✅ Created promotion: ${promotion.title}`);
        }

        logger.info('🎉 Successfully seeded 6 featured promotions!');
        process.exit(0);
    } catch (error) {
        logger.error('❌ Failed to seed featured promotions:', error);
        process.exit(1);
    }
}

// Run seeder
seedFeaturedPromotions();
