/* eslint-disable no-unused-vars */
import { AdminType } from 'models/admin.model';
import { SenderType } from '../../models/chatMessage.model';
import { Socket } from 'socket.io';


export interface LocationUpdateData {
    latitude: number;
    longitude: number;
    timestamp: number;
    agentId?: string;
    orderId?: string;
    speed?: number;
    heading?: number;
    regionId?: string;
}

export interface LocationSubscriptionData {
    orderId?: string;
    regionId?: string;
    agentId?: string;
}

export interface LocationRoom {
    type: 'order' | 'region' | 'agent';
    id: string;
}

export interface LocationSubscriptionStatus {
    success: boolean;
    room: LocationRoom;
    message?: string;
}

export interface ChatMessageType {
    id: string;
    orderId: string;
    senderId: string;
    senderType: SenderType;
    message: string;
    imageUrl?: string;
    isRead: boolean;
    createdAt: Date | string;
    updatedAt: Date | string;
}

export interface ChatActivationType {
    orderId: string;
    activatedBy: {
        id: string;
        type: SenderType;
        name: string;
    };
}

export interface SocketUser {
    id: string;
    type: SenderType;
    name: string;
    adminType?: AdminType;
    supermarketId?: string | null;
}

export interface SocketData {
    user: SocketUser;
    token: string;
}

export interface ClientToServerEvents {
    // Chat events
    'join-order-chat': (orderId: string) => void;
    'send-message': (data: { orderId: string; message: string; imageUrl?: string }) => void;
    'typing': (data: { orderId: string; isTyping: boolean }) => void;
    'activate-chat': (orderId: string) => void;
    'mark-messages-read': (orderId: string) => void;
    'leave-order-chat': (orderId: string) => void;

    // Location events
    'update-location': (data: LocationUpdateData) => void;
    'subscribe-to-location': (data: LocationSubscriptionData) => void;
    'unsubscribe-from-location': (data: LocationSubscriptionData) => void;
}

export interface ServerToClientEvents {
    // Chat events
    'previous-messages': (messages: ChatMessageType[]) => void;
    'new-message': (message: ChatMessageType) => void;
    'user-typing': (data: { user: { id: string; name: string }; isTyping: boolean }) => void;
    'user-joined': (user: SocketUser) => void;
    'user-left': (user: SocketUser) => void;
    'chat-activated': (data: ChatActivationType) => void;

    // Location events
    'location-update': (data: LocationUpdateData) => void;
    'location-subscription-status': (data: LocationSubscriptionStatus) => void;

    // General events
    'error': (error: { message: string }) => void;
}

export interface InterServerEvents {
    ping: () => void;
}

export type CustomSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

