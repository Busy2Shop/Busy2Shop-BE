declare module 'smpp' {
    export interface SMPPClientConfig {
        host: string;
        port: number;
        systemId: string;
        password: string;
        systemType?: string;
        interfaceVersion?: number;
        sourceAddr?: string;
        sourceAddrTon?: number;
        sourceAddrNpi?: number;
        destAddrTon?: number;
        destAddrNpi?: number;
    }

    export interface SMPPPDU {
        command: string;
        command_id: number;
        command_status: number;
        sequence_number: number;
        receiptedMessageId?: string;
        messageState?: number;
        [key: string]: any;
    }

    export class SMPPClient extends EventEmitter {
        constructor(config: SMPPClientConfig);
        connect(): Promise<void>;
        close(): Promise<void>;
        submit_sm(options: {
            destination_addr: string;
            short_message: string;
            registered_delivery?: number;
            [key: string]: any;
        }): Promise<SMPPPDU>;
        on(event: 'connect', listener: () => void): this;
        on(event: 'close', listener: () => void): this;
        on(event: 'error', listener: (error: Error) => void): this;
        on(event: 'pdu', listener: (pdu: SMPPPDU) => void): this;
    }
} 