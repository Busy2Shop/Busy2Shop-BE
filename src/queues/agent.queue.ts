// src/queues/agent.queue.ts
import { Queue, Worker } from 'bullmq';
import { logger } from '../utils/logger';
import AgentService from '../services/agent.service';
import ShoppingListService from '../services/shoppingList.service';
import OrderTrailService from '../services/orderTrail.service';
import { connection } from './connection';

// Define job data interface
interface AgentAssignmentJobData {
    orderId: string;
    shoppingListId: string;
    userId: string;
    attemptCount?: number;
}

// Create queue for agent assignment retries
export const agentAssignmentQueue = new Queue<AgentAssignmentJobData>('agent-assignment', {
    connection,
    defaultJobOptions: {
        attempts: 5, // Retry up to 5 times
        backoff: {
            type: 'exponential',
            delay: 60000, // Start with 1 minute delay
        },
        removeOnComplete: { count: 10 }, // Keep only last 10 completed jobs
        removeOnFail: { count: 20 }, // Keep only last 20 failed jobs
    },
});

// Process agent assignment jobs
const agentAssignmentWorker = new Worker<AgentAssignmentJobData>(
    'agent-assignment',
    async job => {
        if (job.name !== 'assign-agent') {
            throw new Error(`Unknown job name: ${job.name}`);
        }

        const { orderId, shoppingListId, userId, attemptCount = 0 } = job.data;
        
        logger.info(`Attempting to assign agent to order ${orderId} (attempt ${attemptCount + 1})`);

        try {
            // Get the best available agents for this order
            const availableAgents = await AgentService.getAvailableAgentsForOrder(
                shoppingListId,
                [] // No exclusions on first attempt
            );

            if (availableAgents.length === 0) {
                throw new Error(`No available agents found for order ${orderId}`);
            }

            // Try to assign the best agent (first in sorted list)
            const selectedAgent = availableAgents[0];
            const updatedOrder = await AgentService.assignOrderToAgent(orderId, selectedAgent.id);
            
            if (updatedOrder.agentId) {
                // Agent was successfully assigned
                logger.info(`Successfully assigned agent ${updatedOrder.agentId} to order ${orderId}`);
                
                // Log the assignment in order trail
                await OrderTrailService.logOrderEvent(orderId, {
                    action: 'agent_assigned',
                    description: `Order assigned to agent ${selectedAgent.firstName} ${selectedAgent.lastName}`,
                    performedBy: 'system',
                    metadata: {
                        agentId: selectedAgent.id,
                        agentName: `${selectedAgent.firstName} ${selectedAgent.lastName}`,
                        assignmentMethod: 'auto',
                        attemptCount: attemptCount + 1,
                    },
                });
                
                return { success: true, agentId: updatedOrder.agentId, agentName: `${selectedAgent.firstName} ${selectedAgent.lastName}` };
            } else {
                throw new Error(`Failed to assign agent ${selectedAgent.id} to order ${orderId}`);
            }
        } catch (error) {
            logger.error(`Error assigning agent to order ${orderId}:`, error);
            
            // Update job data with attempt count for next retry
            job.updateData({
                ...job.data,
                attemptCount: attemptCount + 1,
            });
            
            throw error; // This will trigger a retry
        }
    },
    { 
        connection,
        concurrency: 3, // Process up to 3 agent assignments concurrently
    },
);

// Error handling
agentAssignmentWorker.on('error', (error: Error) => {
    logger.error('Agent assignment worker error:', error);
});

agentAssignmentWorker.on('failed', (job: any, error: Error) => {
    logger.error(`Agent assignment job ${job?.id} failed:`, error);
    
    // If this is the final failure (after all retries), log it as a critical issue
    if (job.attemptsMade >= job.opts.attempts) {
        logger.error(`CRITICAL: Failed to assign agent to order ${job.data.orderId} after ${job.opts.attempts} attempts`);
        // You could send an alert to administrators here
    }
});

agentAssignmentWorker.on('completed', (job: any, result: any) => {
    logger.info(`Agent assignment completed for order ${job.data.orderId}: Agent ${result.agentId} assigned`);
});

// Helper function to queue agent assignment with delay and smart retry logic
export async function queueAgentAssignment(
    orderId: string, 
    shoppingListId: string, 
    userId: string, 
    delayMinutes: number = 5
): Promise<void> {
    try {
        // Check if there's already a pending job for this order to avoid duplicates
        const existingJobs = await agentAssignmentQueue.getJobs(['waiting', 'delayed']);
        const existingJob = existingJobs.find(job => job.id === `agent-assignment-${orderId}`);
        
        if (existingJob) {
            logger.info(`Agent assignment job already exists for order ${orderId}`);
            return;
        }

        await agentAssignmentQueue.add(
            'assign-agent',
            {
                orderId,
                shoppingListId,
                userId,
                attemptCount: 0,
            },
            {
                delay: delayMinutes * 60 * 1000, // Convert minutes to milliseconds
                jobId: `agent-assignment-${orderId}`, // Unique job ID to prevent duplicates
                // Progressive delay: each retry takes longer
                backoff: {
                    type: 'exponential',
                    delay: Math.max(60000, delayMinutes * 60 * 1000), // Minimum 1 minute
                },
            }
        );
        
        logger.info(`Queued agent assignment for order ${orderId} with ${delayMinutes} minute delay`);
    } catch (error) {
        logger.error(`Error queuing agent assignment for order ${orderId}:`, error);
    }
}

// Helper function to immediately try agent assignment (for immediate retries)
export async function queueImmediateAgentAssignment(
    orderId: string, 
    shoppingListId: string, 
    userId: string
): Promise<void> {
    return queueAgentAssignment(orderId, shoppingListId, userId, 0);
}

export { agentAssignmentWorker };