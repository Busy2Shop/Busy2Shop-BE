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
        discountPrice?: number;
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
            const jsonFilePath = path.join(__dirname, '../data/seed-data.json');

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
                                    discountPrice: productData.discountPrice,
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
}

export default new SeederController();