import {
    Table,
    Column,
    Model,
    DataType,
    ForeignKey,
    BelongsTo,
    IsUUID,
    PrimaryKey,
    Default,
    BeforeCreate,
    BeforeUpdate,
} from 'sequelize-typescript';
import User from './user.model';

export enum AddressType {
    HOME = 'home',
    OFFICE = 'office',
    OTHER = 'other',
}

@Table({
    indexes: [
        {
            fields: ['userId', 'isDefault'],
        },
        {
            fields: ['userId', 'type'],
        },
    ],
})
export default class UserAddress extends Model<UserAddress | IUserAddress> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
    id: string;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    title: string; // User-given name like "Home", "Work", etc.

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    type: string; // Flexible type, not limited to enum

    @Column({
        type: DataType.TEXT,
        allowNull: false,
    })
    fullAddress: string; // Complete address string from Google Places

    @Column({
        type: DataType.TEXT,
        allowNull: true,
    })
    address: string; // Street address component

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    city: string;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    state: string;

    @Column({
        type: DataType.STRING,
        allowNull: true,
        defaultValue: 'Nigeria',
    })
    country: string;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    postalCode: string;

    @Column({
        type: DataType.DECIMAL(10, 8),
        allowNull: true,
    })
    latitude: number;

    @Column({
        type: DataType.DECIMAL(11, 8),
        allowNull: true,
    })
    longitude: number;

    @Column({
        type: DataType.TEXT,
        allowNull: true,
    })
    additionalDirections: string; // Landmarks, gate codes, etc.

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    contactPhone: string; // Alternative contact for this address

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    contactName: string; // Alternative contact person name

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: false,
    })
    isDefault: boolean;

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: true,
    })
    isActive: boolean;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    googlePlaceId: string; // Google Place ID for reference

    @Column({
        type: DataType.JSONB,
        allowNull: true,
        defaultValue: {},
    })
    googlePlaceData: {
        placeId?: string;
        types?: string[];
        geometry?: {
            location: {
                lat: number;
                lng: number;
            };
        };
        addressComponents?: Array<{
            longName: string;
            shortName: string;
            types: string[];
        }>;
        formattedAddress?: string;
    };

    @Column({
        type: DataType.DATE,
        allowNull: true,
    })
    lastUsedAt: Date; // Track when address was last used for sorting

    @IsUUID(4)
    @ForeignKey(() => User)
    @Column
    userId: string;

    @BelongsTo(() => User)
    user: User;

    @BeforeCreate
    @BeforeUpdate
    static async ensureOnlyOneDefault(instance: UserAddress) {
        if (instance.isDefault) {
            // Set all other addresses for this user to not default
            await UserAddress.update(
                { isDefault: false },
                {
                    where: {
                        userId: instance.userId,
                        id: { [require('sequelize').Op.ne]: instance.id },
                    },
                }
            );
        }
    }

    // Virtual field for formatted address
    get formattedAddress(): string {
        return this.fullAddress || `${this.address}, ${this.city}, ${this.state}, ${this.country}${this.postalCode ? ` ${this.postalCode}` : ''}`;
    }

    // Virtual field for display name
    get displayName(): string {
        return this.title ? `${this.title}` : this.fullAddress;
    }

    // Update last used timestamp
    async markAsUsed(): Promise<void> {
        await this.update({ lastUsedAt: new Date() });
    }
}

export interface IUserAddress {
    id?: string;
    title?: string;
    type?: string;
    fullAddress: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    latitude?: number;
    longitude?: number;
    additionalDirections?: string;
    contactPhone?: string;
    contactName?: string;
    isDefault?: boolean;
    isActive?: boolean;
    googlePlaceId?: string;
    googlePlaceData?: any;
    lastUsedAt?: Date;
    userId: string;
    user?: User;
    formattedAddress?: string;
    displayName?: string;
}