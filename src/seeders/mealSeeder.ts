import Meal from '../models/meal.model';
import MealIngredient from '../models/mealIngredient.model';
import Product from '../models/product.model';
import { logger } from '../utils/logger';
import { Op } from 'sequelize';

export default class MealSeeder {
    static async seedMeals() {
        try {
            logger.info('🍽️ Starting meal seeding...');

            // Check if meals already exist
            const existingMeals = await Meal.count();
            if (existingMeals > 0) {
                logger.info('Meals already exist, skipping seeding');
                return;
            }

            // Sample meal data with real image URLs from Unsplash and other sources
            const mealsData = [
                {
                    meal: {
                        name: 'Jollof Rice',
                        description: 'A flavorful West African rice dish cooked in a rich tomato sauce with spices and vegetables',
                        image: 'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=800&auto=format&fit=crop&q=80',
                        category: 'main_course',
                        cuisine: 'nigerian',
                        servings: 4,
                        prepTime: 20,
                        cookTime: 45,
                        difficulty: 'medium' as const,
                        estimatedCost: 3500,
                        isActive: true,
                        isPopular: true,
                        sortOrder: 1,
                        tags: ['rice', 'spicy', 'traditional'],
                        instructions: 'Wash and parboil rice. In a large pot, heat oil and sauté onions. Add tomato paste, blended tomatoes, peppers, and spices. Add stock and rice, cover and cook until tender.',
                    },
                    ingredients: [
                        { name: 'Rice', quantity: 2, unit: 'cups', notes: 'Long grain rice preferred', sortOrder: 1 },
                        { name: 'Tomatoes', quantity: 5, unit: 'pieces', notes: 'Fresh, ripe tomatoes', sortOrder: 2 },
                        { name: 'Red Bell Pepper', quantity: 2, unit: 'pieces', notes: 'Fresh red peppers', sortOrder: 3 },
                        { name: 'Onions', quantity: 2, unit: 'pieces', notes: 'Large onions', sortOrder: 4 },
                        { name: 'Vegetable Oil', quantity: 0.5, unit: 'cup', notes: 'Any cooking oil', sortOrder: 5 },
                        { name: 'Chicken Stock', quantity: 3, unit: 'cups', notes: 'Or beef stock', sortOrder: 6 },
                        { name: 'Curry Powder', quantity: 1, unit: 'tsp', notes: 'To taste', sortOrder: 7 },
                        { name: 'Thyme', quantity: 1, unit: 'tsp', notes: 'Dried thyme', sortOrder: 8 },
                        { name: 'Bay Leaves', quantity: 2, unit: 'pieces', notes: 'Optional', isOptional: true, sortOrder: 9 },
                        { name: 'Salt', quantity: 1, unit: 'tsp', notes: 'To taste', sortOrder: 10 },
                    ],
                },
                {
                    meal: {
                        name: 'Egusi Soup',
                        description: 'A traditional Nigerian soup made with ground melon seeds, leafy vegetables, and meat or fish',
                        image: 'https://images.unsplash.com/photo-1577303935007-0d306ee638cf?w=800&auto=format&fit=crop&q=80',
                        category: 'soup',
                        cuisine: 'nigerian',
                        servings: 6,
                        prepTime: 30,
                        cookTime: 60,
                        difficulty: 'hard' as const,
                        estimatedCost: 4500,
                        isActive: true,
                        isPopular: true,
                        sortOrder: 2,
                        tags: ['soup', 'traditional', 'nutritious'],
                        instructions: 'Blend melon seeds. Season and cook meat. In a pot, heat palm oil, add blended egusi, cook until oil rises. Add stock, meat, fish, and vegetables. Season to taste.',
                    },
                    ingredients: [
                        { name: 'Egusi Seeds', quantity: 2, unit: 'cups', notes: 'Ground melon seeds', sortOrder: 1 },
                        { name: 'Palm Oil', quantity: 0.5, unit: 'cup', notes: 'Red palm oil', sortOrder: 2 },
                        { name: 'Assorted Meat', quantity: 1, unit: 'kg', notes: 'Beef, goat meat, or chicken', sortOrder: 3 },
                        { name: 'Dried Fish', quantity: 3, unit: 'pieces', notes: 'Smoked fish', sortOrder: 4 },
                        { name: 'Spinach', quantity: 2, unit: 'bunches', notes: 'Fresh spinach leaves', sortOrder: 5 },
                        { name: 'Pumpkin Leaves', quantity: 1, unit: 'bunch', notes: 'Ugu leaves', isOptional: true, sortOrder: 6 },
                        { name: 'Onions', quantity: 2, unit: 'pieces', notes: 'Medium onions', sortOrder: 7 },
                        { name: 'Pepper', quantity: 3, unit: 'pieces', notes: 'Scotch bonnet or habanero', sortOrder: 8 },
                        { name: 'Stock Cubes', quantity: 2, unit: 'pieces', notes: 'Seasoning cubes', sortOrder: 9 },
                        { name: 'Salt', quantity: 1, unit: 'tsp', notes: 'To taste', sortOrder: 10 },
                    ],
                },
                {
                    meal: {
                        name: 'Fried Rice',
                        description: 'A colorful Nigerian-style fried rice with mixed vegetables, curry, and your choice of protein',
                        image: 'https://images.unsplash.com/photo-1596560548464-f010549b84d7?w=800&auto=format&fit=crop&q=80',
                        category: 'main_course',
                        cuisine: 'nigerian',
                        servings: 4,
                        prepTime: 15,
                        cookTime: 30,
                        difficulty: 'easy' as const,
                        estimatedCost: 3000,
                        isActive: true,
                        isPopular: true,
                        sortOrder: 3,
                        tags: ['rice', 'colorful', 'quick'],
                        instructions: 'Parboil rice with curry and salt. Heat oil, sauté vegetables, add rice and seasonings. Stir-fry until well combined and heated through.',
                    },
                    ingredients: [
                        { name: 'Rice', quantity: 2, unit: 'cups', notes: 'Long grain rice', sortOrder: 1 },
                        { name: 'Mixed Vegetables', quantity: 2, unit: 'cups', notes: 'Carrots, green beans, green peas', sortOrder: 2 },
                        { name: 'Sweet Corn', quantity: 1, unit: 'cup', notes: 'Fresh or canned', sortOrder: 3 },
                        { name: 'Green Bell Pepper', quantity: 1, unit: 'piece', notes: 'Diced', sortOrder: 4 },
                        { name: 'Onions', quantity: 1, unit: 'piece', notes: 'Large onion', sortOrder: 5 },
                        { name: 'Vegetable Oil', quantity: 0.25, unit: 'cup', notes: 'For frying', sortOrder: 6 },
                        { name: 'Curry Powder', quantity: 2, unit: 'tsp', notes: 'For color and flavor', sortOrder: 7 },
                        { name: 'Chicken/Beef', quantity: 0.5, unit: 'kg', notes: 'Cooked and diced', isOptional: true, sortOrder: 8 },
                        { name: 'Stock Cubes', quantity: 2, unit: 'pieces', notes: 'Seasoning', sortOrder: 9 },
                        { name: 'Salt', quantity: 1, unit: 'tsp', notes: 'To taste', sortOrder: 10 },
                    ],
                },
                {
                    meal: {
                        name: 'Pepper Soup',
                        description: 'A spicy, aromatic Nigerian soup perfect for cold weather, made with fish or meat and special spices',
                        image: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=800&auto=format&fit=crop&q=80',
                        category: 'soup',
                        cuisine: 'nigerian',
                        servings: 4,
                        prepTime: 10,
                        cookTime: 25,
                        difficulty: 'easy' as const,
                        estimatedCost: 2500,
                        isActive: true,
                        isPopular: false,
                        sortOrder: 4,
                        tags: ['soup', 'spicy', 'medicinal'],
                        instructions: 'Season and boil meat/fish. Add pepper soup spices, onions, and scotch bonnet. Simmer until tender. Garnish with scent leaves.',
                    },
                    ingredients: [
                        { name: 'Fish/Catfish', quantity: 1, unit: 'kg', notes: 'Fresh catfish or any fish', sortOrder: 1 },
                        { name: 'Pepper Soup Spice', quantity: 2, unit: 'tbsp', notes: 'Ground pepper soup spice mix', sortOrder: 2 },
                        { name: 'Onions', quantity: 1, unit: 'piece', notes: 'Medium onion', sortOrder: 3 },
                        { name: 'Scotch Bonnet Pepper', quantity: 2, unit: 'pieces', notes: 'Fresh hot peppers', sortOrder: 4 },
                        { name: 'Scent Leaves', quantity: 10, unit: 'pieces', notes: 'Fresh basil leaves', sortOrder: 5 },
                        { name: 'Ginger', quantity: 1, unit: 'piece', notes: 'Fresh ginger root', sortOrder: 6 },
                        { name: 'Garlic', quantity: 3, unit: 'cloves', notes: 'Fresh garlic', sortOrder: 7 },
                        { name: 'Stock Cubes', quantity: 2, unit: 'pieces', notes: 'Seasoning', sortOrder: 8 },
                        { name: 'Salt', quantity: 1, unit: 'tsp', notes: 'To taste', sortOrder: 9 },
                    ],
                },
                {
                    meal: {
                        name: 'Okra Soup',
                        description: 'A delicious Nigerian soup made with fresh okra, meat, and fish in a flavorful broth',
                        image: 'https://images.unsplash.com/photo-1609501676725-7186f017a4b7?w=800&auto=format&fit=crop&q=80',
                        category: 'soup',
                        cuisine: 'nigerian',
                        servings: 5,
                        prepTime: 20,
                        cookTime: 40,
                        difficulty: 'medium' as const,
                        estimatedCost: 3200,
                        isActive: true,
                        isPopular: false,
                        sortOrder: 5,
                        tags: ['soup', 'healthy', 'traditional'],
                        instructions: 'Cook meat with seasonings. Blend or slice okra. Heat palm oil, add onions, tomatoes, then okra. Add meat, fish, and seasonings. Simmer until done.',
                    },
                    ingredients: [
                        { name: 'Fresh Okra', quantity: 1, unit: 'kg', notes: 'Young, tender okra', sortOrder: 1 },
                        { name: 'Assorted Meat', quantity: 0.5, unit: 'kg', notes: 'Beef, goat meat', sortOrder: 2 },
                        { name: 'Dried Fish', quantity: 2, unit: 'pieces', notes: 'Smoked fish', sortOrder: 3 },
                        { name: 'Palm Oil', quantity: 0.25, unit: 'cup', notes: 'Red palm oil', sortOrder: 4 },
                        { name: 'Tomatoes', quantity: 3, unit: 'pieces', notes: 'Fresh tomatoes', sortOrder: 5 },
                        { name: 'Onions', quantity: 1, unit: 'piece', notes: 'Medium onion', sortOrder: 6 },
                        { name: 'Pepper', quantity: 2, unit: 'pieces', notes: 'Scotch bonnet', sortOrder: 7 },
                        { name: 'Crayfish', quantity: 2, unit: 'tbsp', notes: 'Ground crayfish', sortOrder: 8 },
                        { name: 'Stock Cubes', quantity: 2, unit: 'pieces', notes: 'Seasoning', sortOrder: 9 },
                        { name: 'Salt', quantity: 1, unit: 'tsp', notes: 'To taste', sortOrder: 10 },
                    ],
                },
                {
                    meal: {
                        name: 'Beans Porridge',
                        description: 'A nutritious one-pot meal of beans cooked with vegetables, palm oil, and spices',
                        image: 'https://images.unsplash.com/photo-1605923520797-d3fb6cd585c3?w=800&auto=format&fit=crop&q=80',
                        category: 'main_course',
                        cuisine: 'nigerian',
                        servings: 4,
                        prepTime: 15,
                        cookTime: 60,
                        difficulty: 'easy' as const,
                        estimatedCost: 2000,
                        isActive: true,
                        isPopular: false,
                        sortOrder: 6,
                        tags: ['beans', 'healthy', 'budget-friendly'],
                        instructions: 'Boil beans until soft. Heat palm oil, sauté onions, add tomatoes and peppers. Add cooked beans, vegetables, and seasonings. Simmer until thick.',
                    },
                    ingredients: [
                        { name: 'Brown Beans', quantity: 2, unit: 'cups', notes: 'Honey beans or black-eyed peas', sortOrder: 1 },
                        { name: 'Palm Oil', quantity: 0.25, unit: 'cup', notes: 'Red palm oil', sortOrder: 2 },
                        { name: 'Tomatoes', quantity: 3, unit: 'pieces', notes: 'Fresh tomatoes', sortOrder: 3 },
                        { name: 'Onions', quantity: 1, unit: 'piece', notes: 'Large onion', sortOrder: 4 },
                        { name: 'Sweet Potato', quantity: 2, unit: 'pieces', notes: 'Medium sized', isOptional: true, sortOrder: 5 },
                        { name: 'Plantain', quantity: 2, unit: 'pieces', notes: 'Ripe plantain', isOptional: true, sortOrder: 6 },
                        { name: 'Spinach', quantity: 1, unit: 'bunch', notes: 'Fresh spinach', sortOrder: 7 },
                        { name: 'Pepper', quantity: 2, unit: 'pieces', notes: 'Scotch bonnet', sortOrder: 8 },
                        { name: 'Crayfish', quantity: 1, unit: 'tbsp', notes: 'Ground crayfish', isOptional: true, sortOrder: 9 },
                        { name: 'Stock Cubes', quantity: 2, unit: 'pieces', notes: 'Seasoning', sortOrder: 10 },
                        { name: 'Salt', quantity: 1, unit: 'tsp', notes: 'To taste', sortOrder: 11 },
                    ],
                },
                {
                    meal: {
                        name: 'Moi Moi',
                        description: 'Steamed bean pudding made from black-eyed peas, peppers, onions, and spices - a Nigerian delicacy',
                        image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&auto=format&fit=crop&q=80',
                        category: 'side_dish',
                        cuisine: 'nigerian',
                        servings: 8,
                        prepTime: 30,
                        cookTime: 45,
                        difficulty: 'medium' as const,
                        estimatedCost: 2500,
                        isActive: true,
                        isPopular: true,
                        sortOrder: 7,
                        tags: ['beans', 'steamed', 'healthy'],
                        instructions: 'Soak and peel beans. Blend with peppers, onions, and seasoning. Add oil and mix well. Pour into containers and steam until firm.',
                    },
                    ingredients: [
                        { name: 'Black-eyed Peas', quantity: 3, unit: 'cups', notes: 'Soaked and peeled', sortOrder: 1 },
                        { name: 'Red Bell Pepper', quantity: 3, unit: 'pieces', notes: 'Fresh peppers', sortOrder: 2 },
                        { name: 'Scotch Bonnet Pepper', quantity: 1, unit: 'piece', notes: 'To taste', sortOrder: 3 },
                        { name: 'Onions', quantity: 2, unit: 'pieces', notes: 'Medium onions', sortOrder: 4 },
                        { name: 'Vegetable Oil', quantity: 0.5, unit: 'cup', notes: 'Or palm oil', sortOrder: 5 },
                        { name: 'Eggs', quantity: 3, unit: 'pieces', notes: 'Hard boiled', isOptional: true, sortOrder: 6 },
                        { name: 'Fish', quantity: 2, unit: 'pieces', notes: 'Smoked fish', isOptional: true, sortOrder: 7 },
                        { name: 'Stock Cubes', quantity: 3, unit: 'pieces', notes: 'Seasoning', sortOrder: 8 },
                        { name: 'Salt', quantity: 1, unit: 'tsp', notes: 'To taste', sortOrder: 9 },
                    ],
                },
                {
                    meal: {
                        name: 'Pounded Yam and Egusi',
                        description: 'Smooth, stretchy pounded yam served with rich egusi soup - a classic Nigerian combination',
                        image: 'https://images.unsplash.com/photo-1606850036580-b56eb06a2d49?w=800&auto=format&fit=crop&q=80',
                        category: 'main_course',
                        cuisine: 'nigerian',
                        servings: 4,
                        prepTime: 20,
                        cookTime: 40,
                        difficulty: 'hard' as const,
                        estimatedCost: 4000,
                        isActive: true,
                        isPopular: true,
                        sortOrder: 8,
                        tags: ['swallow', 'traditional', 'filling'],
                        instructions: 'Boil yam until soft. Pound in mortar and pestle until smooth and stretchy. Serve hot with egusi soup.',
                    },
                    ingredients: [
                        { name: 'Yam', quantity: 1, unit: 'tuber', notes: 'Medium sized white yam', sortOrder: 1 },
                        { name: 'Water', quantity: 2, unit: 'cups', notes: 'For boiling', sortOrder: 2 },
                        { name: 'Salt', quantity: 0.5, unit: 'tsp', notes: 'For boiling water', sortOrder: 3 },
                    ],
                },
                {
                    meal: {
                        name: 'Akara (Bean Cakes)',
                        description: 'Deep-fried bean cakes made from black-eyed peas - crispy outside, fluffy inside. Perfect for breakfast',
                        image: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=800&auto=format&fit=crop&q=80',
                        category: 'snack',
                        cuisine: 'nigerian',
                        servings: 20,
                        prepTime: 25,
                        cookTime: 20,
                        difficulty: 'medium' as const,
                        estimatedCost: 1500,
                        isActive: true,
                        isPopular: true,
                        sortOrder: 9,
                        tags: ['breakfast', 'snack', 'street-food'],
                        instructions: 'Soak and peel beans. Blend with minimal water until fluffy. Add seasonings. Deep fry spoonfuls until golden brown.',
                    },
                    ingredients: [
                        { name: 'Black-eyed Peas', quantity: 2, unit: 'cups', notes: 'Soaked and peeled', sortOrder: 1 },
                        { name: 'Onions', quantity: 1, unit: 'piece', notes: 'Medium onion', sortOrder: 2 },
                        { name: 'Scotch Bonnet Pepper', quantity: 1, unit: 'piece', notes: 'To taste', sortOrder: 3 },
                        { name: 'Salt', quantity: 1, unit: 'tsp', notes: 'To taste', sortOrder: 4 },
                        { name: 'Vegetable Oil', quantity: 3, unit: 'cups', notes: 'For deep frying', sortOrder: 5 },
                        { name: 'Stock Cubes', quantity: 1, unit: 'piece', notes: 'Optional', isOptional: true, sortOrder: 6 },
                    ],
                },
                {
                    meal: {
                        name: 'Nigerian Meat Pie',
                        description: 'Flaky pastry filled with seasoned minced meat, potatoes, and carrots - a popular Nigerian snack',
                        image: 'https://images.unsplash.com/photo-1509365390695-33aee754301f?w=800&auto=format&fit=crop&q=80',
                        category: 'snack',
                        cuisine: 'nigerian',
                        servings: 12,
                        prepTime: 45,
                        cookTime: 30,
                        difficulty: 'medium' as const,
                        estimatedCost: 3000,
                        isActive: true,
                        isPopular: false,
                        sortOrder: 10,
                        tags: ['pastry', 'snack', 'party-food'],
                        instructions: 'Make pastry dough. Prepare meat filling. Roll out dough, cut circles, add filling, seal and bake until golden.',
                    },
                    ingredients: [
                        { name: 'Flour', quantity: 4, unit: 'cups', notes: 'All-purpose flour', sortOrder: 1 },
                        { name: 'Butter', quantity: 200, unit: 'g', notes: 'Cold butter', sortOrder: 2 },
                        { name: 'Minced Meat', quantity: 0.5, unit: 'kg', notes: 'Beef or chicken', sortOrder: 3 },
                        { name: 'Irish Potatoes', quantity: 2, unit: 'pieces', notes: 'Diced small', sortOrder: 4 },
                        { name: 'Carrots', quantity: 2, unit: 'pieces', notes: 'Diced small', sortOrder: 5 },
                        { name: 'Onions', quantity: 1, unit: 'piece', notes: 'Finely chopped', sortOrder: 6 },
                        { name: 'Curry Powder', quantity: 1, unit: 'tsp', notes: 'For flavor', sortOrder: 7 },
                        { name: 'Thyme', quantity: 0.5, unit: 'tsp', notes: 'Dried thyme', sortOrder: 8 },
                        { name: 'Stock Cubes', quantity: 2, unit: 'pieces', notes: 'Seasoning', sortOrder: 9 },
                        { name: 'Salt', quantity: 1, unit: 'tsp', notes: 'To taste', sortOrder: 10 },
                        { name: 'Egg', quantity: 1, unit: 'piece', notes: 'For egg wash', sortOrder: 11 },
                    ],
                },
            ];

            const createdMeals = [];

            for (const mealData of mealsData) {
                // Create the meal
                const meal = await Meal.create(mealData.meal as any);

                // Create ingredients for the meal
                for (const ingredientData of mealData.ingredients) {
                    // Try to find matching product (optional - ingredients can exist without products)
                    let product = null;
                    try {
                        product = await Product.findOne({
                            where: {
                                name: { [Op.iLike]: `%${ingredientData.name}%` },
                            },
                        });
                    } catch (error) {
                        // Product not found, continue without linking
                    }

                    const ingredient = await MealIngredient.create({
                        mealId: meal.id,
                        productId: product?.id || null,
                        ingredientName: ingredientData.name,
                        quantity: ingredientData.quantity,
                        unit: ingredientData.unit,
                        notes: ingredientData.notes,
                        isOptional: ingredientData.isOptional || false,
                        estimatedPrice: product?.price ?
                            Number(product.price) * ingredientData.quantity :
                            Math.floor(Math.random() * 500) + 100, // Random price if no product
                        sortOrder: ingredientData.sortOrder,
                    } as any);
                }

                createdMeals.push(meal);
                logger.info(`✅ Created meal: ${meal.name} with ${mealData.ingredients.length} ingredients`);
            }

            logger.info(`🎉 Successfully seeded ${createdMeals.length} meals with ingredients!`);

            return {
                message: 'Meals seeded successfully',
                data: {
                    mealsCreated: createdMeals.length,
                    meals: createdMeals.map(meal => ({
                        id: meal.id,
                        name: meal.name,
                        category: meal.category,
                        cuisine: meal.cuisine,
                        servings: meal.servings,
                        difficulty: meal.difficulty,
                        isPopular: meal.isPopular,
                    })),
                },
            };

        } catch (error) {
            logger.error('❌ Error seeding meals:', error);
            throw error;
        }
    }

    static async clearMeals() {
        try {
            logger.info('🗑️ Clearing meals and ingredients...');

            await MealIngredient.destroy({ where: {} });
            await Meal.destroy({ where: {} });

            logger.info('✅ All meals and ingredients cleared!');

            return {
                message: 'All meals and ingredients cleared successfully',
            };
        } catch (error) {
            logger.error('❌ Error clearing meals:', error);
            throw error;
        }
    }
}