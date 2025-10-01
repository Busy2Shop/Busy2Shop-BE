/* eslint-disable no-unused-vars */
import User, { IUser } from '../models/user.model';

export interface SaveTokenToCache {
    key: string;
    token: string;
    expiry?: number;
}

export type AuthToken =
    | 'setup'
    | 'access'
    | 'refresh'
    | 'passwordreset'
    | 'emailverification'
    | 'setpassword'
    | 'adminlogin'
    | 'admin';

export type ENCRYPTEDTOKEN = AuthToken | 'admin';

export interface GenerateTokenData {
    type: AuthToken;
    user: User;
}
export interface GenerateAdminTokenData {
    type: AuthToken;
    identifier: string;
}

export interface GenerateCodeData {
    type: AuthToken;
    identifier: string;
    expiry: number;
}

export interface CompareTokenData {
    tokenType: AuthToken;
    user: IUser & { id: string };
    token: string;
}
export interface CompareAdminTokenData {
    tokenType: AuthToken;
    identifier: string;
    token: string;
}

export interface DeleteToken {
    tokenType: AuthToken;
    tokenClass: 'token' | 'code';
    user: IUser & { id: string };
}

export type DecodedUser = { id: string };

export interface DecodedTokenData {
    user: DecodedUser;
    token: string;
    tokenType: AuthToken;
    authKey?: string;
}

export interface TenantQueries {
    TenantId: number;
    type: string;
    query: string;
}

export enum NotificationTypes {
    // Order Notifications
    ORDER_CREATED = 'Order Created',
    ORDER_UPDATED = 'Order Updated',
    ORDER_DELETED = 'Order Deleted',
    ORDER_ACCEPTED = 'Order Accepted',
    ORDER_REJECTED = 'Order Rejected',
    ORDER_COMPLETED = 'Order Completed',

    // Payment Notifications
    PAYMENT_SUCCESSFUL = 'Payment Successful',
    PAYMENT_FAILED = 'Payment Failed',
    PAYMENT_EXPIRED = 'Payment Expired',
    PAYMENT_PENDING = 'Payment Pending',

    // User Notifications
    USER_CREATED = 'User Created',
    USER_UPDATED = 'User Updated',
    USER_DELETED = 'User Deleted',
    USER_BLOCKED = 'User Blocked',
    USER_UNBLOCKED = 'User Unblocked',

    // Admin Notifications
    ADMIN_CREATED = 'Admin Created',
    ADMIN_UPDATED = 'Admin Updated',
    ADMIN_DELETED = 'Admin Deleted',
    ADMIN_BLOCKED = 'Admin Blocked',
    ADMIN_UNBLOCKED = 'Admin Unblocked',

    // Product Notifications
    PRODUCT_CREATED = 'Product Created',
    PRODUCT_UPDATED = 'Product Updated',
    PRODUCT_DELETED = 'Product Deleted',
    PRODUCT_UNAVAILABLE = 'Product Unavailable',
    PRODUCT_AVAILABLE = 'Product Available',

    // Shopping List Notifications
    SHOPPING_LIST_CREATED = 'Shopping List Created',
    SHOPPING_LIST_UPDATED = 'Shopping List Updated',
    SHOPPING_LIST_DELETED = 'Shopping List Deleted',
    SHOPPING_LIST_ASSIGNED = 'Shopping List Assigned',
    SHOPPING_LIST_SUBMITTED = 'Shopping List Submitted',

    // Market Notifications
    MARKET_CREATED = 'Market Created',
    MARKET_UPDATED = 'Market Updated',
    MARKET_DELETED = 'Market Deleted',
    MARKET_CLOSED = 'Market Closed',
    MARKET_OPENED = 'Market Opened',

    // Agent Notifications
    AGENT_ASSIGNED = 'Agent Assigned',
    AGENT_UNASSIGNED = 'Agent Unassigned',
    AGENT_LOCATION_UPDATED = 'Agent Location Updated',
    AGENT_STATUS_CHANGED = 'Agent Status Changed',
    NEW_ORDER_ASSIGNED = 'New Order Assigned',

    // Order Status Notifications
    ORDER_IN_PROGRESS = 'Order In Progress',
    ORDER_READY = 'Order Ready',
    ORDER_DELIVERY_STARTED = 'Order Delivery Started',

    // Chat Notifications
    CHAT_MESSAGE_RECEIVED = 'Chat Message Received',
    CHAT_ACTIVATED = 'Chat Activated',
    USER_LEFT_CHAT = 'User Left Chat',
}

export interface Notifications {
    title: NotificationTypes;
    message: string;
    heading: string;
    id?: string;
    read?: boolean;
    resource?: string | null;
    icon?: string | null;
    userId?: string;
}
