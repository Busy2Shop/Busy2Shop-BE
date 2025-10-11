import SystemSettings, {
    ISettingValue,
    SYSTEM_SETTING_KEYS,
} from '../models/systemSettings.model';
import { redisClient as redis } from '../utils/redis';

export default class SystemSettingsService {
    // In-memory cache as fallback
    private static memoryCache: Map<string, any> = new Map();
    private static readonly CACHE_DURATION = 10 * 60; // 10 minutes in seconds (for Redis TTL)
    private static readonly REDIS_PREFIX = 'system_setting:';
    private static isInitialized = false;
    private static initializationPromise: Promise<void> | null = null;

    /**
     * Get a specific setting value with Redis caching
     */
    static async getSetting(key: string): Promise<any> {
        const cacheKey = `${this.REDIS_PREFIX}${key}`;

        try {
            // Try Redis first
            const cached = await redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (error) {
            console.warn(`Redis cache miss for ${key}, falling back to memory/DB`);
        }

        // Check memory cache
        if (this.memoryCache.has(key)) {
            return this.memoryCache.get(key);
        }

        // Find in database
        const setting = await SystemSettings.findOne({
            where: { key, isActive: true },
        });

        let value: any;
        if (!setting) {
            // Initialize defaults if not found
            await this.ensureDefaultsInitialized();
            // Try again after initialization
            const retrySet = await SystemSettings.findOne({
                where: { key, isActive: true },
            });
            value = retrySet ? retrySet.value.value : null;
        } else {
            value = setting.value.value;
        }

        // Cache in both Redis and memory
        await this.cacheValue(key, value);

        return value;
    }

    /**
     * Get multiple settings in one efficient query
     */
    static async getSettings(keys: string[]): Promise<Record<string, any>> {
        const result: Record<string, any> = {};
        const keysToFetch: string[] = [];

        // Try Redis for all keys first
        try {
            const redisPipeline = redis.pipeline();
            keys.forEach(key => redisPipeline.get(`${this.REDIS_PREFIX}${key}`));
            const cachedValues = await redisPipeline.exec();

            if (cachedValues) {
                keys.forEach((key, index) => {
                    const [err, value] = cachedValues[index];
                    if (!err && value) {
                        result[key] = JSON.parse(value as string);
                    } else {
                        keysToFetch.push(key);
                    }
                });
            } else {
                // If pipeline exec returns null, fetch all from DB
                keysToFetch.push(...keys);
            }
        } catch (error) {
            // Redis failed, fetch all from DB
            keysToFetch.push(...keys);
        }

        // Fetch remaining from database
        if (keysToFetch.length > 0) {
            const settings = await SystemSettings.findAll({
                where: {
                    key: keysToFetch,
                    isActive: true,
                },
            });

            // Cache all fetched values
            await Promise.all(settings.map(setting => {
                const value = setting.value.value;
                result[setting.key] = value;
                return this.cacheValue(setting.key, value);
            }));
        }

        return result;
    }

    /**
     * Set a specific setting value
     */
    static async setSetting(
        key: string,
        value: any,
        options?: {
            description?: string;
            category?: string;
            isPublic?: boolean;
        }
    ): Promise<SystemSettings> {
        const settingValue: ISettingValue = {
            value,
            type: this.getValueType(value),
            description: options?.description,
            category: options?.category || 'general',
            isPublic: options?.isPublic || false,
        };

        const [setting] = await SystemSettings.findOrCreate({
            where: { key: key as string },
            defaults: {
                key: key as string,
                value: settingValue,
                isActive: true,
            },
        });

        if (setting) {
            await setting.update({ value: settingValue });
        }

        // Update cache
        await this.cacheValue(key, value);

        return setting;
    }

    /**
     * Cache a value in both Redis and memory
     */
    private static async cacheValue(key: string, value: any): Promise<void> {
        // Memory cache
        this.memoryCache.set(key, value);

        // Redis cache with TTL
        try {
            await redis.setex(
                `${this.REDIS_PREFIX}${key}`,
                this.CACHE_DURATION,
                JSON.stringify(value)
            );
        } catch (error) {
            console.warn(`Failed to cache ${key} in Redis:`, error);
        }
    }

    /**
     * Ensure default settings are initialized (thread-safe)
     */
    private static async ensureDefaultsInitialized(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        // Use a promise to prevent concurrent initializations
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this.initializeDefaultSettings();
        await this.initializationPromise;
        this.initializationPromise = null;
    }

    /**
     * Initialize default settings (optimized with parallel inserts)
     */
    static async initializeDefaultSettings(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        const defaultSettings = [
            {
                key: SYSTEM_SETTING_KEYS.SERVICE_FEE_PERCENTAGE,
                value: {
                    value: 5.0,
                    type: 'number' as const,
                    description: 'Service fee percentage applied to orders (deprecated - use SERVICE_FEE_AMOUNT)',
                    category: 'pricing',
                    isPublic: true,
                    validation: { min: 0, max: 50 },
                },
            },
            {
                key: SYSTEM_SETTING_KEYS.SERVICE_FEE_AMOUNT,
                value: {
                    value: 200.0,
                    type: 'number' as const,
                    description: 'Fixed service fee amount in naira',
                    category: 'pricing',
                    isPublic: true,
                    validation: { min: 0, max: 2000 },
                },
            },
            {
                key: SYSTEM_SETTING_KEYS.DELIVERY_FEE,
                value: {
                    value: 500.0,
                    type: 'number' as const,
                    description: 'Fixed delivery fee in naira (deprecated - use ShipBubble)',
                    category: 'pricing',
                    isPublic: true,
                    validation: { min: 0, max: 5000 },
                },
            },
            {
                key: SYSTEM_SETTING_KEYS.DELIVERY_SURCHARGE,
                value: {
                    value: 200.0,
                    type: 'number' as const,
                    description: 'System surcharge added to ShipBubble delivery fee in naira',
                    category: 'pricing',
                    isPublic: true,
                    validation: { min: 0, max: 2000 },
                },
            },
            {
                key: SYSTEM_SETTING_KEYS.MINIMUM_ORDER_AMOUNT,
                value: {
                    value: 100.0,
                    type: 'number' as const,
                    description: 'Minimum order amount in naira',
                    category: 'business_rules',
                    isPublic: true,
                    validation: { min: 0 },
                },
            },
            {
                key: SYSTEM_SETTING_KEYS.ITEM_MARKUP_PERCENTAGE,
                value: {
                    value: 10.0,
                    type: 'number' as const,
                    description: 'Markup percentage applied to shopping list item prices',
                    category: 'pricing',
                    isPublic: true,
                    validation: { min: 0, max: 100 },
                },
            },
            {
                key: SYSTEM_SETTING_KEYS.MAXIMUM_DISCOUNT_PERCENTAGE,
                value: {
                    value: 30.0,
                    type: 'number' as const,
                    description: 'Maximum discount percentage allowed',
                    category: 'discounts',
                    isPublic: false,
                    validation: { min: 0, max: 100 },
                },
            },
            {
                key: SYSTEM_SETTING_KEYS.MAXIMUM_SINGLE_DISCOUNT_AMOUNT,
                value: {
                    value: 2000.0,
                    type: 'number' as const,
                    description: 'Maximum single discount amount in naira',
                    category: 'discounts',
                    isPublic: false,
                    validation: { min: 0 },
                },
            },
            {
                key: SYSTEM_SETTING_KEYS.MINIMUM_ORDER_FOR_DISCOUNT,
                value: {
                    value: 100.0,
                    type: 'number' as const,
                    description: 'Minimum order amount to apply discounts',
                    category: 'discounts',
                    isPublic: true,
                    validation: { min: 0 },
                },
            },
            {
                key: SYSTEM_SETTING_KEYS.PAYMENT_TIMEOUT_MINUTES,
                value: {
                    value: 30,
                    type: 'number' as const,
                    description: 'Payment timeout in minutes',
                    category: 'payment',
                    isPublic: true,
                    validation: { min: 5, max: 120 },
                },
            },
            {
                key: SYSTEM_SETTING_KEYS.SUPPORTED_PAYMENT_METHODS,
                value: {
                    value: ['alatpay'],
                    type: 'array' as const,
                    description: 'Supported payment methods',
                    category: 'payment',
                    isPublic: true,
                },
            },
            {
                key: SYSTEM_SETTING_KEYS.DEFAULT_CURRENCY,
                value: {
                    value: 'NGN',
                    type: 'string' as const,
                    description: 'Default currency code',
                    category: 'general',
                    isPublic: true,
                    validation: { enum: ['NGN', 'USD', 'GBP'] },
                },
            },
            {
                key: SYSTEM_SETTING_KEYS.MAINTENANCE_MODE,
                value: {
                    value: false,
                    type: 'boolean' as const,
                    description: 'Whether the app is in maintenance mode',
                    category: 'system',
                    isPublic: true,
                },
            },
            {
                key: SYSTEM_SETTING_KEYS.ADMIN_PHONE,
                value: {
                    value: '+2349012345678',
                    type: 'string' as const,
                    description: 'Admin phone number for ShipBubble fallback (international format: +234...)',
                    category: 'system',
                    isPublic: false,
                },
            },
            {
                key: SYSTEM_SETTING_KEYS.ADMIN_EMAIL,
                value: {
                    value: 'admin@busy2shop.com',
                    type: 'string' as const,
                    description: 'Admin email address for system operations',
                    category: 'system',
                    isPublic: false,
                },
            },
        ];

        // Run all findOrCreate in parallel for maximum performance
        await Promise.all(
            defaultSettings.map(setting =>
                SystemSettings.findOrCreate({
                    where: { key: setting.key },
                    defaults: {
                        key: setting.key,
                        value: setting.value,
                        isActive: true,
                    },
                })
            )
        );

        // Pre-cache all default values in Redis and memory
        await Promise.all(
            defaultSettings.map(setting =>
                this.cacheValue(setting.key, setting.value.value)
            )
        );

        this.isInitialized = true;
    }

    /**
     * Business logic helper methods
     */
    static async calculateServiceFee(subtotal: number): Promise<number> {
        const serviceAmount = await this.getSetting(SYSTEM_SETTING_KEYS.SERVICE_FEE_AMOUNT);
        return Math.round((serviceAmount || 1000) * 100) / 100;
    }

    static async getDeliveryFee(): Promise<number> {
        const baseFee = await this.getSetting(SYSTEM_SETTING_KEYS.DELIVERY_FEE);
        return baseFee || 500;
    }

    static async getItemMarkupPercentage(): Promise<number> {
        const markup = await this.getSetting(SYSTEM_SETTING_KEYS.ITEM_MARKUP_PERCENTAGE);
        return markup || 10;
    }

    static async calculateTotal(
        subtotal: number,
        discountAmount: number = 0,
        options?: { deliveryFee?: number }
    ): Promise<{
        subtotal: number;
        serviceFee: number;
        deliveryFee: number;
        discountAmount: number;
        total: number;
    }> {
        const serviceFee = await this.calculateServiceFee(subtotal);
        const deliveryFee = options?.deliveryFee !== undefined
            ? options.deliveryFee
            : await this.getDeliveryFee();

        const total = subtotal + serviceFee + deliveryFee - discountAmount;

        return {
            subtotal: Math.round(subtotal * 100) / 100,
            serviceFee: Math.round(serviceFee * 100) / 100,
            deliveryFee: Math.round(deliveryFee * 100) / 100,
            discountAmount: Math.round(discountAmount * 100) / 100,
            total: Math.round(total * 100) / 100,
        };
    }

    static async getPaymentTimeout(): Promise<number> {
        return await this.getSetting(SYSTEM_SETTING_KEYS.PAYMENT_TIMEOUT_MINUTES);
    }

    /**
     * Validate discount constraints against system settings
     */
    static async validateDiscountConstraints(
        subtotal: number,
        discountAmount: number
    ): Promise<{ valid: boolean; error?: string; cappedAmount?: number }> {
        // Get settings in one batch query
        const settings = await this.getSettings([
            SYSTEM_SETTING_KEYS.MINIMUM_ORDER_FOR_DISCOUNT,
            SYSTEM_SETTING_KEYS.MAXIMUM_DISCOUNT_PERCENTAGE,
            SYSTEM_SETTING_KEYS.MAXIMUM_SINGLE_DISCOUNT_AMOUNT,
        ]);

        const minOrder = settings[SYSTEM_SETTING_KEYS.MINIMUM_ORDER_FOR_DISCOUNT] || 100;
        const maxPercentage = settings[SYSTEM_SETTING_KEYS.MAXIMUM_DISCOUNT_PERCENTAGE] || 30;
        const maxAmount = settings[SYSTEM_SETTING_KEYS.MAXIMUM_SINGLE_DISCOUNT_AMOUNT] || 2000;

        // Check minimum order amount
        if (subtotal < minOrder) {
            return {
                valid: false,
                error: `Minimum order amount of ₦${minOrder} required for discounts`,
            };
        }

        // Check maximum discount percentage
        const maxAllowedByPercentage = (subtotal * maxPercentage) / 100;
        const discountPercentage = (discountAmount / subtotal) * 100;

        let cappedAmount: number | undefined;

        if (discountPercentage > maxPercentage || discountAmount > maxAmount) {
            // Cap to the lower of the two limits
            cappedAmount = Math.min(maxAllowedByPercentage, maxAmount);

            return {
                valid: true,
                cappedAmount,
            };
        }

        return { valid: true };
    }

    /**
     * Clear all caches
     */
    static async clearCache(): Promise<void> {
        this.memoryCache.clear();

        try {
            // Clear all Redis keys with our prefix
            const keys = await redis.keys(`${this.REDIS_PREFIX}*`);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } catch (error) {
            console.warn('Failed to clear Redis cache:', error);
        }
    }

    /**
     * Admin methods
     */
    static async getAllSettings(): Promise<SystemSettings[]> {
        return await SystemSettings.findAll({
            order: [['key', 'ASC']],
        });
    }

    static async getSettingsByCategory(category: string): Promise<SystemSettings[]> {
        const allSettings = await SystemSettings.findAll({
            where: { isActive: true },
        });

        return allSettings.filter(setting => setting.value.category === category);
    }

    /**
     * Get all public settings (for external/frontend consumption)
     */
    static async getPublicSettings(): Promise<Record<string, any>> {
        const allSettings = await SystemSettings.findAll({
            where: { isActive: true },
        });

        const publicSettings: Record<string, any> = {};
        allSettings.forEach(setting => {
            if (setting.value.isPublic) {
                publicSettings[setting.key] = setting.value.value;
            }
        });

        return publicSettings;
    }

    /**
     * Utility methods
     */
    private static getValueType(value: any): ISettingValue['type'] {
        if (Array.isArray(value)) return 'array';
        if (typeof value === 'object' && value !== null) return 'object';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') return 'number';
        return 'string';
    }
}
