/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Script to update system settings with new pricing model
 *
 * New Pricing Model:
 * - Service Charge: ₦1,000 per order (was ₦500)
 * - Markup Fee: 10% on each item (NEW)
 * - Delivery Surcharge: ₦500 additional (was ₦0)
 * - Minimum Order: ₦5,000 (was ₦2,000)
 */

import SystemSettings from '../models/systemSettings.model';
import { SYSTEM_SETTING_KEYS } from '../models/systemSettings.model';
import logger from '../utils/logger';

async function updatePricingSettings() {
    try {
        logger.info('🔄 Starting system settings update for new pricing model...');

        // 1. Update service fee amount: ₦500 → ₦1,000
        const serviceFee = await SystemSettings.findOne({
            where: { key: SYSTEM_SETTING_KEYS.SERVICE_FEE_AMOUNT }
        });

        if (serviceFee) {
            await serviceFee.update({
                value: {
                    value: 1000,
                    type: 'number',
                    description: 'Fixed service charge per order',
                    category: 'pricing',
                    isPublic: true
                }
            });
            logger.info('✅ Updated service_fee_amount: ₦500 → ₦1,000');
        } else {
            await SystemSettings.create({
                key: SYSTEM_SETTING_KEYS.SERVICE_FEE_AMOUNT,
                value: {
                    value: 1000,
                    type: 'number',
                    description: 'Fixed service charge per order',
                    category: 'pricing',
                    isPublic: true
                },
                isActive: true
            });
            logger.info('✅ Created service_fee_amount: ₦1,000');
        }

        // 2. Add item markup percentage: 10% (NEW)
        const markupPercentage = await SystemSettings.findOne({
            where: { key: SYSTEM_SETTING_KEYS.ITEM_MARKUP_PERCENTAGE }
        });

        if (markupPercentage) {
            await markupPercentage.update({
                value: {
                    value: 10,
                    type: 'number',
                    description: 'Percentage markup applied to each item price',
                    category: 'pricing',
                    isPublic: false,
                    validation: {
                        min: 0,
                        max: 100
                    }
                }
            });
            logger.info('✅ Updated item_markup_percentage: 10%');
        } else {
            await SystemSettings.create({
                key: SYSTEM_SETTING_KEYS.ITEM_MARKUP_PERCENTAGE,
                value: {
                    value: 10,
                    type: 'number',
                    description: 'Percentage markup applied to each item price',
                    category: 'pricing',
                    isPublic: false,
                    validation: {
                        min: 0,
                        max: 100
                    }
                },
                isActive: true
            });
            logger.info('✅ Created item_markup_percentage: 10%');
        }

        // 3. Add delivery surcharge: ₦500 (NEW)
        const deliverySurcharge = await SystemSettings.findOne({
            where: { key: SYSTEM_SETTING_KEYS.DELIVERY_SURCHARGE }
        });

        if (deliverySurcharge) {
            await deliverySurcharge.update({
                value: {
                    value: 500,
                    type: 'number',
                    description: 'Additional surcharge added to delivery fee',
                    category: 'pricing',
                    isPublic: true
                }
            });
            logger.info('✅ Updated delivery_surcharge: ₦500');
        } else {
            await SystemSettings.create({
                key: SYSTEM_SETTING_KEYS.DELIVERY_SURCHARGE,
                value: {
                    value: 500,
                    type: 'number',
                    description: 'Additional surcharge added to delivery fee',
                    category: 'pricing',
                    isPublic: true
                },
                isActive: true
            });
            logger.info('✅ Created delivery_surcharge: ₦500');
        }

        // 4. Update minimum order amount: ₦2,000 → ₦5,000
        const minimumOrder = await SystemSettings.findOne({
            where: { key: SYSTEM_SETTING_KEYS.MINIMUM_ORDER_AMOUNT }
        });

        if (minimumOrder) {
            await minimumOrder.update({
                value: {
                    value: 5000,
                    type: 'number',
                    description: 'Minimum order amount required',
                    category: 'pricing',
                    isPublic: true,
                    validation: {
                        min: 0
                    }
                }
            });
            logger.info('✅ Updated minimum_order_amount: ₦2,000 → ₦5,000');
        } else {
            await SystemSettings.create({
                key: SYSTEM_SETTING_KEYS.MINIMUM_ORDER_AMOUNT,
                value: {
                    value: 5000,
                    type: 'number',
                    description: 'Minimum order amount required',
                    category: 'pricing',
                    isPublic: true,
                    validation: {
                        min: 0
                    }
                },
                isActive: true
            });
            logger.info('✅ Created minimum_order_amount: ₦5,000');
        }

        logger.info('');
        logger.info('🎉 System settings update completed successfully!');
        logger.info('');
        logger.info('📊 New Pricing Model Summary:');
        logger.info('   • Service Charge: ₦1,000 per order');
        logger.info('   • Item Markup: 10% on each item');
        logger.info('   • Delivery Surcharge: ₦500 (added to base delivery fee)');
        logger.info('   • Minimum Order: ₦5,000');
        logger.info('');

    } catch (error: any) {
        logger.error('❌ Failed to update system settings:', error);
        throw error;
    }
}

export default updatePricingSettings;

// If running directly
if (require.main === module) {
    updatePricingSettings()
        .then(() => {
            logger.info('✅ Script completed successfully');
            process.exit(0);
        })
        .catch((error) => {
            logger.error('❌ Script failed:', error);
            process.exit(1);
        });
}
