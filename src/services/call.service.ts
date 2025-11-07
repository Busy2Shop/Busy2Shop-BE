import { Server } from 'socket.io';
import Call, { CallStatus, CallerType, EndReason } from '../models/call.model';
import Order from '../models/order.model';
import User from '../models/user.model';
import UserPresenceService from './user-presence.service';
import SmartNotificationDispatcher from './smart-notification.dispatcher';
import { redisClient } from '../utils/redis';
import { logger } from '../utils/logger';

interface CallSession {
    callId: string;
    orderId: string;
    callerId: string;
    callerSocketId: string;
    recipientId: string;
    recipientSocketId: string;
    status: 'initiating' | 'ringing' | 'active';
    createdAt: number;
    expiresAt: number;
}

/**
 * Call Service - Handles audio calling business logic
 * Manages call lifecycle, timeouts, and socket coordination
 */
export class CallService {
    private static instance: CallService;
    private io: Server | null = null;
    private callTimeouts: Map<string, NodeJS.Timeout> = new Map();

    private constructor() {}

    public static getInstance(): CallService {
        if (!CallService.instance) {
            CallService.instance = new CallService();
        }
        return CallService.instance;
    }

    /**
     * Set the Socket.IO server instance
     */
    public setSocketServer(io: Server): void {
        logger.info('📞 [CALLSERVICE] setSocketServer called');
        this.io = io;
        logger.info('📞 [CALLSERVICE] Socket server set successfully', {
            hasIO: !!this.io,
            ioType: typeof this.io
        });
    }

    /**
     * Get the Socket.IO server instance
     */
    public getSocketServer(): Server | null {
        return this.io;
    }

    /**
     * Check if user can initiate call on this order (authorization)
     */
    private async canUserCallOrder(
        userId: string,
        userType: CallerType,
        orderId: string,
    ): Promise<boolean> {
        try {
            const order = await Order.findByPk(orderId);
            if (!order) return false;

            if (userType === 'customer' && order.customerId !== userId) {
                return false;
            }

            if (userType === 'agent' && order.agentId !== userId) {
                return false;
            }

            return true;
        } catch (error) {
            logger.error('📞 [CALLSERVICE] Error checking call authorization:', error);
            return false;
        }
    }

    /**
     * Check if user is currently in a call
     * Uses Redis SET for O(1) lookup instead of O(N) keys scan
     */
    public async isUserInCall(userId: string): Promise<boolean> {
        try {
            logger.info('📞 [CALLSERVICE] isUserInCall START:', { userId });

            const isInCall = await redisClient.sismember('active-calls:users', userId);
            const result = isInCall === 1;

            // Enhanced logging to debug the issue
            const allActiveUsers = await redisClient.smembers('active-calls:users');
            logger.info('📞 [CALLSERVICE] isUserInCall DETAILED CHECK:', {
                userId,
                redisResult: isInCall,
                redisResultType: typeof isInCall,
                calculatedResult: result,
                allActiveUsersCount: allActiveUsers.length,
                allActiveUsers: allActiveUsers,
                userInArray: allActiveUsers.includes(userId)
            });

            return result;
        } catch (error) {
            logger.error('📞 [CALLSERVICE] Error checking if user is in call:', error);
            // Fallback to old method if SET operation fails
            try {
                const keys = await redisClient.keys('call:*:session');
                logger.info('📞 [CALLSERVICE] Fallback check - found keys:', keys.length);
                for (const key of keys) {
                    const sessionData = await redisClient.get(key);
                    if (sessionData) {
                        const session: CallSession = JSON.parse(sessionData);
                        if (session.callerId === userId || session.recipientId === userId) {
                            logger.info('📞 [CALLSERVICE] Fallback found user in call:', {
                                userId,
                                callId: session.callId
                            });
                            return true;
                        }
                    }
                }
                logger.info('📞 [CALLSERVICE] Fallback check - user not in call');
                return false;
            } catch (fallbackError) {
                logger.error('📞 [CALLSERVICE] Fallback check also failed:', fallbackError);
                return false;
            }
        }
    }

    /**
     * Add user to active calls SET
     * @private
     */
    private async addUserToActiveCallsSet(userId: string): Promise<void> {
        try {
            await redisClient.sadd('active-calls:users', userId);
            logger.info(`📞 [CALLSERVICE] Added user ${userId} to active calls SET`);
        } catch (error) {
            logger.error(`📞 [CALLSERVICE] Error adding user ${userId} to active calls SET:`, error);
        }
    }

    /**
     * Remove user from active calls SET
     * @private
     */
    private async removeUserFromActiveCallsSet(userId: string): Promise<void> {
        try {
            await redisClient.srem('active-calls:users', userId);
            logger.info(`📞 [CALLSERVICE] Removed user ${userId} from active calls SET`);
        } catch (error) {
            logger.error(`📞 [CALLSERVICE] Error removing user ${userId} from active calls SET:`, error);
        }
    }

    /**
     * Get active socket IDs for a user from their room
     * This replaces the old static socket ID storage approach
     */
    private async getActiveSocketsForUser(userId: string): Promise<string[]> {
        try {
            if (!this.io) {
                logger.error('📞 [CALLSERVICE] Socket.IO server not initialized');
                return [];
            }

            // Get all sockets in the user's room
            const sockets = await this.io.in(`user:${userId}`).fetchSockets();
            const socketIds = sockets.map(socket => socket.id);

            logger.info(`📞 [CALLSERVICE] Found ${socketIds.length} active sockets for user ${userId}`, {
                socketIds
            });

            return socketIds;
        } catch (error) {
            logger.error('📞 [CALLSERVICE] Error getting active sockets for user:', error);
            return [];
        }
    }

    /**
     * Get call session from Redis (for reconnection)
     */
    public async getCallSession(callId: string): Promise<{ success: boolean; session?: CallSession; error?: string }> {
        try {
            const sessionData = await redisClient.get(`call:${callId}:session`);
            if (!sessionData) {
                return { success: false, error: 'Call session not found' };
            }

            const session: CallSession = JSON.parse(sessionData);
            return { success: true, session };
        } catch (error) {
            logger.error('📞 [CALLSERVICE] Error getting call session:', error);
            return { success: false, error: 'Internal server error' };
        }
    }

    /**
     * Initiate a call
     */
    public async initiateCall(
        orderId: string,
        callerId: string,
        callerType: CallerType,
        callerName: string,
        callerProfileImage: string | undefined,
        callerSocketId: string,
        recipientId: string,
        recipientType: CallerType,
    ): Promise<{ success: boolean; callId?: string; error?: string }> {
        try {
            // Authorization check
            const canCall = await this.canUserCallOrder(callerId, callerType, orderId);
            if (!canCall) {
                return { success: false, error: 'Unauthorized - you cannot call this order' };
            }

            // Check if recipient is online
            const isOnline = await UserPresenceService.isUserOnline(recipientId);
            if (!isOnline) {
                const lastSeen = await UserPresenceService.getTimeSinceLastSeen(recipientId);
                return {
                    success: false,
                    error: `Recipient is offline. Last seen ${lastSeen} minutes ago.`,
                };
            }

            // Check if caller is already in a call
            const callerInCall = await this.isUserInCall(callerId);
            if (callerInCall) {
                return { success: false, error: 'You are already in a call' };
            }

            // Check if recipient is already in a call
            const recipientInCall = await this.isUserInCall(recipientId);
            if (recipientInCall) {
                return { success: false, error: 'Recipient is already in another call' };
            }

            // Check if recipient has active sockets (is connected)
            const recipientSockets = await this.getActiveSocketsForUser(recipientId);
            if (recipientSockets.length === 0) {
                return { success: false, error: 'Recipient is not connected' };
            }

            // Create call record in database
            const call = await Call.create({
                orderId,
                callerId,
                callerType,
                recipientId,
                recipientType,
                status: 'initiating' as CallStatus,
            } as any);

            const callId = call.id;

            // Create simplified Redis session without socket IDs (they become stale)
            // Socket IDs will be resolved dynamically when needed
            const callSession = {
                callId,
                orderId,
                callerId,
                recipientId,
                status: 'initiating',
                createdAt: Date.now(),
                expiresAt: Date.now() + 30000, // 30 seconds
            };

            await redisClient.setex(`call:${callId}:session`, 30, JSON.stringify(callSession));

            // Set 30-second timeout
            const timeout = setTimeout(async () => {
                await this.handleCallTimeout(callId);
            }, 30000);

            this.callTimeouts.set(callId, timeout);

            // Emit call:incoming to recipient's user room
            if (this.io) {
                const order = await Order.findByPk(orderId);

                // Get recipient user details for complete participant info
                const recipientUser = await User.findByPk(recipientId);
                const recipientName = recipientUser
                    ? `${recipientUser.firstName} ${recipientUser.lastName}`.trim()
                    : 'Recipient';
                const recipientProfileImage = (recipientUser as any)?.profileImage || (recipientUser as any)?.displayImage;

                logger.info(`📞 [CALLSERVICE] Profile images:`, {
                    callerProfileImage,
                    recipientProfileImage,
                    callerName,
                    recipientName
                });

                // Emit to the user's room (all their connected sockets)
                logger.info(`📞 [CALLSERVICE] Emitting call:incoming to user room: user:${recipientId}`);
                this.io.to(`user:${recipientId}`).emit('call:incoming', {
                    callId,
                    callerId,
                    callerType,
                    callerName,
                    callerProfileImage,
                    callerSocketId, // Included for backward compatibility but won't be used
                    recipientId,
                    recipientType,
                    recipientName,
                    recipientProfileImage,
                    recipientSocketId: null, // Will be resolved dynamically on accept
                    orderId,
                    orderNumber: order?.orderNumber || orderId,
                    timestamp: Date.now(),
                });

                // Send push notification (instant)
                SmartNotificationDispatcher.dispatchCallIncomingNotification({
                    userId: recipientId,
                    callId,
                    callerName,
                    orderNumber: order?.orderNumber || orderId,
                });
            }

            logger.info(`📞 [CALLSERVICE] Call initiated successfully: ${callId} from ${callerId} to ${recipientId}`);

            return { success: true, callId };
        } catch (error) {
            logger.error('📞 [CALLSERVICE] Error initiating call:', error);
            return { success: false, error: 'Internal server error' };
        }
    }

    /**
     * Accept a call
     */
    public async acceptCall(
        callId: string,
        acceptedBy: string,
    ): Promise<{ success: boolean; error?: string }> {
        try {
            // Get call session from Redis
            const sessionData = await redisClient.get(`call:${callId}:session`);
            if (!sessionData) {
                return { success: false, error: 'Call session not found' };
            }

            const session = JSON.parse(sessionData);

            // Update database record
            await Call.update(
                {
                    status: 'active' as CallStatus,
                    answeredAt: new Date(),
                },
                {
                    where: { id: callId },
                },
            );

            // Clear 30-second timeout
            const timeout = this.callTimeouts.get(callId);
            if (timeout) {
                clearTimeout(timeout);
                this.callTimeouts.delete(callId);
            }

            // Update Redis session with longer TTL
            session.status = 'active';
            await redisClient.setex(`call:${callId}:session`, 3600, JSON.stringify(session)); // 1 hour

            // Add both users to active calls SET
            await this.addUserToActiveCallsSet(session.callerId);
            await this.addUserToActiveCallsSet(session.recipientId);

            // Emit call:accepted to both parties with dynamically resolved socket IDs for WebRTC
            if (this.io) {
                // Get current socket IDs for both parties
                const callerSockets = await this.getActiveSocketsForUser(session.callerId);
                const recipientSockets = await this.getActiveSocketsForUser(session.recipientId);

                logger.info(`📞 [CALLSERVICE] Call accepted - resolving socket IDs`, {
                    callId,
                    callerSockets,
                    recipientSockets
                });

                // Emit to both user rooms with current socket IDs
                this.io.to(`user:${session.callerId}`).emit('call:accepted', {
                    callId,
                    acceptedBy,
                    acceptedAt: Date.now(),
                    recipientSocketId: recipientSockets[0] || null,
                    callerSocketId: callerSockets[0] || null,
                });

                this.io.to(`user:${session.recipientId}`).emit('call:accepted', {
                    callId,
                    acceptedBy,
                    acceptedAt: Date.now(),
                    recipientSocketId: recipientSockets[0] || null,
                    callerSocketId: callerSockets[0] || null,
                });
            }

            logger.info(`📞 [CALLSERVICE] Call accepted: ${callId} by ${acceptedBy}`);

            return { success: true };
        } catch (error) {
            logger.error('📞 [CALLSERVICE] Error accepting call:', error);
            return { success: false, error: 'Internal server error' };
        }
    }

    /**
     * Reject a call
     */
    public async rejectCall(
        callId: string,
        rejectedBy: string,
        reason: 'user-declined' | 'busy',
    ): Promise<{ success: boolean; error?: string }> {
        try {
            logger.info(`📞 [CALLSERVICE] Rejecting call ${callId}`, {
                rejectedBy,
                reason
            });

            // Get call session from Redis
            const sessionData = await redisClient.get(`call:${callId}:session`);
            let session: CallSession | null = null;

            if (sessionData) {
                session = JSON.parse(sessionData);
                logger.info(`📞 [CALLSERVICE] Found Redis session for call ${callId}`);
            } else {
                logger.warn(`📞 [CALLSERVICE] No Redis session found for call ${callId} - attempting to reject anyway`);
            }

            // Update database record
            await Call.update(
                {
                    status: 'rejected' as CallStatus,
                    endReason: 'user-declined' as EndReason,
                    endedAt: new Date(),
                },
                {
                    where: { id: callId },
                },
            );

            // Clear timeout
            const timeout = this.callTimeouts.get(callId);
            if (timeout) {
                clearTimeout(timeout);
                this.callTimeouts.delete(callId);
                logger.info(`📞 [CALLSERVICE] Cleared timeout for call ${callId}`);
            }

            // Delete Redis session
            await redisClient.del(`call:${callId}:session`);

            // Remove users from active calls SET (if they were added)
            // Note: For rejected calls, users may not have been added to the SET yet
            // since rejection happens before acceptance, but we remove anyway to be safe
            if (session) {
                await this.removeUserFromActiveCallsSet(session.callerId);
                await this.removeUserFromActiveCallsSet(session.recipientId);
            }

            // Emit call:rejected to caller
            if (this.io && session) {
                this.io.to(session.callerSocketId).emit('call:rejected', {
                    callId,
                    rejectedBy,
                    reason,
                    rejectedAt: Date.now(),
                });

                // Also emit to user room as fallback
                this.io.to(`user:${session.callerId}`).emit('call:rejected', {
                    callId,
                    rejectedBy,
                    reason,
                    rejectedAt: Date.now(),
                });

                // Send push notification
                SmartNotificationDispatcher.dispatchCallRejectedNotification({
                    userId: session.callerId,
                    callId,
                    rejectedByName: 'Recipient', // TODO: Get actual name
                });

                logger.info(`📞 [CALLSERVICE] Emitted call:rejected event to caller`);
            } else if (this.io) {
                // Try to get call from database if no session
                const call = await Call.findByPk(callId);
                if (call) {
                    this.io.to(`user:${call.callerId}`).emit('call:rejected', {
                        callId,
                        rejectedBy,
                        reason,
                        rejectedAt: Date.now(),
                    });

                    SmartNotificationDispatcher.dispatchCallRejectedNotification({
                        userId: call.callerId,
                        callId,
                        rejectedByName: 'Recipient',
                    });

                    logger.info(`📞 [CALLSERVICE] Emitted call:rejected event using database call data`);
                }
            }

            logger.info(`📞 [CALLSERVICE] Call rejected successfully: ${callId} by ${rejectedBy}, reason: ${reason}`);

            return { success: true };
        } catch (error) {
            logger.error('📞 [CALLSERVICE] Error rejecting call:', error);
            return { success: false, error: 'Internal server error' };
        }
    }

    /**
     * End a call
     */
    public async endCall(
        callId: string,
        endedBy: string,
        duration: number,
        reason: 'user-hangup' | 'connection-error',
    ): Promise<{ success: boolean; error?: string }> {
        try {
            logger.info(`📞 [CALLSERVICE] Attempting to end call ${callId}`, {
                endedBy,
                duration,
                reason
            });

            // Get call session from Redis (may not exist if call timed out or was already ended)
            const sessionData = await redisClient.get(`call:${callId}:session`);
            let session: CallSession | null = null;

            if (sessionData) {
                session = JSON.parse(sessionData);
                logger.info(`📞 [CALLSERVICE] Found Redis session for call ${callId}`);
            } else {
                logger.warn(`📞 [CALLSERVICE] No Redis session found for call ${callId} - call may have timed out or already ended`);
            }

            // Update database record regardless of Redis session status
            const [updateCount] = await Call.update(
                {
                    status: 'ended' as CallStatus,
                    duration,
                    endReason: reason as EndReason,
                    endedAt: new Date(),
                },
                {
                    where: { id: callId },
                },
            );

            if (updateCount === 0) {
                logger.warn(`📞 [CALLSERVICE] Call ${callId} not found in database`);
                // Still try to clean up Redis and emit events
            }

            // Delete Redis session if it exists
            await redisClient.del(`call:${callId}:session`);

            // Remove both users from active calls SET
            if (session) {
                await this.removeUserFromActiveCallsSet(session.callerId);
                await this.removeUserFromActiveCallsSet(session.recipientId);
            }

            // Clear timeout if it exists
            const timeout = this.callTimeouts.get(callId);
            if (timeout) {
                clearTimeout(timeout);
                this.callTimeouts.delete(callId);
                logger.info(`📞 [CALLSERVICE] Cleared timeout for call ${callId}`);
            }

            // Emit call:ended to both parties if we have session data
            if (this.io && session) {
                this.io.to(session.callerSocketId).emit('call:ended', {
                    callId,
                    endedBy,
                    duration,
                    reason,
                    endedAt: Date.now(),
                });

                this.io.to(session.recipientSocketId).emit('call:ended', {
                    callId,
                    endedBy,
                    duration,
                    reason,
                    endedAt: Date.now(),
                });

                // Also broadcast to all user sockets as fallback
                this.io.to(`user:${session.callerId}`).emit('call:ended', {
                    callId,
                    endedBy,
                    duration,
                    reason,
                    endedAt: Date.now(),
                });

                this.io.to(`user:${session.recipientId}`).emit('call:ended', {
                    callId,
                    endedBy,
                    duration,
                    reason,
                    endedAt: Date.now(),
                });

                logger.info(`📞 [CALLSERVICE] Emitted call:ended event to both parties`);
            } else if (this.io) {
                // If no session, try to get call from database and emit to users
                const call = await Call.findByPk(callId);
                if (call) {
                    this.io.to(`user:${call.callerId}`).emit('call:ended', {
                        callId,
                        endedBy,
                        duration,
                        reason,
                        endedAt: Date.now(),
                    });

                    this.io.to(`user:${call.recipientId}`).emit('call:ended', {
                        callId,
                        endedBy,
                        duration,
                        reason,
                        endedAt: Date.now(),
                    });

                    logger.info(`📞 [CALLSERVICE] Emitted call:ended event using database call data`);
                }
            }

            logger.info(
                `📞 [CALLSERVICE] Call ended successfully: ${callId} by ${endedBy}, duration: ${duration}s, reason: ${reason}`,
            );

            return { success: true };
        } catch (error) {
            logger.error('📞 [CALLSERVICE] Error ending call:', error);
            return { success: false, error: 'Internal server error' };
        }
    }

    /**
     * Handle call timeout (30 seconds, no answer)
     */
    private async handleCallTimeout(callId: string): Promise<void> {
        try {
            const sessionData = await redisClient.get(`call:${callId}:session`);
            if (!sessionData) {
                return; // Call already ended
            }

            const session: CallSession = JSON.parse(sessionData);

            // Update database record
            await Call.update(
                {
                    status: 'missed' as CallStatus,
                    endReason: 'timeout' as EndReason,
                    endedAt: new Date(),
                },
                {
                    where: { id: callId },
                },
            );

            // Delete Redis session
            await redisClient.del(`call:${callId}:session`);

            // Remove users from active calls SET
            await this.removeUserFromActiveCallsSet(session.callerId);
            await this.removeUserFromActiveCallsSet(session.recipientId);

            // Clear timeout from map
            this.callTimeouts.delete(callId);

            // Emit call:timeout to both parties
            if (this.io) {
                this.io.to(session.callerSocketId).emit('call:timeout', {
                    callId,
                    reason: 'no-answer',
                    timeoutAt: Date.now(),
                });

                this.io.to(session.recipientSocketId).emit('call:timeout', {
                    callId,
                    reason: 'no-answer',
                    timeoutAt: Date.now(),
                });

                // Send missed call notification
                const order = await Order.findByPk(session.orderId);
                SmartNotificationDispatcher.dispatchCallMissedNotification({
                    userId: session.recipientId,
                    callId,
                    callerName: 'Customer', // TODO: Get actual name
                    orderNumber: order?.orderNumber || session.orderId,
                });
            }

            logger.info(`📞 [CALLSERVICE] Call timeout: ${callId}`);
        } catch (error) {
            logger.error('📞 [CALLSERVICE] Error handling call timeout:', error);
        }
    }

    /**
     * Handle user disconnect - cleanup call state
     */
    public async handleUserDisconnect(userId: string): Promise<void> {
        try {
            // Check if user is in active call
            const isInCall = await this.isUserInCall(userId);

            if (isInCall) {
                logger.warn(`📞 [CALLSERVICE] User ${userId} disconnected while in call, cleaning up`);

                // Find any active call sessions for this user
                const sessionKeys = await redisClient.keys('call:*:session');
                for (const key of sessionKeys) {
                    const sessionData = await redisClient.get(key);
                    if (sessionData) {
                        const session: CallSession = JSON.parse(sessionData);
                        if (session.callerId === userId || session.recipientId === userId) {
                            // End the call due to disconnect
                            logger.info(`📞 [CALLSERVICE] Ending call ${session.callId} due to user ${userId} disconnect`);

                            // Calculate duration if call was active
                            const duration = session.createdAt ? Math.floor((Date.now() - session.createdAt) / 1000) : 0;
                            await this.endCall(session.callId, userId, duration, 'connection-error');
                        }
                    }
                }

                // Safety: Remove user from active calls SET even if no session found
                await this.removeUserFromActiveCallsSet(userId);
            }
        } catch (error) {
            logger.error(`📞 [CALLSERVICE] Error handling user ${userId} disconnect:`, error);
            // Try to remove from SET anyway as safety measure
            try {
                await this.removeUserFromActiveCallsSet(userId);
            } catch (cleanupError) {
                logger.error(`📞 [CALLSERVICE] Failed to cleanup user ${userId} from active calls:`, cleanupError);
            }
        }
    }

    /**
     * Cleanup (shutdown)
     */
    public shutdown(): void {
        // Clear all timeouts
        for (const timeout of this.callTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.callTimeouts.clear();
        logger.info('CallService shut down successfully');
    }
}

export default CallService.getInstance();
