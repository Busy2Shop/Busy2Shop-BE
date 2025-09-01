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
    Index,
} from 'sequelize-typescript';
import User from './user.model';

export interface IAgentLocation {
    id: string;
    agentId: string;
    latitude: number;
    longitude: number;
    radius: number; // in kilometers
    isActive: boolean;
    name?: string; // optional name for the location
    address?: string; // optional address description
    locationType?: 'service_area' | 'current_location'; // distinguish between service areas and real-time location
    accuracy?: number; // for real-time location accuracy
    timestamp?: number; // for real-time location timestamp
}

@Table
export default class AgentLocation extends Model<AgentLocation | IAgentLocation> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
    id: string;

    @IsUUID(4)
    @ForeignKey(() => User)
    @Index
    @Column
    agentId: string;

    @Column({
        type: DataType.DECIMAL(10, 8),
        allowNull: false,
    })
    latitude: number;

    @Column({
        type: DataType.DECIMAL(11, 8),
        allowNull: false,
    })
    longitude: number;

    @Column({
        type: DataType.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 5.0, // default 5km radius
    })
    radius: number;

    @Column({
        type: DataType.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    })
    isActive: boolean;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    name?: string;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    address?: string;

    @Column({
        type: DataType.ENUM('service_area', 'current_location'),
        allowNull: false,
        defaultValue: 'service_area',
    })
    locationType: 'service_area' | 'current_location';

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: true,
    })
    accuracy?: number;

    @Column({
        type: DataType.BIGINT,
        allowNull: true,
    })
    timestamp?: number;

    @BelongsTo(() => User)
    agent: User;
}
