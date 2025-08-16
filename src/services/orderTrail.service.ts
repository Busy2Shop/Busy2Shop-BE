import OrderTrail from '../models/orderTrail.model';
import User from '../models/user.model';
import { logger } from '../utils/logger';

export interface ICreateTrailEntry {
    orderId: string;
    userId?: string;
    action: string;
    description: string;
    previousValue?: any;
    newValue?: any;
    metadata?: any;
    ipAddress?: string;
    userAgent?: string;
}

export default class OrderTrailService {
    /**
     * Create a new trail entry for an order
     */
    static async createTrailEntry(data: ICreateTrailEntry): Promise<OrderTrail> {
        try {
            const trailEntry = await OrderTrail.create({
                orderId: data.orderId,
                userId: data.userId,
                action: data.action,
                description: data.description,
                previousValue: data.previousValue,
                newValue: data.newValue,
                metadata: data.metadata,
                ipAddress: data.ipAddress,
                userAgent: data.userAgent,
                timestamp: new Date(),
            } as any);

            logger.info('Order trail entry created', {
                trailId: trailEntry.id,
                orderId: data.orderId,
                action: data.action,
                userId: data.userId,
            });

            return trailEntry;
        } catch (error) {
            logger.error('Failed to create order trail entry', {
                error: error instanceof Error ? error.message : String(error),
                orderId: data.orderId,
                action: data.action,
            });
            throw error;
        }
    }

    /**
     * Get trail entries for an order
     */
    static async getOrderTrail(orderId: string): Promise<OrderTrail[]> {
        try {
            const trails = await OrderTrail.findAll({
                where: { orderId },
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'firstName', 'lastName', 'email'],
                        required: false,
                    },
                ],
                order: [['timestamp', 'ASC']],
            });

            return trails;
        } catch (error) {
            logger.error('Failed to get order trail', {
                error: error instanceof Error ? error.message : String(error),
                orderId,
            });
            throw error;
        }
    }

    /**
     * Log order creation
     */
    static async logOrderCreation(
        orderId: string,
        customerId: string,
        orderData: any,
        ipAddress?: string,
        userAgent?: string,
    ): Promise<void> {
        await this.createTrailEntry({
            orderId,
            userId: customerId,
            action: 'ORDER_CREATED',
            description: `Order ${orderData.orderNumber} created by customer`,
            newValue: {
                orderNumber: orderData.orderNumber,
                totalAmount: orderData.totalAmount,
                status: orderData.status,
                shoppingListId: orderData.shoppingListId,
            },
            metadata: {
                source: 'order_creation',
                timestamp: new Date().toISOString(),
            },
            ipAddress,
            userAgent,
        });
    }

    /**
     * Log order status change
     */
    static async logStatusChange(
        orderId: string,
        userId: string,
        previousStatus: string,
        newStatus: string,
        ipAddress?: string,
        userAgent?: string,
    ): Promise<void> {
        await this.createTrailEntry({
            orderId,
            userId,
            action: 'STATUS_CHANGED',
            description: `Order status changed from ${previousStatus} to ${newStatus}`,
            previousValue: { status: previousStatus },
            newValue: { status: newStatus },
            metadata: {
                source: 'status_update',
                timestamp: new Date().toISOString(),
            },
            ipAddress,
            userAgent,
        });
    }

    /**
     * Log agent assignment
     */
    static async logAgentAssignment(
        orderId: string,
        agentId: string,
        previousAgentId?: string,
        ipAddress?: string,
        userAgent?: string,
    ): Promise<void> {
        await this.createTrailEntry({
            orderId,
            userId: agentId,
            action: 'AGENT_ASSIGNED',
            description: previousAgentId 
                ? `Agent reassigned from ${previousAgentId} to ${agentId}`
                : `Agent ${agentId} assigned to order`,
            previousValue: previousAgentId ? { agentId: previousAgentId } : null,
            newValue: { agentId },
            metadata: {
                source: 'agent_assignment',
                timestamp: new Date().toISOString(),
            },
            ipAddress,
            userAgent,
        });
    }

    /**
     * Log payment processing
     */
    static async logPaymentProcessed(
        orderId: string,
        paymentData: any,
        ipAddress?: string,
        userAgent?: string,
    ): Promise<void> {
        await this.createTrailEntry({
            orderId,
            action: 'PAYMENT_PROCESSED',
            description: 'Payment processed for order',
            newValue: {
                paymentId: paymentData.paymentId,
                paymentStatus: paymentData.paymentStatus,
                amount: paymentData.amount,
            },
            metadata: {
                source: 'payment_processing',
                paymentProvider: paymentData.provider || 'unknown',
                timestamp: new Date().toISOString(),
            },
            ipAddress,
            userAgent,
        });
    }

    /**
     * Log order notes addition
     */
    static async logNotesAdded(
        orderId: string,
        userId: string,
        notes: string,
        noteType: 'customer' | 'agent',
        ipAddress?: string,
        userAgent?: string,
    ): Promise<void> {
        await this.createTrailEntry({
            orderId,
            userId,
            action: 'NOTES_ADDED',
            description: `${noteType === 'customer' ? 'Customer' : 'Agent'} added notes to order`,
            newValue: { notes, noteType },
            metadata: {
                source: 'notes_addition',
                noteType,
                timestamp: new Date().toISOString(),
            },
            ipAddress,
            userAgent,
        });
    }

    /**
     * Log order cancellation
     */
    static async logOrderCancellation(
        orderId: string,
        userId: string,
        reason?: string,
        ipAddress?: string,
        userAgent?: string,
    ): Promise<void> {
        await this.createTrailEntry({
            orderId,
            userId,
            action: 'ORDER_CANCELLED',
            description: `Order cancelled by user${reason ? `: ${reason}` : ''}`,
            newValue: { 
                status: 'cancelled',
                reason: reason || 'No reason provided',
            },
            metadata: {
                source: 'order_cancellation',
                reason,
                timestamp: new Date().toISOString(),
            },
            ipAddress,
            userAgent,
        });
    }

    /**
     * Log agent rejection
     */
    static async logAgentRejection(
        orderId: string,
        agentId: string,
        reason: string,
        ipAddress?: string,
        userAgent?: string,
    ): Promise<void> {
        await this.createTrailEntry({
            orderId,
            userId: agentId,
            action: 'AGENT_REJECTED',
            description: `Agent rejected order: ${reason}`,
            newValue: { 
                rejectedBy: agentId,
                reason,
            },
            metadata: {
                source: 'agent_rejection',
                reason,
                timestamp: new Date().toISOString(),
            },
            ipAddress,
            userAgent,
        });
    }

    /**
     * Log order completion
     */
    static async logOrderCompletion(
        orderId: string,
        userId: string,
        completionData?: any,
        ipAddress?: string,
        userAgent?: string,
    ): Promise<void> {
        await this.createTrailEntry({
            orderId,
            userId,
            action: 'ORDER_COMPLETED',
            description: 'Order marked as completed/delivered',
            newValue: { 
                status: 'completed',
                completedAt: new Date().toISOString(),
                ...completionData,
            },
            metadata: {
                source: 'order_completion',
                timestamp: new Date().toISOString(),
            },
            ipAddress,
            userAgent,
        });
    }

    /**
     * Log system actions (automated processes)
     */
    static async logSystemAction(
        orderId: string,
        action: string,
        description: string,
        data?: any,
    ): Promise<void> {
        await this.createTrailEntry({
            orderId,
            action: `SYSTEM_${action.toUpperCase()}`,
            description: `[SYSTEM] ${description}`,
            newValue: data,
            metadata: {
                source: 'system',
                automated: true,
                timestamp: new Date().toISOString(),
            },
        });
    }

    /**
     * Generic method to log order events with flexible data structure
     */
    static async logOrderEvent(
        orderId: string,
        eventData: {
            action: string;
            description: string;
            performedBy: string;
            metadata?: any;
            previousValue?: any;
            newValue?: any;
        },
    ): Promise<void> {
        await this.createTrailEntry({
            orderId,
            action: eventData.action,
            description: eventData.description,
            previousValue: eventData.previousValue,
            newValue: eventData.newValue,
            metadata: {
                ...eventData.metadata,
                performedBy: eventData.performedBy,
                timestamp: new Date().toISOString(),
            },
        });
    }
}