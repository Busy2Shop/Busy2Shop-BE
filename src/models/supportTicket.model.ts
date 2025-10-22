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

// Define enum for ticket priority
export enum TicketPriority {
    Low = 'low',
    Medium = 'medium',
    High = 'high',
    Urgent = 'urgent',
}

// Define enum for ticket category
export enum TicketCategory {
    Technical = 'technical',
    Billing = 'billing',
    General = 'general',
    Partnership = 'partnership',
    Feedback = 'feedback',
    Other = 'other',
}

// Response interface for conversation thread
export interface ITicketResponse {
    id: string;
    message: string;
    responderId: string;
    responderName: string;
    isAdmin: boolean;
    timestamp: Date;
}

// Attachment interface
export interface ITicketAttachment {
    id: string;
    filename: string;
    url: string;
    size: number;
    uploadedBy: string;
    uploadedAt: Date;
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

    @Column({ type: DataType.STRING, allowNull: true })
    phone: string;

    @Column({
        type: DataType.ENUM,
        values: Object.values(TicketPriority),
        defaultValue: TicketPriority.Medium,
    })
    priority: TicketPriority;

    @Column({
        type: DataType.ENUM,
        values: Object.values(TicketCategory),
        allowNull: false,
        defaultValue: TicketCategory.General,
    })
    category: TicketCategory;

    @Column({ type: DataType.STRING, allowNull: true })
    assignedAdminId: string;

    @BelongsTo(() => User, 'assignedAdminId')
    assignedAdmin: User;

    @Column({ type: DataType.JSONB, defaultValue: [] })
    responses: ITicketResponse[];

    @Column({ type: DataType.DATE, allowNull: true })
    lastResponseAt: Date;

    @Column({ type: DataType.DATE, allowNull: true })
    resolvedAt: Date;

    @Column({ type: DataType.STRING, allowNull: true })
    resolvedBy: string;

    @BelongsTo(() => User, 'resolvedBy')
    resolver: User;

    @Column({ type: DataType.JSONB, defaultValue: [] })
    attachments: ITicketAttachment[];

    @Column({ type: DataType.STRING, allowNull: true })
    userAgent: string;

    @Column({ type: DataType.STRING, allowNull: true })
    ipAddress: string;

    @CreatedAt
    createdAt: Date;

    @UpdatedAt
    updatedAt: Date;

    // Optional foreign key to User model (ticket creator)
    @Column({ type: DataType.STRING, allowNull: true })
    userId: string;

    @BelongsTo(() => User, 'userId')
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
    phone?: string;
    priority?: TicketPriority;
    category: TicketCategory;
    assignedAdminId?: string | null;
    responses?: ITicketResponse[];
    lastResponseAt?: Date;
    resolvedAt?: Date;
    resolvedBy?: string | null;
    attachments?: ITicketAttachment[];
    userAgent?: string;
    ipAddress?: string;
}
