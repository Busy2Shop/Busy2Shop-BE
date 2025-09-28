// src/services/paymentStatusSync.service.ts
import { Transaction } from 'sequelize';
import OrderService from './order.service';
import ShoppingListService from './shoppingList.service';
import AgentService from './agent.service';
import OrderTrailService from './orderTrail.service';
import EnhancedChatService from './chat-enhanced.service';
import { logger } from '../utils/logger';
import { Database } from '../models';
import Order from '../models/order.model';
import ShoppingList from '../models/shoppingList.model';

/**
 * Unified Payment Status Synchronization Service
 * 
 * This service provides a single source of truth for payment confirmation updates
 * to ensure consistency between webhook processing and API endpoint syncing.
 */
export default class PaymentStatusSyncService {
    
    /**
     * Unified payment confirmation process
     * This method should be used by both webhook processing and API endpoint syncing
     * to ensure consistent behavior across all payment confirmation flows.
     * 
     * @param orderId - The order ID to confirm payment for
     * @param transactionId - The payment provider transaction ID
     * @param source - Source of the confirmation ('webhook' | 'api_sync')
     * @param performedBy - User ID or 'system' for webhook
     * @param externalTransaction - Optional external transaction to use
     */
    static async confirmPayment(
        orderId: string,
        transactionId: string,
        source: 'webhook' | 'api_sync',
        performedBy: string,
        externalTransaction?: Transaction
    ): Promise<{ success: boolean; assignedAgentId?: string; error?: string }> {
        
        const executeInTransaction = async (transaction: Transaction) => {
            let assignedAgentId: string | undefined = undefined;
            
            try {
                logger.info(`Starting unified payment confirmation for order ${orderId}`, {
                    transactionId,
                    source,
                    performedBy,
                });
                
                // 1. Get the order with minimal data for performance
                const order = await Order.findByPk(orderId, {
                    include: [
                        {
                            model: ShoppingList,
                            as: 'shoppingList',
                            attributes: ['id', 'status', 'paymentStatus'],
                        },
                    ],
                    transaction,
                });
                if (!order) {
                    throw new Error(`Order ${orderId} not found`);
                }
                
                // 2. Check if already processed to avoid double processing
                if (order.paymentStatus === 'completed') {
                    logger.info(`Order ${order.orderNumber} payment already confirmed - skipping`);
                    return { success: true, assignedAgentId: order.agentId || undefined };
                }
                
                logger.info(`Processing payment confirmation for order ${order.orderNumber}`, {
                    currentPaymentStatus: order.paymentStatus,
                    currentOrderStatus: order.status,
                    shoppingListId: order.shoppingListId,
                });
                
                // 3. Update order payment status and related fields
                await OrderService.updateOrderPaymentStatus(orderId, 'completed', transaction);
                logger.info(`Order ${order.orderNumber} payment status updated to completed`);
                
                // 4. Update shopping list status to 'accepted' (payment confirmed, ready for agent assignment)
                if (order.shoppingListId) {
                    await ShoppingListService.updateListStatus(
                        order.shoppingListId,
                        order.customerId,
                        'accepted',
                        transaction
                    );
                    logger.info(`Shopping list ${order.shoppingListId} status updated to accepted`);
                    
                    // 5. Update shopping list payment information
                    await ShoppingListService.updateShoppingList(
                        order.shoppingListId,
                        order.customerId,
                        {
                            paymentStatus: 'completed',
                            paymentProcessedAt: new Date(),
                            paymentId: transactionId,
                        },
                        transaction
                    );
                    logger.info(`Shopping list ${order.shoppingListId} payment info updated`);
                }
                
                // 6. Auto-assign agent to the order if available
                try {
                    if (order.shoppingListId) {
                        const unparsedavailableAgents = await AgentService.getAvailableAgentsForOrder(order.shoppingListId);
                        const availableAgents = JSON.parse(JSON.stringify(unparsedavailableAgents));
                        if (availableAgents.length > 0) {
                            const selectedAgent = availableAgents[0];
                            await AgentService.assignOrderToAgent(orderId, selectedAgent.id, transaction);
                            assignedAgentId = selectedAgent.id;
                            
                            logger.info(`Agent ${selectedAgent.id} automatically assigned to order ${order.orderNumber}`);
                            
                            // 7. Update order status to 'accepted' after agent assignment (not in_progress yet)
                            // Agent still needs to accept the order in their dashboard
                            await OrderService.updateOrderStatusSystem(orderId, 'accepted', transaction);
                            logger.info(`Order ${order.orderNumber} status updated to accepted after agent assignment`);
                            
                            // 8. Shopping list remains 'accepted' until agent starts working
                            // It will be updated to 'processing' when agent accepts the order
                            logger.info(`Shopping list ${order.shoppingListId} remains accepted - waiting for agent to start`);
                            
                        } else {
                            logger.warn(`No available agents found for order ${order.orderNumber} - order remains in accepted status`);
                        }
                    }
                } catch (agentError) {
                    logger.error(`Failed to assign agent for order ${order.orderNumber}:`, agentError);
                    // Continue - payment confirmation succeeded even if agent assignment failed
                }
                
                // 9. Activate chat for the order to enable communication
                try {
                    const chatActivationData = {
                        orderId,
                        activatedBy: {
                            id: 'system',
                            type: 'admin' as const,
                            name: 'Payment System',
                        },
                    };

                    const chatActivated = await EnhancedChatService.activateChat(chatActivationData);
                    if (chatActivated) {
                        logger.info(`Chat activated for order ${order.orderNumber} after payment confirmation`);
                    } else {
                        logger.warn(`Failed to activate chat for order ${order.orderNumber}`);
                    }
                } catch (chatError) {
                    logger.error(`Error activating chat for order ${order.orderNumber}:`, chatError);
                    // Don't fail the payment confirmation if chat activation fails
                }

                // 10. Log comprehensive trail entry
                await OrderTrailService.logOrderEvent(orderId, {
                    action: 'payment_confirmed',
                    description: `Payment confirmed via ${source} - Order ready for shopping`,
                    performedBy,
                    metadata: {
                        transactionId,
                        source,
                        paymentAmount: order.totalAmount,
                        assignedAgentId,
                        shoppingListId: order.shoppingListId,
                        processedAt: new Date().toISOString(),
                        chatActivated: true,
                    },
                });

                logger.info(`Unified payment confirmation completed for order ${order.orderNumber}`, {
                    orderId,
                    assignedAgentId,
                    source,
                });

                return { success: true, assignedAgentId };
                
            } catch (error) {
                logger.error(`Failed to confirm payment for order ${orderId}:`, {
                    error: error instanceof Error ? error.message : String(error),
                    source,
                    transactionId,
                });
                throw error;
            }
        };
        
        if (externalTransaction) {
            return await executeInTransaction(externalTransaction);
        } else {
            return await Database.transaction(executeInTransaction);
        }
    }
    
    /**
     * Get the correct shopping list status based on order status
     * This ensures consistent mapping between order and shopping list statuses
     */
    static getShoppingListStatusFromOrderStatus(
        orderStatus: string,
        paymentStatus: string
    ): 'draft' | 'accepted' | 'processing' | 'completed' | 'cancelled' {
        
        // If payment not completed, shopping list should remain draft
        if (paymentStatus !== 'completed') {
            return 'draft';
        }
        
        // Map order status to shopping list status
        switch (orderStatus) {
            case 'pending':
            case 'accepted':
                return 'accepted'; // Payment confirmed, ready for agent
            case 'in_progress':
            case 'shopping':
            case 'shopping_completed':
            case 'delivery':
                return 'processing'; // Agent actively working
            case 'completed':
                return 'completed'; // Order delivered
            case 'cancelled':
                return 'cancelled'; // Order cancelled
            default:
                return 'draft';
        }
    }
    
    /**
     * Validate and sync order/shopping list status consistency
     * This can be used for maintenance and debugging
     */
    static async validateStatusConsistency(orderId: string): Promise<{
        isConsistent: boolean;
        issues: string[];
        recommendations: string[];
    }> {
        const issues: string[] = [];
        const recommendations: string[] = [];
        
        try {
            const order = await OrderService.getOrder(orderId, false, false);
            if (!order || !order.shoppingListId) {
                return { isConsistent: false, issues: ['Order or shopping list not found'], recommendations: [] };
            }
            
            const shoppingList = await ShoppingListService.getShoppingList(order.shoppingListId);
            const expectedListStatus = this.getShoppingListStatusFromOrderStatus(order.status, order.paymentStatus);
            
            // Check status consistency
            if (shoppingList.status !== expectedListStatus) {
                issues.push(`Shopping list status '${shoppingList.status}' doesn't match expected '${expectedListStatus}' for order status '${order.status}'`);
                recommendations.push(`Update shopping list status to '${expectedListStatus}'`);
            }
            
            // Check payment status consistency
            if (order.paymentStatus === 'completed' && shoppingList.paymentStatus !== 'completed') {
                issues.push('Order payment completed but shopping list payment status not updated');
                recommendations.push('Update shopping list payment status to completed');
            }
            
            return {
                isConsistent: issues.length === 0,
                issues,
                recommendations,
            };
            
        } catch (error) {
            return {
                isConsistent: false,
                issues: [`Error validating consistency: ${error instanceof Error ? error.message : String(error)}`],
                recommendations: ['Check order and shopping list existence'],
            };
        }
    }
}