/* eslint-disable no-unused-vars */
import {
    Table,
    Column,
    Model,
    DataType,
    PrimaryKey,
    Default,
    CreatedAt,
    UpdatedAt,
    IsUUID,
    AllowNull,
    ForeignKey,
    BelongsTo,
} from 'sequelize-typescript';

import User from './user.model';

// Define enum for ticket type
export enum TicketType {
    SupportRequest = 'Support-Request',
    BugReport = 'Bug-Report',
}

// Define enum for ticket state
export enum TicketState {
    Pending = 'Pending',
    InProgress = 'In Progress',
    Resolved = 'Resolved',
    Closed = 'Closed',
}

@Table
export default class SupportTicket extends Model<SupportTicket | ISupportTicket> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
    id: string;

    @Column({ type: DataType.STRING, allowNull: false })
    email: string;

    @Column({ type: DataType.STRING, allowNull: false })
    name: string;

    @Column({ type: DataType.TEXT, allowNull: false })
    message: string;

    @Column({ type: DataType.STRING, allowNull: false })
    subject: string;

    @Column({ type: DataType.ENUM, values: Object.values(TicketType), allowNull: false })
    type: TicketType;

    @Column({
        type: DataType.ENUM,
        values: Object.values(TicketState),
        defaultValue: TicketState.Pending,
    })
    state: TicketState;

    @Column({ type: DataType.STRING, allowNull: true })
    adminKey: string;

    @CreatedAt
    createdAt: Date;

    @UpdatedAt
    updatedAt: Date;

    // Optional foreign key to User model
    @IsUUID(4)
    @AllowNull(true)
    @ForeignKey(() => User)
    @Column
    userId: string;

    @BelongsTo(() => User)
    user: User;
}

export interface ISupportTicket {
    email: string;
    name: string;
    message: string;
    subject: string;
    type: TicketType;
    state?: TicketState;
    adminKey?: string;
    userId?: string | null;
}
