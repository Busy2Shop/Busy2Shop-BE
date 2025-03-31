import {
    Table, Column, Model, DataType, HasMany, BelongsToMany,
    IsUUID, PrimaryKey, Default, ForeignKey, BelongsTo, BeforeCreate,
    BeforeUpdate,
} from 'sequelize-typescript';
import User from './user.model';
import Category from './category.model';
import MarketCategory from './marketCategory.model';
import Product from './product.model';
import Review from './review.model';

export type MarketTypeValues = 'supermarket' | 'local_market' | 'pharmacy' | 'specialty_store';

@Table
export default class Market extends Model<Market | IMarket> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
        id: string;

    @Column({
        type: DataType.STRING,
        allowNull: true, // Some markets (like local ones) might not have names
    })
        name: string;

    @Column({
        type: DataType.STRING,
        allowNull: false, // Require location for all markets.
    })
        address: string;

    @Column({
        type: DataType.GEOMETRY('POINT', 4326), // SRID 4326 is standard for GPS coordinates
        allowNull: false,
    })
        geoLocation: { type: string; coordinates: number[] }; // PostGIS geometry point


    @Column({
        type: DataType.JSONB,
        allowNull: false,
    })
        location: {
        latitude: number;
        longitude: number;
        city: string;
        state: string;
        country: string;
    };

    // Add a hook to sync the geoLocation with location JSONB
    @BeforeCreate
    @BeforeUpdate
    static updateGeoLocation(instance: Market) {
        if (instance.location?.latitude && instance.location?.longitude) {
            // Update geoLocation from JSONB location.
            // Migration handles this for existing records.
            // Service Layer handles this for new records.
            instance.geoLocation = {
                type: 'Point',
                coordinates: [instance.location.longitude, instance.location.latitude],
            };
        }
    }

    @Column({
        type: DataType.STRING,
        allowNull: true, // Only some markets have phone numbers
    })
        phoneNumber: string;

    @Column({
        type: DataType.ENUM('supermarket', 'local_market', 'pharmacy', 'specialty_store'),
        allowNull: false,
    })
        marketType: MarketTypeValues;

    @Column({
        type: DataType.TEXT,
        allowNull: true,
    })
        description: string;

    @Column({
        type: DataType.ARRAY(DataType.STRING),
        allowNull: true,
    })
        images: string[];

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: false,
    })
        isPinned: boolean;

    @Column({
        type: DataType.JSONB,
        allowNull: true,
    })
        operatingHours: {
        monday: { open: string; close: string };
        tuesday: { open: string; close: string };
        wednesday: { open: string; close: string };
        thursday: { open: string; close: string };
        friday: { open: string; close: string };
        saturday: { open: string; close: string };
        sunday: { open: string; close: string };
    };

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: true,
    })
        isActive: boolean;

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column({
        allowNull: true, // A market can exist without an owner in some cases
    })
        ownerId: string;

    @BelongsTo(() => User)
        owner: User;

    // Relationships
    @BelongsToMany(() => Category, () => MarketCategory)
        categories: Category[];

    @HasMany(() => Product)
        products: Product[];

    @HasMany(() => Review)
        reviews: Review[];
}

export interface IMarket {
    id?: string;
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
    marketType: MarketTypeValues;
    description?: string;
    images?: string[];
    isPinned?: boolean;
    operatingHours?: {
        monday: { open: string; close: string };
        tuesday: { open: string; close: string };
        wednesday: { open: string; close: string };
        thursday: { open: string; close: string };
        friday: { open: string; close: string };
        saturday: { open: string; close: string };
        sunday: { open: string; close: string };
    };
    isActive?: boolean;
    ownerId?: string;
}