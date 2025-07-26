import {
    Table,
    Column,
    Model,
    DataType,
    PrimaryKey,
    Default,
    CreatedAt,
    UpdatedAt,
    Unique,
} from 'sequelize-typescript';

// Define the structure for different setting value types
export interface ISettingValue {
    value: any;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description?: string;
    category?: string;
    isPublic?: boolean; // Whether this setting can be exposed to frontend
    validation?: {
        min?: number;
        max?: number;
        required?: boolean;
        enum?: any[];
    };
}

// Predefined setting keys for type safety
export enum SYSTEM_SETTING_KEYS {
    SERVICE_FEE_PERCENTAGE = 'service_fee_percentage',
    DELIVERY_FEE = 'delivery_fee',
    MINIMUM_ORDER_AMOUNT = 'minimum_order_amount',
    MAXIMUM_DISCOUNT_PERCENTAGE = 'maximum_discount_percentage',
    MAXIMUM_SINGLE_DISCOUNT_AMOUNT = 'maximum_single_discount_amount',
    MINIMUM_ORDER_FOR_DISCOUNT = 'minimum_order_for_discount',
    PAYMENT_TIMEOUT_MINUTES = 'payment_timeout_minutes',
    SUPPORTED_PAYMENT_METHODS = 'supported_payment_methods',
    MAINTENANCE_MODE = 'maintenance_mode',
    MAX_ITEMS_PER_LIST = 'max_items_per_list',
    DEFAULT_CURRENCY = 'default_currency',
    NOTIFICATION_SETTINGS = 'notification_settings',
    BUSINESS_HOURS = 'business_hours',
    HOLIDAY_DATES = 'holiday_dates',
    REFERRAL_BONUS_AMOUNT = 'referral_bonus_amount',
    FIRST_ORDER_DISCOUNT = 'first_order_discount'
}

export interface ISystemSettings {
    key: string;
    value: ISettingValue;
    isActive?: boolean;
}

@Table({ tableName: 'system_settings' })
export default class SystemSettings extends Model<SystemSettings | ISystemSettings> {
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column(DataType.STRING)
    id: string;

    @Unique
    @Column({
        type: DataType.STRING,
        allowNull: false,
        comment: 'Unique key for the setting'
    })
    key: string;

    @Column({
        type: DataType.JSONB,
        allowNull: false,
        comment: 'Setting value with metadata including type, description, validation rules'
    })
    value: ISettingValue;

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: true,
        allowNull: false,
        comment: 'Whether this setting is active'
    })
    isActive: boolean;

    @CreatedAt
    createdAt: Date;

    @UpdatedAt
    updatedAt: Date;
}

// Helper type for getting typed setting values
export type SystemSettingValueMap = {
    [SYSTEM_SETTING_KEYS.SERVICE_FEE_PERCENTAGE]: number;
    [SYSTEM_SETTING_KEYS.DELIVERY_FEE]: number;
    [SYSTEM_SETTING_KEYS.MINIMUM_ORDER_AMOUNT]: number;
    [SYSTEM_SETTING_KEYS.MAXIMUM_DISCOUNT_PERCENTAGE]: number;
    [SYSTEM_SETTING_KEYS.MAXIMUM_SINGLE_DISCOUNT_AMOUNT]: number;
    [SYSTEM_SETTING_KEYS.MINIMUM_ORDER_FOR_DISCOUNT]: number;
    [SYSTEM_SETTING_KEYS.PAYMENT_TIMEOUT_MINUTES]: number;
    [SYSTEM_SETTING_KEYS.SUPPORTED_PAYMENT_METHODS]: string[];
    [SYSTEM_SETTING_KEYS.MAINTENANCE_MODE]: boolean;
    [SYSTEM_SETTING_KEYS.MAX_ITEMS_PER_LIST]: number;
    [SYSTEM_SETTING_KEYS.DEFAULT_CURRENCY]: string;
    [SYSTEM_SETTING_KEYS.NOTIFICATION_SETTINGS]: {
        email: boolean;
        sms: boolean;
        push: boolean;
    };
    [SYSTEM_SETTING_KEYS.BUSINESS_HOURS]: {
        [key: string]: {
            open: string;
            close: string;
            isOpen: boolean;
        };
    };
    [SYSTEM_SETTING_KEYS.HOLIDAY_DATES]: string[];
    [SYSTEM_SETTING_KEYS.REFERRAL_BONUS_AMOUNT]: number;
    [SYSTEM_SETTING_KEYS.FIRST_ORDER_DISCOUNT]: {
        type: 'percentage' | 'fixed';
        value: number;
        maxAmount?: number;
    };
};