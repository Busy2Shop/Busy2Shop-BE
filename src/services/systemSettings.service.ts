import SystemSettings, { 
    ISystemSettings, 
    ISettingValue, 
    SYSTEM_SETTING_KEYS, 
    SystemSettingValueMap 
} from '../models/systemSettings.model';
import { NotFoundError } from '../utils/customErrors';

export default class SystemSettingsService {
    private static settingsCache: Map<string, any> = new Map();
    private static cacheExpiry: Map<string, number> = new Map();
    private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

    /**
     * Get a specific setting value with type safety
     */
    static async getSetting(
        key: string
    ): Promise<any> {
        const now = Date.now();
        const cacheKey = key as string;
        
        // Return cached value if still valid
        if (this.settingsCache.has(cacheKey) && now < (this.cacheExpiry.get(cacheKey) || 0)) {
            return this.settingsCache.get(cacheKey);
        }

        // Find the setting
        const setting = await SystemSettings.findOne({
            where: { key: cacheKey, isActive: true },
        });

        let value: any;
        if (!setting) {
            // Create default setting if it doesn't exist
            value = await this.createDefaultSetting(key);
        } else {
            value = setting.value.value;
        }

        // Cache the value
        this.settingsCache.set(cacheKey, value);
        this.cacheExpiry.set(cacheKey, now + this.CACHE_DURATION);

        return value;
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
        
        // If the setting exists, update it
        if (!setting.isNewRecord) {
            await setting.update({
                value: settingValue,
                isActive: true,
            });
        }

        // Clear cache for this key
        this.clearCacheKey(key as string);
        
        return setting;
    }

    /**
     * Get multiple settings at once
     */
    static async getSettings(
        keys: string[]
    ): Promise<Record<string, any>> {
        const result: Record<string, any> = {};
        
        for (const key of keys) {
            result[key] = await this.getSetting(key);
        }
        
        return result;
    }

    /**
     * Get all public settings (for frontend)
     */
    static async getPublicSettings(): Promise<Record<string, any>> {
        const allSettings = await SystemSettings.findAll({
            where: { isActive: true },
        });

        const publicSettings: Record<string, any> = {};
        
        for (const setting of allSettings) {
            if (setting.value.isPublic) {
                publicSettings[setting.key] = setting.value.value;
            }
        }

        return publicSettings;
    }

    /**
     * Initialize default settings
     */
    static async initializeDefaultSettings(): Promise<void> {
        const defaultSettings = [
            {
                key: SYSTEM_SETTING_KEYS.SERVICE_FEE_PERCENTAGE,
                value: {
                    value: 5.0,
                    type: 'number' as const,
                    description: 'Service fee percentage applied to orders (deprecated - use SERVICE_FEE_AMOUNT)',
                    category: 'pricing',
                    isPublic: true,
                    validation: { min: 0, max: 50 }
                }
            },
            {
                key: SYSTEM_SETTING_KEYS.SERVICE_FEE_AMOUNT,
                value: {
                    value: 200.0,
                    type: 'number' as const,
                    description: 'Fixed service fee amount in naira',
                    category: 'pricing',
                    isPublic: true,
                    validation: { min: 0, max: 2000 }
                }
            },
            {
                key: SYSTEM_SETTING_KEYS.DELIVERY_FEE,
                value: {
                    value: 500.0,
                    type: 'number' as const,
                    description: 'Fixed delivery fee in naira',
                    category: 'pricing',
                    isPublic: true,
                    validation: { min: 0, max: 5000 }
                }
            },
            {
                key: SYSTEM_SETTING_KEYS.MINIMUM_ORDER_AMOUNT,
                value: {
                    value: 100.0,
                    type: 'number' as const,
                    description: 'Minimum order amount in naira',
                    category: 'business_rules',
                    isPublic: true,
                    validation: { min: 0 }
                }
            },
            {
                key: SYSTEM_SETTING_KEYS.MAXIMUM_DISCOUNT_PERCENTAGE,
                value: {
                    value: 30.0,
                    type: 'number' as const,
                    description: 'Maximum discount percentage allowed',
                    category: 'discounts',
                    isPublic: false,
                    validation: { min: 0, max: 100 }
                }
            },
            {
                key: SYSTEM_SETTING_KEYS.MAXIMUM_SINGLE_DISCOUNT_AMOUNT,
                value: {
                    value: 2000.0,
                    type: 'number' as const,
                    description: 'Maximum single discount amount in naira',
                    category: 'discounts',
                    isPublic: false,
                    validation: { min: 0 }
                }
            },
            {
                key: SYSTEM_SETTING_KEYS.MINIMUM_ORDER_FOR_DISCOUNT,
                value: {
                    value: 100.0,
                    type: 'number' as const,
                    description: 'Minimum order amount to apply discounts',
                    category: 'discounts',
                    isPublic: true,
                    validation: { min: 0 }
                }
            },
            {
                key: SYSTEM_SETTING_KEYS.PAYMENT_TIMEOUT_MINUTES,
                value: {
                    value: 30,
                    type: 'number' as const,
                    description: 'Payment timeout in minutes',
                    category: 'payment',
                    isPublic: true,
                    validation: { min: 5, max: 120 }
                }
            },
            {
                key: SYSTEM_SETTING_KEYS.SUPPORTED_PAYMENT_METHODS,
                value: {
                    value: ['alatpay'],
                    type: 'array' as const,
                    description: 'Supported payment methods',
                    category: 'payment',
                    isPublic: true
                }
            },
            {
                key: SYSTEM_SETTING_KEYS.DEFAULT_CURRENCY,
                value: {
                    value: 'NGN',
                    type: 'string' as const,
                    description: 'Default currency code',
                    category: 'general',
                    isPublic: true,
                    validation: { enum: ['NGN', 'USD', 'GBP'] }
                }
            },
            {
                key: SYSTEM_SETTING_KEYS.MAINTENANCE_MODE,
                value: {
                    value: false,
                    type: 'boolean' as const,
                    description: 'Whether the app is in maintenance mode',
                    category: 'system',
                    isPublic: true
                }
            }
        ];

        for (const setting of defaultSettings) {
            await SystemSettings.findOrCreate({
                where: { key: setting.key },
                defaults: {
                    key: setting.key,
                    value: setting.value,
                    isActive: true,
                },
            });
        }
    }

    /**
     * Business logic helper methods
     */
    static async calculateServiceFee(subtotal: number): Promise<number> {
        // Try to get fixed service fee amount first
        try {
            const serviceAmount = await this.getSetting(SYSTEM_SETTING_KEYS.SERVICE_FEE_AMOUNT);
            if (serviceAmount && serviceAmount > 0) {
                return Math.round(serviceAmount * 100) / 100;
            }
        } catch (error) {
            // Fall back to percentage if SERVICE_FEE_AMOUNT is not available
        }
        
        // Fallback to percentage calculation for backward compatibility
        const percentage = await this.getSetting(SYSTEM_SETTING_KEYS.SERVICE_FEE_PERCENTAGE);
        return Math.round(subtotal * (percentage / 100) * 100) / 100;
    }

    static async getDeliveryFee(): Promise<number> {
        return await this.getSetting(SYSTEM_SETTING_KEYS.DELIVERY_FEE);
    }

    static async calculateTotal(subtotal: number, discountAmount: number = 0): Promise<{
        subtotal: number;
        serviceFee: number;
        deliveryFee: number;
        discountAmount: number;
        total: number;
    }> {
        const serviceFee = await this.calculateServiceFee(subtotal);
        const deliveryFee = await this.getDeliveryFee();
        const total = Math.max(0, subtotal + serviceFee + deliveryFee - discountAmount);

        return {
            subtotal,
            serviceFee,
            deliveryFee,
            discountAmount,
            total,
        };
    }

    static async validateDiscountConstraints(
        subtotal: number,
        discountAmount: number
    ): Promise<{ valid: boolean; error?: string }> {
        const [minOrder, maxPercentage, maxAmount] = await Promise.all([
            this.getSetting(SYSTEM_SETTING_KEYS.MINIMUM_ORDER_FOR_DISCOUNT),
            this.getSetting(SYSTEM_SETTING_KEYS.MAXIMUM_DISCOUNT_PERCENTAGE),
            this.getSetting(SYSTEM_SETTING_KEYS.MAXIMUM_SINGLE_DISCOUNT_AMOUNT),
        ]);

        if (subtotal < minOrder) {
            return {
                valid: false,
                error: `Minimum order amount of ₦${minOrder} required for discounts`,
            };
        }

        const discountPercentage = (discountAmount / subtotal) * 100;
        if (discountPercentage > maxPercentage) {
            return {
                valid: false,
                error: `Discount cannot exceed ${maxPercentage}% of order value`,
            };
        }

        if (discountAmount > maxAmount) {
            return {
                valid: false,
                error: `Single discount cannot exceed ₦${maxAmount}`,
            };
        }

        return { valid: true };
    }

    /**
     * Utility methods
     */
    private static async createDefaultSetting(
        key: string
    ): Promise<any> {
        // This would be called if a setting doesn't exist
        // In practice, you'd want to initialize all settings on app startup
        await this.initializeDefaultSettings();
        return await this.getSetting(key);
    }

    private static getValueType(value: any): ISettingValue['type'] {
        if (Array.isArray(value)) return 'array';
        if (typeof value === 'object' && value !== null) return 'object';
        if (typeof value === 'boolean') return 'boolean';
        if (typeof value === 'number') return 'number';
        return 'string';
    }

    private static clearCacheKey(key: string): void {
        this.settingsCache.delete(key);
        this.cacheExpiry.delete(key);
    }

    static clearCache(): void {
        this.settingsCache.clear();
        this.cacheExpiry.clear();
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
}