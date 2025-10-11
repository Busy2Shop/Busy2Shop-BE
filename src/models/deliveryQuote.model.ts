import {
    Table,
    Column,
    Model,
    DataType,
    ForeignKey,
    BelongsTo,
    HasMany,
    IsUUID,
    PrimaryKey,
    Default,
} from 'sequelize-typescript';
import ShoppingList from './shoppingList.model';
import Order from './order.model';

export type QuoteStatus = 'quoted' | 'selected' | 'label_created' | 'expired';

export interface CourierOption {
    courier_id: string; // Required for creating label
    service_code: string;
    courier_name: string;
    service_name: string;
    amount: number;
    total?: number; // ShipBubble uses 'total' instead of 'amount' in some responses
    estimated_delivery_time: string;
    delivery_eta?: string; // ShipBubble uses 'delivery_eta' in fetch_rates response
    logo_url?: string;
    courier_image?: string; // ShipBubble courier image URL
    tracking_level?: string | number; // String: FULL, PARTIAL, BASIC, NONE | Number: 1-7 (ShipBubble scale)
    ratings?: number; // 0-5 star rating
}

/**
 * DeliveryQuote Model
 * Stores ShipBubble delivery quotes with 24-hour expiry
 * Created during checkout BEFORE order creation
 */
@Table({
    tableName: 'delivery_quotes',
    indexes: [
        { fields: ['shopping_list_id'] },
        { fields: ['request_token'], unique: true },
        { fields: ['expires_at'] },
        { fields: ['status'] },
    ],
})
export default class DeliveryQuote extends Model<DeliveryQuote | IDeliveryQuote> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
    id: string;

    @IsUUID(4)
    @ForeignKey(() => ShoppingList)
    @Column({
        allowNull: false,
        comment: 'Link to shopping list (quote happens before order creation)',
    })
    shopping_list_id: string;

    @BelongsTo(() => ShoppingList, 'shopping_list_id')
    shoppingList: ShoppingList;

    @Column({
        type: DataType.STRING(255),
        allowNull: false,
        unique: true,
        comment: 'ShipBubble request token (24-hour expiry)',
    })
    request_token: string;

    @Column({
        type: DataType.INTEGER,
        allowNull: false,
        comment: 'Validated sender address code (market)',
    })
    sender_address_code: number;

    @Column({
        type: DataType.INTEGER,
        allowNull: false,
        comment: 'Validated receiver address code (customer)',
    })
    receiver_address_code: number;

    @Column({
        type: DataType.INTEGER,
        allowNull: false,
        defaultValue: 69709726,
        comment: 'ShipBubble category ID (69709726 = Food)',
    })
    category_id: number;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Total package weight in kg',
    })
    package_weight: number;

    @Column({
        type: DataType.JSONB,
        allowNull: false,
        comment: 'Package dimensions: {length, width, height}',
    })
    package_dimensions: {
        length: number;
        width: number;
        height: number;
    };

    @Column({
        type: DataType.JSONB,
        allowNull: false,
        comment: 'Array of courier options with pricing',
    })
    couriers: CourierOption[];

    @Column({
        type: DataType.STRING(100),
        allowNull: true,
        comment: 'Service code selected by customer',
    })
    selected_service_code: string;

    @Column({
        type: DataType.STRING(100),
        allowNull: true,
        comment: 'Courier ID selected by customer (required for label creation)',
    })
    selected_courier_id: string;

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Delivery fee for selected courier',
    })
    selected_amount: number;

    @Column({
        type: DataType.ENUM('quoted', 'selected', 'label_created', 'expired'),
        allowNull: false,
        defaultValue: 'quoted',
        comment: 'Quote lifecycle status',
    })
    status: QuoteStatus;

    @Column({
        type: DataType.DATE,
        allowNull: false,
        comment: 'When this quote expires (24 hours from creation)',
    })
    expires_at: Date;

    @HasMany(() => Order, 'deliveryQuoteId')
    orders: Order[];

    // Virtual: Check if quote is expired
    get isExpired(): boolean {
        return new Date() > new Date(this.expires_at);
    }

    // Virtual: Check if quote is still valid
    get isValid(): boolean {
        return !this.isExpired && this.status !== 'expired';
    }
}

export interface IDeliveryQuote {
    id?: string;
    shopping_list_id: string;
    request_token: string;
    sender_address_code: number;
    receiver_address_code: number;
    category_id?: number;
    package_weight: number;
    package_dimensions: {
        length: number;
        width: number;
        height: number;
    };
    couriers: CourierOption[];
    selected_service_code?: string;
    selected_courier_id?: string;
    selected_amount?: number;
    status?: QuoteStatus;
    expires_at: Date;
}
