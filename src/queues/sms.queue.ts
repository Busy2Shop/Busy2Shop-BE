// import { Queue, Worker } from 'bullmq';
// import { logger } from '../utils/logger';
// import { connection } from './connection';
// import { phoneService } from '../utils/Phone';
// import { QUEUE } from '../constants';

// // Define job data interface
// interface SMSJobData {
//     to: string;
//     message: string;
//     priority?: 'high' | 'normal' | 'low';
// }

// // Create SMS queue
// export const smsQueue = new Queue<SMSJobData>(QUEUE.NAMES.SMS, {
//     connection,
//     defaultJobOptions: {
//         attempts: QUEUE.ATTEMPTS.DEFAULT,
//         backoff: {
//             type: QUEUE.BACKOFF.TYPE,
//             delay: QUEUE.BACKOFF.DELAY,
//         },
//         removeOnComplete: true,
//         removeOnFail: false,
//     },
// });

// // Process SMS jobs
// const smsWorker = new Worker<SMSJobData>(
//     QUEUE.NAMES.SMS,
//     async job => {
//         const { to, message, priority } = job.data;
//         logger.info(`Processing SMS to ${to}`);

//         try {
//             await phoneService.sendMessage(to, message, priority);
//             return { success: true };
//         } catch (error) {
//             logger.error(`Error sending SMS to ${to}:`, error);
//             throw error;
//         }
//     },
//     { connection }
// );

// // Error handling
// smsWorker.on('error', (error: Error) => {
//     logger.error('SMS worker error:', error);
// });

// smsWorker.on('failed', (job: any, error: Error) => {
//     logger.error(`SMS job ${job?.id} failed:`, error);
// });

// export default smsQueue; 