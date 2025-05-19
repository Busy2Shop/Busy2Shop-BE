// import { SMPPClient, SMPPClientConfig, SMPPPDU } from 'smpp';
// import { logger } from './logger';
// import { EventEmitter } from 'events';
// import Redis from 'ioredis';
// import { smsQueue } from '../queues/sms.queue';
// import { REDIS_CONNECTION_URL, SMPP_HOST, SMPP_PORT, SMPP_SYSTEM_ID, SMPP_PASSWORD, SMPP_SYSTEM_TYPE, SMPP_SOURCE_ADDR, SMPP_SOURCE_ADDR_TON, SMPP_SOURCE_ADDR_NPI, SMPP_DEST_ADDR_TON, SMPP_DEST_ADDR_NPI, QUEUE } from '../constants';

// interface PhoneMessage {
//     to: string;
//     message: string;
//     priority?: 'high' | 'normal' | 'low';
//     retryCount?: number;
// }

// interface PhoneServiceConfig {
//     host: string;
//     port: number;
//     systemId: string;
//     password: string;
//     systemType?: string;
//     interfaceVersion?: number;
//     sourceAddr?: string;
//     sourceAddrTon?: number;
//     sourceAddrNpi?: number;
//     destAddrTon?: number;
//     destAddrNpi?: number;
// }

// class PhoneService extends EventEmitter {
//     private client: SMPPClient;
//     private config: PhoneServiceConfig;
//     private redis: Redis;
//     private isConnected: boolean = false;
//     private reconnectAttempts: number = 0;
//     private readonly MAX_RECONNECT_ATTEMPTS = 5;
//     private readonly RECONNECT_DELAY = 5000;

//     constructor(config: PhoneServiceConfig) {
//         super();
//         this.config = config;
//         this.initializeSMPPClient();
//         this.initializeRedis();
//     }

//     private initializeSMPPClient() {
//         const smppConfig: SMPPClientConfig = {
//             host: this.config.host,
//             port: this.config.port,
//             systemId: this.config.systemId,
//             password: this.config.password,
//             systemType: this.config.systemType || '',
//             interfaceVersion: this.config.interfaceVersion || 0x34,
//             sourceAddr: this.config.sourceAddr || '',
//             sourceAddrTon: this.config.sourceAddrTon || 0,
//             sourceAddrNpi: this.config.sourceAddrNpi || 0,
//             destAddrTon: this.config.destAddrTon || 0,
//             destAddrNpi: this.config.destAddrNpi || 0,
//         };

//         this.client = new SMPPClient(smppConfig);

//         this.client.on('connect', () => {
//             logger.info('SMPP client connected');
//             this.isConnected = true;
//             this.reconnectAttempts = 0;
//             this.emit('connected');
//         });

//         this.client.on('close', () => {
//             logger.warn('SMPP client disconnected');
//             this.isConnected = false;
//             this.handleReconnect();
//         });

//         this.client.on('error', (error: Error) => {
//             logger.error('SMPP client error:', error);
//             this.emit('error', error);
//         });

//         this.client.on('pdu', (pdu: SMPPPDU) => {
//             if (pdu.command === 'deliver_sm') {
//                 this.handleDeliveryReport(pdu);
//             }
//         });
//     }

//     private initializeRedis() {
//         this.redis = new Redis(REDIS_CONNECTION_URL);
//     }

//     private async handleReconnect() {
//         if (this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
//             this.reconnectAttempts++;
//             logger.info(`Attempting to reconnect (${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})`);

//             setTimeout(() => {
//                 this.initializeSMPPClient();
//             }, this.RECONNECT_DELAY);
//         } else {
//             logger.error('Max reconnection attempts reached');
//             this.emit('maxReconnectAttemptsReached');
//         }
//     }

//     private async handleDeliveryReport(pdu: SMPPPDU) {
//         try {
//             const messageId = pdu.receiptedMessageId;
//             const status = pdu.messageState;
//             const timestamp = new Date();

//             if (messageId && status !== undefined) {
//                 // Store delivery report in Redis
//                 await this.redis.hset(
//                     `sms:${messageId}`,
//                     'status', status,
//                     'timestamp', timestamp.toISOString()
//                 );

//                 logger.info(`Delivery report for message ${messageId}: ${status}`);
//             }
//         } catch (error) {
//             logger.error('Error handling delivery report:', error);
//         }
//     }

//     public async send(to: string, message: string, priority: 'high' | 'normal' | 'low' = 'normal'): Promise<string> {
//         const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

//         await smsQueue.add(
//             'send-sms',
//             { to, message, priority },
//             {
//                 jobId: messageId,
//                 priority: this.getPriorityValue(priority),
//             }
//         );

//         return messageId;
//     }

//     public async sendMessage(to: string, message: string, priority: 'high' | 'normal' | 'low' = 'normal'): Promise<SMPPPDU> {
//         if (!this.isConnected) {
//             throw new Error('SMPP client is not connected');
//         }

//         try {
//             const pdu = await this.client.submit_sm({
//                 destination_addr: to,
//                 short_message: message,
//                 registered_delivery: 1, // Request delivery report
//             });

//             logger.info(`Message submitted successfully to ${to}`);
//             return pdu;
//         } catch (error) {
//             logger.error(`Error sending message to ${to}:`, error);
//             throw error;
//         }
//     }

//     private getPriorityValue(priority: 'high' | 'normal' | 'low'): number {
//         switch (priority) {
//             case 'high':
//                 return QUEUE.PRIORITY.HIGH;
//             case 'normal':
//                 return QUEUE.PRIORITY.NORMAL;
//             case 'low':
//                 return QUEUE.PRIORITY.LOW;
//             default:
//                 return QUEUE.PRIORITY.NORMAL;
//         }
//     }

//     public async getMessageStatus(messageId: string): Promise<Record<string, string>> {
//         return this.redis.hgetall(`sms:${messageId}`);
//     }

//     public async disconnect(): Promise<void> {
//         if (this.isConnected) {
//             await this.client.close();
//             this.isConnected = false;
//         }
//     }
// }

// // Create and export a singleton instance
// const phoneService = new PhoneService({
//     host: SMPP_HOST,
//     port: SMPP_PORT,
//     systemId: SMPP_SYSTEM_ID,
//     password: SMPP_PASSWORD,
//     systemType: SMPP_SYSTEM_TYPE,
//     sourceAddr: SMPP_SOURCE_ADDR,
//     sourceAddrTon: SMPP_SOURCE_ADDR_TON,
//     sourceAddrNpi: SMPP_SOURCE_ADDR_NPI,
//     destAddrTon: SMPP_DEST_ADDR_TON,
//     destAddrNpi: SMPP_DEST_ADDR_NPI,
// });

// export { phoneService, PhoneService, PhoneMessage, PhoneServiceConfig }; 