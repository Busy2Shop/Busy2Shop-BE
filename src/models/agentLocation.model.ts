import {
    Table, Column, Model, DataType, ForeignKey, BelongsTo,
    IsUUID, PrimaryKey, Default, Index,
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

    @BelongsTo(() => User)
        agent: User;
} 