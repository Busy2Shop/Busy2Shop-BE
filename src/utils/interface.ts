/* eslint-disable no-unused-vars */
import User, { IUser } from '../models/user.model';

export interface SaveTokenToCache {
    key: string,
    token: string,
    expiry?: number
}

export type AuthToken = 'access' | 'refresh' | 'passwordreset' | 'emailverification' | 'setpassword' | 'adminlogin' | 'admin';

export type ENCRYPTEDTOKEN = AuthToken | 'admin'

export interface GenerateTokenData {
    type: AuthToken,
    user: User,
}
export interface GenerateAdminTokenData {
    type: AuthToken,
    identifier: string,
}

export interface GenerateCodeData {
    type: AuthToken,
    identifier: string,
    expiry: number,
}

export interface CompareTokenData {
    tokenType: AuthToken,
    user: IUser & { id: string },
    token: string
}
export interface CompareAdminTokenData {
    tokenType: AuthToken,
    identifier: string,
    token: string
}

export interface DeleteToken {
    tokenType: AuthToken,
    tokenClass: 'token' | 'code',
    user: IUser & { id: string },
}

export type DecodedUser = { id: string };

export interface DecodedTokenData {
    user: DecodedUser,
    token: string,
    tokenType: AuthToken
    authKey?: string
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

    // Product Notifications
    
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