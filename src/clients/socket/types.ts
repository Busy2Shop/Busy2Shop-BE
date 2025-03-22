/* eslint-disable no-unused-vars */
import { AdminType } from 'models/admin.model';
import { SenderType } from '../../models/chatMessage.model';
import { Socket } from 'socket.io';

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
    'join-order-chat': (orderId: string) => void;
    'send-message': (data: { orderId: string; message: string; imageUrl?: string }) => void;
    'typing': (data: { orderId: string; isTyping: boolean }) => void;
    'activate-chat': (orderId: string) => void;
    'mark-messages-read': (orderId: string) => void;
    'leave-order-chat': (orderId: string) => void;
}

export interface ServerToClientEvents {
    'previous-messages': (messages: ChatMessageType[]) => void;
    'new-message': (message: ChatMessageType) => void;
    'user-typing': (data: { user: { id: string; name: string }; isTyping: boolean }) => void;
    'user-joined': (user: SocketUser) => void;
    'user-left': (user: SocketUser) => void;
    'chat-activated': (data: ChatActivationType) => void;
    'error': (error: { message: string }) => void;
}

export interface InterServerEvents {
    ping: () => void;
}

export type CustomSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>; export interface ChatMessageType {
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

