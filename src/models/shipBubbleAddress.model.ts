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
} from 'sequelize-typescript';
import UserAddress from './userAddress.model';
import Market from './market.model';

/**
 * ShipBubbleAddress Model
 * Caches validated addresses from ShipBubble API to avoid repeated validation costs
 * Links to either UserAddress OR Market (not both)
 */
@Table({
    tableName: 'shipbubble_addresses',
    indexes: [
        { fields: ['address_code'] },
        { fields: ['user_address_id'] },
        { fields: ['market_id'] },
        { fields: ['user_address_id', 'address_hash'], unique: true, name: 'unique_user_address' },
        { fields: ['market_id', 'address_hash'], unique: true, name: 'unique_market_address' },
    ],
})
export default class ShipBubbleAddress extends Model<ShipBubbleAddress | IShipBubbleAddress> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
    id: string;

    @IsUUID(4)
    @ForeignKey(() => UserAddress)
    @Column({
        allowNull: true,
    })
    user_address_id: string;

    @BelongsTo(() => UserAddress, 'user_address_id')
    userAddress: UserAddress;

    @IsUUID(4)
    @ForeignKey(() => Market)
    @Column({
        allowNull: true,
    })
    market_id: string;

    @BelongsTo(() => Market, 'market_id')
    market: Market;

    @Column({
        type: DataType.INTEGER,
        allowNull: false,
        unique: true,
        comment: 'ShipBubble address code (integer returned from validation)',
    })
    address_code: number;

    @Column({
        type: DataType.TEXT,
        allowNull: true,
        comment: 'ShipBubble formatted address string',
    })
    formatted_address: string;

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
        type: DataType.STRING(64),
        allowNull: false,
        comment: 'SHA256 hash of address components for change detection',
    })
    address_hash: string;

    @Column({
        type: DataType.DATE,
        allowNull: true,
        defaultValue: DataType.NOW,
        comment: 'When this address was last validated with ShipBubble',
    })
    validation_date: Date;
}

export interface IShipBubbleAddress {
    id?: string;
    user_address_id?: string;
    market_id?: string;
    address_code: number;
    formatted_address?: string;
    latitude?: number;
    longitude?: number;
    address_hash: string;
    validation_date?: Date;
}
