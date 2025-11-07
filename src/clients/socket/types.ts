/* eslint-disable no-unused-vars */
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
    profileImage?: string;
    isSuperAdmin?: boolean;
}

export interface SocketData {
    user: SocketUser;
    token: string;
}

export interface ClientToServerEvents {
    'join-order-chat': (orderId: string) => void;
    'send-message': (data: { orderId: string; message: string; imageUrl?: string }) => void;
    typing: (data: { orderId: string; isTyping: boolean }) => void;
    'activate-chat': (orderId: string) => void;
    'mark-messages-read': (orderId: string) => void;
    'leave-order-chat': (orderId: string) => void;
    heartbeat: () => void;
    // Call events
    'call:check-availability': (data: { orderId: string; recipientId: string }) => void;
    'call:initiate': (data: { orderId: string; recipientId: string; recipientType: 'agent' | 'customer' }) => void;
    'call:accept': (data: { callId: string }) => void;
    'call:reject': (data: { callId: string; reason?: string }) => void;
    'call:reconnect': (data: { callId: string; userId: string }) => void;
    'call:offer': (data: { callId: string; recipientId: string; sdp: any }) => void;
    'call:answer': (data: { callId: string; callerId: string; sdp: any }) => void;
    'call:ice-candidate': (data: { callId: string; recipientId: string; candidate: RTCIceCandidateInit }) => void;
    'call:end': (data: { callId: string; duration?: number; reason?: string }) => void;
}

export interface ServerToClientEvents {
    'previous-messages': (messages: ChatMessageType[]) => void;
    'new-message': (message: ChatMessageType) => void;
    'user-typing': (data: { user: { id: string; name: string }; isTyping: boolean }) => void;
    'user-joined': (user: SocketUser) => void;
    'user-left': (user: SocketUser) => void;
    'chat-activated': (data: ChatActivationType) => void;
    'connection-status': (data: { status: string; userId: string; userType: string }) => void;
    'messages-read': (data: { orderId: string; userId: string }) => void;
    error: (error: { message: string }) => void;
    // Call events
    'call:availability-response': (data: { available: boolean; reason?: string; recipientId?: string; orderId?: string }) => void;
    'call:initiated': (data: { callId?: string; orderId: string; recipientId: string }) => void;
    'call:incoming': (data: { callId: string; callerId: string; callerName: string; orderId: string; orderNumber: string }) => void;
    'call:accepted': (data: { callId: string; acceptedBy: string; acceptedAt: number; recipientSocketId: string | null; callerSocketId: string | null }) => void;
    'call:rejected': (data: { callId: string; rejectedBy: string; reason?: string; rejectedAt: number }) => void;
    'call:reconnected': (data: { callId: string; session: any; message: string }) => void;
    'call:timeout': (data: { callId: string; reason: string; timeoutAt: number }) => void;
    'call:ended': (data: { callId: string; endedBy: string; reason?: string; duration: number; endedAt: number }) => void;
    'call:offer': (data: { callId: string; sdp: any; from: string; fromName?: string }) => void;
    'call:answer': (data: { callId: string; sdp: any; from: string }) => void;
    'call:ice-candidate': (data: { callId: string; candidate: RTCIceCandidateInit; from: string }) => void;
    'call:error': (data: { message?: string; callId?: string }) => void;
}

export interface InterServerEvents {
    ping: () => void;
}

export type CustomSocket = Socket<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
>;
