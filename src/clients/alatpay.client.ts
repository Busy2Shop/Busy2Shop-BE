import axios from 'axios';
import { logger } from '../utils/logger';
import { ALATPAY_API_URL, ALATPAY_SUBSCRIPTION_KEY, ALATPAY_BUSINESS_ID, ALATPAY_MERCHANT_ID } from '../utils/constants';

export interface AlatPayVirtualAccountRequest {
    businessId: string;
    amount: number;
    currency: string;
    orderId: string;
    description: string;
    customer: {
        email: string;
        phone: string;
        firstName: string;
        lastName: string;
        metadata?: string;
    };
}

export interface AlatPayVirtualAccountResponse {
    status: boolean;
    message: string;
    data: {
        businessId: string;
        amount: number;
        currency: string;
        orderId: string;
        description: string;
        customer: {
            email: string;
            phone: string;
            firstName: string;
            lastName: string;
            metadata: string;
        };
        id: string;
        merchantId: string;
        virtualBankCode: string;
        virtualBankAccountNumber: string;
        businessBankAccountNumber: string;
        businessBankCode: string;
        transactionId: string;
        status: string;
        expiredAt: string;
        settlementType: string;
        createdAt: string;
    };
}

export interface AlatPayTransactionStatusResponse {
    status: boolean;
    message: string;
    data: {
        id: string;
        merchantId: string;
        businessId: string;
        channel: string;
        callbackUrl: string;
        feeAmount: number;
        businessName: string;
        currency: string;
        status: string;
        statusReason: string;
        settlementType: string;
        createdAt: string;
        updatedAt: string;
        amount: number;
        orderId: string;
        description: string;
        paymentMethodId: number;
        sessionId: string;
        isAmountDiscrepant: boolean;
        amountSent: number;
        nipTransaction?: {
            originatoraccountnumber: string;
            originatorname: string;
            bankname: string;
            bankcode: string;
            amount: number;
            narration: string;
            craccountname: string;
            craccount: string;
            paymentreference: string;
            sessionid: string;
            id: string;
            requestdate: string;
            nibssresponse: string;
            sendstatus: string;
            sendresponse: string;
            transactionId: string;
            transactionStatus: string;
            log: string;
            createdAt: string;
        };
        virtualAccount?: {
            businessId: string;
            amount: number;
            currency: string;
            orderId: string;
            description: string;
            customer: {
                email: string;
                phone: string;
                firstName: string;
                lastName: string;
                metadata: string;
            };
            id: string;
            merchantId: string;
            virtualBankCode: string;
            virtualBankAccountNumber: string;
            businessBankAccountNumber: string;
            businessBankCode: string;
            transactionId: string;
            status: string;
            expiredAt: string;
            settlementType: string;
            createdAt: string;
        };
        customer?: {
            email: string;
            phone: string;
            firstName: string;
            lastName: string;
            metadata: string;
            id: string;
            transactionId: string;
            createdAt: string;
        };
    };
}

export interface AlatPayWebhookPayload {
    Value: {
        Data: {
            Amount: number;
            OrderId: string;
            Description: string | null;
            PaymentMethodId: number;
            SessionId: string;
            Customer: {
                Id: string;
                TransactionId: string;
                CreatedAt: string;
                Email: string;
                Phone: string;
                FirstName: string;
                LastName: string;
                Metadata: string;
            };
            Id: string;
            MerchantId: string;
            BusinessId: string;
            Channel: string | null;
            CallbackUrl: string;
            FeeAmount: number;
            BusinessName: string;
            Currency: string;
            Status: 'pending' | 'completed' | 'failed';
            StatusReason: string | null;
            SettlementType: string;
            CreatedAt: string;
            UpdatedAt: string;
            NgnVirtualBankAccountNumber?: string;
            NgnVirtualBankCode?: string;
        };
        Status: boolean;
        Message: string;
    };
    StatusCode: number;
}

export default class AlatPayClient {
    private static instance: AlatPayClient;
    private apiUrl: string;
    private subscriptionKey: string;
    private businessId: string;
    private merchantId: string;

    private constructor() {
        this.apiUrl = ALATPAY_API_URL || 'https://apibox.alatpay.ng';
        this.subscriptionKey = ALATPAY_SUBSCRIPTION_KEY || '';
        this.businessId = ALATPAY_BUSINESS_ID || '';
        this.merchantId = ALATPAY_MERCHANT_ID || '';

        if (!this.subscriptionKey || !this.businessId || !this.merchantId) {
            logger.warn('AlatPay configuration is missing or incomplete');
        }
    }

    public static getInstance(): AlatPayClient {
        if (!AlatPayClient.instance) {
            AlatPayClient.instance = new AlatPayClient();
        }
        return AlatPayClient.instance;
    }

    private getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
        };
    }

    public async generateVirtualAccount(request: Omit<AlatPayVirtualAccountRequest, 'businessId'>): Promise<AlatPayVirtualAccountResponse> {
        try {
            const finalRequest: AlatPayVirtualAccountRequest = {
                ...request,
                businessId: this.businessId,
            };

            const response = await axios.post(
                `${this.apiUrl}/bank-transfer/api/v1/bankTransfer/virtualAccount`,
                finalRequest,
                { headers: this.getHeaders() }
            );

            return response.data;
        } catch (error) {
            logger.error('Error generating virtual account:', error);
            throw error;
        }
    }

    public async getTransactionStatus(transactionId: string): Promise<AlatPayTransactionStatusResponse> {
        try {
            const response = await axios.get(
                `${this.apiUrl}/bank-transfer/api/v1/bankTransfer/transactions/${transactionId}`,
                { headers: this.getHeaders() }
            );

            return response.data;
        } catch (error) {
            logger.error('Error checking transaction status:', error);
            throw error;
        }
    }

    public async getAllTransactions(page: number = 1, limit: number = 10): Promise<any> {
        try {
            const response = await axios.get(
                `${this.apiUrl}/alatpaytransaction/api/v1/transactions`,
                {
                    params: {
                        Page: page,
                        Limit: limit,
                        BusinessId: this.businessId,
                    },
                    headers: this.getHeaders(),
                }
            );

            return response.data;
        } catch (error) {
            logger.error('Error fetching transactions:', error);
            throw error;
        }
    }

    public async validateWebhookPayload(payload: AlatPayWebhookPayload): Promise<boolean> {
        // In a real implementation, you would verify the webhook signature
        // ALATPay might include a signature in headers or have another
        // mechanism to verify webhook authenticity

        // For now, we'll do some basic validation
        if (!payload.Value || !payload.Value.Data) {
            return false;
        }

        const { BusinessId, MerchantId } = payload.Value.Data;

        // Verify this webhook is for your business
        return (BusinessId === this.businessId && MerchantId === this.merchantId);
    }
}