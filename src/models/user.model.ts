import {
    Table,
    Column,
    Model,
    DataType,
    HasOne,
    Default,
    BeforeFind,
    Scopes,
    IsEmail,
    IsUUID,
    PrimaryKey,
    Index,
    BeforeCreate,
    BeforeUpdate,
    HasMany,
    AfterCreate,
} from 'sequelize-typescript';
import Password from './password.model';
import UserSettings from './userSettings.model';
import { FindOptions } from 'sequelize';
import Market from './market.model';
import Review from './review.model';
import ShoppingList from './shoppingList.model';
import AgentLocation from './agentLocation.model';
import UserAddress from './userAddress.model';

export type userTypeValues = 'agent' | 'customer';

export interface IUserStatus {
    activated: boolean;
    emailVerified: boolean;
    userType: userTypeValues;
}

@Scopes(() => ({
    withSettings: {
        include: [
            {
                model: UserSettings,
                as: 'settings',
                attributes: [
                    'joinDate',
                    'isBlocked',
                    'isDeactivated',
                    'lastLogin',
                    'meta',
                    'agentMetaData',
                ],
            },
        ],
    },
}))
@Table
export default class User extends Model<User | IUser> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
    id: string;

    @IsEmail
    @Index
    @Column({
        type: DataType.STRING,
        allowNull: false,
        get() {
            const email = this.getDataValue('email');
            return email ? email.trim().toLowerCase() : '';
        },
        set(value: string) {
            this.setDataValue('email', value.trim().toLowerCase());
        },
    })
    email: string;

    @Index
    @Column({
        type: DataType.STRING,
        allowNull: true,
        set(value: string) {
            this.setDataValue('firstName', User.capitalizeFirstLetter(value));
        },
    })
    firstName: string;

    @Index
    @Column({
        type: DataType.STRING,
        allowNull: true,
        set(value: string) {
            this.setDataValue('lastName', User.capitalizeFirstLetter(value));
        },
    })
    lastName: string;

    @Column({
        type: DataType.STRING,
        set(value: string) {
            if (value) {
                this.setDataValue('otherName', User.capitalizeFirstLetter(value));
            }
        },
    })
    otherName: string;

    @Column({ type: DataType.STRING })
    gender: string;

    @Column({ type: DataType.STRING })
    displayImage: string;

    @Column({
        type: DataType.JSONB,
        defaultValue: {},
        allowNull: false,
    })
    status: IUserStatus;

    @Column({
        type: DataType.JSONB,
        allowNull: true,
    })
    location: {
        country: string;
        city: string;
        address: string;
    };

    @Column({
        type: DataType.VIRTUAL,
        get() {
            if (this.getDataValue('otherName')) {
                return `${this.getDataValue('firstName')} ${this.getDataValue('lastName')} ${this.getDataValue('otherName')}`.trim();
            } else {
                return `${this.getDataValue('firstName')} ${this.getDataValue('lastName')}`.trim();
            }
        },
        set(value: string) {
            const names = value.split(' ');
            this.setDataValue('firstName', names[0]);
            this.setDataValue('lastName', names.slice(1).join(' '));
        },
    })
    fullName: string;

    @Column({ type: DataType.JSONB })
    phone: {
        countryCode: string;
        number: string;
    };

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    googleId: string;

    @Column({
        type: DataType.DATEONLY,
        validate: {
            isDate: true,
            isValidDate(value: string | Date) {
                if (new Date(value) > new Date()) {
                    throw new Error('Date of birth cannot be in the future');
                }
            },
        },
    })
    dob: Date;

    // Associations
    @HasOne(() => Password)
    password: Password;

    @HasOne(() => UserSettings, {
        onDelete: 'CASCADE',
    })
    settings: UserSettings;

    // Association with AgentLocation model
    @HasMany(() => AgentLocation, 'agentId')
    locations?: AgentLocation[];

    @BeforeFind
    static beforeFindHook(options: FindOptions) {
        if (options.where && 'email' in options.where && typeof options.where.email === 'string') {
            const whereOptions = options.where as { email?: string };
            if (whereOptions.email) {
                whereOptions.email = whereOptions.email.trim().toLowerCase();
            }
        }
    }

    @BeforeCreate
    @BeforeUpdate
    static beforeSaveHook(instance: User) {
        // Only capitalize if the field is changed (for updates) or new (for creations)
        if (instance.changed('firstName')) {
            instance.firstName = User.capitalizeFirstLetter(instance.firstName);
        }
        if (instance.changed('lastName')) {
            instance.lastName = User.capitalizeFirstLetter(instance.lastName);
        }
        if (instance.changed('otherName') && instance.otherName) {
            instance.otherName = User.capitalizeFirstLetter(instance.otherName);
        }
    }

    @AfterCreate
    static async validateAgentMeta(instance: User) {
        if (instance.status?.userType === 'agent') {
            const userSettings = await UserSettings.findOne({ where: { userId: instance.id } });
            if (userSettings) {
                // Initialize agent metadata with default values
                await userSettings.update({
                    agentMetaData: {
                        nin: '',
                        images: [],
                        currentStatus: 'offline',
                        lastStatusUpdate: new Date().toISOString(),
                        isAcceptingOrders: false,
                    },
                });
            }
        }
    }

    // Markets owned by the user (for vendors/supermarket owners)
    @HasMany(() => Market)
    ownedMarkets: Market[];

    // Shopping lists created by the user
    @HasMany(() => ShoppingList)
    shoppingLists: ShoppingList[];

    // Shopping lists assigned to the user as an agent
    @HasMany(() => ShoppingList, 'agentId')
    assignedOrders: ShoppingList[];

    // Reviews written by the user
    @HasMany(() => Review, 'reviewerId')
    reviews: Review[];

    // User delivery addresses
    @HasMany(() => UserAddress)
    addresses: UserAddress[];

    static capitalizeFirstLetter(str: string): string {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}

export interface IUser {
    email: string;
    firstName?: string;
    lastName?: string;
    otherName?: string;
    googleId?: string;
    location?: {
        country: string;
        city: string;
        address: string;
    };
    status: {
        activated: boolean;
        emailVerified: boolean;
        userType: userTypeValues;
    };
    displayImage?: string;
    fullName?: string;
    phone?: {
        countryCode: string;
        number: string;
    };
    dob?: Date;
    gender?: string;
    ownedMarkets?: Market[];
    shoppingLists?: ShoppingList[];
    assignedOrders?: ShoppingList[];
    reviews?: Review[];
    locations?: AgentLocation[];
    addresses?: UserAddress[];
}
