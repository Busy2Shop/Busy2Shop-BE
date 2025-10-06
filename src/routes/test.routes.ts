import { Router, Request, Response } from 'express';
import PriceCalculatorService from '../services/priceCalculator.service';
import SystemSettingsService from '../services/systemSettings.service';

const router = Router();

/**
 * Test endpoint for pricing calculations (no auth required)
 * GET /api/v0/test/pricing?price=1000&quantity=2
 */
router.get('/pricing', async (req: Request, res: Response) => {
    try {
        const { price = 1000, quantity = 1 } = req.query;

        const basePrice = parseFloat(price as string);
        const qty = parseInt(quantity as string);

        // Get markup percentage
        const markupPercentage = await SystemSettingsService.getItemMarkupPercentage();

        // Calculate price with markup
        const priceWithMarkup = PriceCalculatorService.applyMarkup(basePrice, markupPercentage);

        // Calculate item total
        const itemTotal = priceWithMarkup * qty;

        // Get service fee (fixed ₦1,000)
        const serviceFee = await SystemSettingsService.calculateServiceFee(itemTotal);

        // Get delivery fee (₦500 base + ₦500 surcharge = ₦1,000)
        const deliveryFee = await SystemSettingsService.getDeliveryFee();

        // Calculate grand total
        const grandTotal = itemTotal + serviceFee + deliveryFee;

        res.json({
            status: 'success',
            message: 'Pricing calculation test',
            data: {
                input: {
                    basePrice,
                    quantity: qty,
                },
                calculations: {
                    markupPercentage: `${markupPercentage}%`,
                    priceWithMarkup,
                    itemTotal,
                    serviceFee,
                    deliveryFee,
                    grandTotal,
                },
                breakdown: {
                    '1. Base Price': `₦${basePrice.toLocaleString()}`,
                    '2. Markup (10%)': `₦${(priceWithMarkup - basePrice).toLocaleString()}`,
                    '3. Price with Markup': `₦${priceWithMarkup.toLocaleString()}`,
                    [`4. Item Total (x${qty})`]: `₦${itemTotal.toLocaleString()}`,
                    '5. Service Fee': `₦${serviceFee.toLocaleString()}`,
                    '6. Delivery Fee': `₦${deliveryFee.toLocaleString()}`,
                    '7. Grand Total': `₦${grandTotal.toLocaleString()}`,
                },
                pricingModel: {
                    markupPercentage: '10%',
                    serviceFee: '₦1,000 (fixed)',
                    deliveryBase: '₦500',
                    deliverySurcharge: '₦500',
                    totalDelivery: '₦1,000',
                    minimumOrder: '₦5,000',
                },
            },
        });
    } catch (error: any) {
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to calculate pricing',
        });
    }
});

/**
 * Test endpoint for system settings (no auth required)
 * GET /api/v0/test/settings
 */
router.get('/settings', async (req: Request, res: Response) => {
    try {
        const { SYSTEM_SETTING_KEYS } = await import('../models/systemSettings.model');

        const settings = {
            serviceFee: await SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.SERVICE_FEE_AMOUNT),
            deliveryFee: await SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.DELIVERY_FEE),
            deliverySurcharge: await SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.DELIVERY_SURCHARGE),
            itemMarkup: await SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.ITEM_MARKUP_PERCENTAGE),
            minimumOrder: await SystemSettingsService.getSetting(SYSTEM_SETTING_KEYS.MINIMUM_ORDER_AMOUNT),
        };

        const totalDelivery = (settings.deliveryFee || 500) + (settings.deliverySurcharge || 500);

        res.json({
            status: 'success',
            message: 'Current system settings',
            data: {
                current: settings,
                calculated: {
                    totalDeliveryFee: totalDelivery,
                },
                expected: {
                    serviceFee: 1000,
                    deliveryFee: 500,
                    deliverySurcharge: 500,
                    totalDelivery: 1000,
                    itemMarkup: 10,
                    minimumOrder: 5000,
                },
            },
        });
    } catch (error: any) {
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to fetch settings',
        });
    }
});

/**
 * Test endpoint for minimum order validation (no auth required)
 * GET /api/v0/test/validate-order?amount=3000
 */
router.get('/validate-order', async (req: Request, res: Response) => {
    try {
        const { amount = 3000 } = req.query;
        const orderAmount = parseFloat(amount as string);

        const { SYSTEM_SETTING_KEYS } = await import('../models/systemSettings.model');
        const minimumOrder = await SystemSettingsService.getSetting(
            SYSTEM_SETTING_KEYS.MINIMUM_ORDER_AMOUNT
        ) || 5000;

        const isValid = orderAmount >= minimumOrder;

        res.json({
            status: 'success',
            message: 'Order validation test',
            data: {
                orderAmount,
                minimumOrder,
                isValid,
                message: isValid
                    ? `Order amount of ₦${orderAmount.toLocaleString()} meets minimum requirement`
                    : `Order amount of ₦${orderAmount.toLocaleString()} is below minimum of ₦${minimumOrder.toLocaleString()}`,
            },
        });
    } catch (error: any) {
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to validate order',
        });
    }
});

export default router;
