import axios, { AxiosError } from 'axios';
import { logger } from '../../utils/logger';
import { BadRequestError } from '../../utils/customErrors';
import User from '../../models/user.model';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

export interface PaystackInitializeRequest {
    email: string;
    amount: number; // Amount in kobo
    currency?: string;
    reference?: string;
    callback_url?: string;
    metadata?: {
        orderId: string;
        orderNumber: string;
        customerId: string;
        custom_fields?: Array<{
            display_name: string;
            variable_name: string;
            value: string;
        }>;
    };
    channels?: string[];
}

export interface PaystackInitializeResponse {
    status: boolean;
    message: string;
    data: {
        authorization_url: string;
        access_code: string;
        reference: string;
    };
}

export interface PaystackVerifyResponse {
    status: boolean;
    message: string;
    data: {
        id: number;
        domain: string;
        status: 'success' | 'failed' | 'abandoned';
        reference: string;
        amount: number;
        message: string | null;
        gateway_response: string;
        paid_at: string;
        created_at: string;
        channel: string;
        currency: string;
        ip_address: string;
        metadata: any;
        authorization: {
            authorization_code: string;
            bin: string;
            last4: string;
            exp_month: string;
            exp_year: string;
            channel: string;
            card_type: string;
            bank: string;
            country_code: string;
            brand: string;
            reusable: boolean;
            signature: string;
            account_name: string | null;
        };
        customer: {
            id: number;
            first_name: string;
            last_name: string;
            email: string;
            customer_code: string;
            phone: string;
            metadata: any;
            risk_action: string;
            international_format_phone: string | null;
        };
        plan: any;
        split: any;
        order_id: string;
        paidAt: string;
        createdAt: string;
        requested_amount: number;
        pos_transaction_data: any;
        source: any;
        fees_breakdown: any;
    };
}

export interface PaystackWebhookPayload {
    event: string;
    data: {
        id: number;
        domain: string;
        status: 'success' | 'failed' | 'abandoned';
        reference: string;
        amount: number;
        message: string | null;
        gateway_response: string;
        paid_at: string;
        created_at: string;
        channel: string;
        currency: string;
        ip_address: string;
        metadata: any;
        customer: {
            id: number;
            first_name: string;
            last_name: string;
            email: string;
            customer_code: string;
            phone: string;
            metadata: any;
            risk_action: string;
            international_format_phone: string | null;
        };
        authorization: any;
        plan: any;
        order_id: string;
        paidAt: string;
        createdAt: string;
        requested_amount: number;
    };
}

export default class PaystackService {
    private static secretKey = process.env.PAYSTACK_SECRET_KEY || '';
    private static publicKey = process.env.PAYSTACK_PUBLIC_KEY || '';

    private static getHeaders() {
        return {
            'Authorization': `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json',
        };
    }

    /**
     * Initialize a payment transaction
     */
    static async initializeTransaction(request: PaystackInitializeRequest): Promise<PaystackInitializeResponse> {
        try {
            if (!this.secretKey) {
                throw new BadRequestError('Paystack secret key not configured');
            }

            // Validate amount
            if (!request.amount || request.amount <= 0) {
                throw new BadRequestError('Amount must be greater than zero');
            }

            // Ensure amount is in kobo (already converted in frontend)
            const amountInKobo = Math.round(request.amount);

            const payload = {
                email: request.email,
                amount: amountInKobo,
                currency: request.currency || 'NGN',
                reference: request.reference,
                callback_url: request.callback_url,
                metadata: request.metadata,
                channels: request.channels || ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
            };

            logger.info('Initializing Paystack transaction', {
                email: request.email,
                amount: amountInKobo,
                reference: request.reference,
                orderId: request.metadata?.orderId,
            });

            const response = await axios.post(
                `${PAYSTACK_BASE_URL}/transaction/initialize`,
                payload,
                { headers: this.getHeaders() }
            );

            if (!response.data.status) {
                throw new BadRequestError(response.data.message || 'Failed to initialize Paystack transaction');
            }

            logger.info('Paystack transaction initialized successfully', {
                reference: response.data.data.reference,
                access_code: response.data.data.access_code,
            });

            return response.data;

        } catch (error) {
            logger.error('Error initializing Paystack transaction:', error);

            if (error instanceof AxiosError) {
                const errorMessage = error.response?.data?.message || error.message;
                throw new BadRequestError(`Paystack API error: ${errorMessage}`);
            }

            throw error;
        }
    }

    /**
     * Verify a payment transaction
     */
    static async verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
        try {
            if (!this.secretKey) {
                throw new BadRequestError('Paystack secret key not configured');
            }

            if (!reference) {
                throw new BadRequestError('Transaction reference is required');
            }

            logger.info('Verifying Paystack transaction', { reference });

            const response = await axios.get(
                `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
                { headers: this.getHeaders() }
            );

            if (!response.data.status) {
                throw new BadRequestError(response.data.message || 'Failed to verify Paystack transaction');
            }

            logger.info('Paystack transaction verified', {
                reference,
                status: response.data.data.status,
                amount: response.data.data.amount,
                customer: response.data.data.customer.email,
            });

            return response.data;

        } catch (error) {
            logger.error('Error verifying Paystack transaction:', error);

            if (error instanceof AxiosError) {
                const errorMessage = error.response?.data?.message || error.message;
                throw new BadRequestError(`Paystack verification error: ${errorMessage}`);
            }

            throw error;
        }
    }

    /**
     * Get transaction details
     */
    static async getTransaction(transactionId: number): Promise<PaystackVerifyResponse> {
        try {
            if (!this.secretKey) {
                throw new BadRequestError('Paystack secret key not configured');
            }

            const response = await axios.get(
                `${PAYSTACK_BASE_URL}/transaction/${transactionId}`,
                { headers: this.getHeaders() }
            );

            if (!response.data.status) {
                throw new BadRequestError(response.data.message || 'Failed to get Paystack transaction');
            }

            return response.data;

        } catch (error) {
            logger.error('Error getting Paystack transaction:', error);

            if (error instanceof AxiosError) {
                const errorMessage = error.response?.data?.message || error.message;
                throw new BadRequestError(`Paystack API error: ${errorMessage}`);
            }

            throw error;
        }
    }

    /**
     * Validate webhook signature
     */
    static validateWebhookSignature(payload: string, signature: string): boolean {
        try {
            const crypto = require('crypto');
            const hash = crypto.createHmac('sha512', this.secretKey).update(payload).digest('hex');
            return hash === signature;
        } catch (error) {
            logger.error('Error validating Paystack webhook signature:', error);
            return false;
        }
    }

    /**
     * Generate a unique transaction reference
     */
    static generateReference(prefix: string = 'busy2shop'): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `${prefix}_${timestamp}_${random}`;
    }

    /**
     * Convert amount to kobo (multiply by 100)
     */
    static toKobo(amount: number): number {
        return Math.round(amount * 100);
    }

    /**
     * Convert amount from kobo to naira (divide by 100)
     */
    static fromKobo(amount: number): number {
        return amount / 100;
    }

    /**
     * Format customer data for Paystack
     */
    static formatCustomerData(user: User): {
        email: string;
        first_name: string;
        last_name: string;
        phone: string;
    } {
        return {
            email: user.email,
            first_name: user.firstName || 'Customer',
            last_name: user.lastName || '',
            phone: user.phone?.number || '',
        };
    }

    /**
     * Check if Paystack is properly configured
     */
    static isConfigured(): boolean {
        return !!(this.secretKey && this.publicKey);
    }

    /**
     * Get public key for frontend
     */
    static getPublicKey(): string {
        return this.publicKey;
    }
}