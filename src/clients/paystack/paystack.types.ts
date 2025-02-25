/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PaystackResponse<T> {
    status: boolean;
    message: string;
    data?: T;
}

export interface InitializeTransactionParams {
    amount: string;
    email: string;
    currency?: string;
    reference?: string;
    callback_url?: string;
    metadata?: string;
    channels?: ['card' | 'bank' | 'ussd' | 'bank_transfer'];
}
export interface InitializeTransactionResponseData {
    authorization_url: string;
    access_code: string;
    reference: string;
}

export interface VerifyTransactionResponseData {
    id: string;
    domain: string;
    status: string;
    reference: string;
    amount: number;
    message: string;
    gateway_response: string;
    paid_at: string;
    created_at: string;
    transaction_date: string;
    channel: string;
    currency: string;
    ip_address: string;
    metadata: string;
    requested_amount: number;
    fees: number;
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
        account_name: string;
    };
    customer: {
        id: number;
        customer_code: string;
        first_name: string;
        last_name: string;
        email: string;
        customer_phone: string;
        phone: string;
        metadata: string;
        risk_action: string;
        international_format_phone: string;
    };
}

export interface CustomerData {
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    metadata?: any;
    customer_code: string;
    risk_action: string;
    id: number;
    integration: number;
    domain: string;
    identified: boolean;
    identifications: any;
    createdAt: string;
    updatedAt: string;
}

export interface BankData {
    name: string;
    slug: string;
    code: string;
    longcode: string;
    gateway: string | null;
    pay_with_bank: boolean;
    active: boolean;
    is_deleted: boolean;
    country: string;
    currency: string;
    type: string;
    id: number;
    createdAt: string;
    updatedAt: string;
}

export interface AccountVerificationData {
    account_number: string;
    account_name: string;
    bank_id: number;
}

export interface TransferRecipientData {
    active: boolean;
    createdAt: string;
    currency: string;
    domain: string;
    id: number;
    integration: number;
    name: string;
    recipient_code: string;
    type: string;
    updatedAt: string;
    is_deleted: boolean;
    details: {
        authorization_code: string | null;
        account_number: string;
        account_name: string;
        bank_code: string;
        bank_name: string;
    };
}

export interface TransferData {
    integration: number;
    domain: string;
    amount: number;
    currency: string;
    source: string;
    reason: string;
    recipient: number;
    status: string;
    transfer_code: string;
    id: number;
    createdAt: string;
    updatedAt: string;
}

export interface InitializeTransactionResponseData {
    authorization_url: string;
    access_code: string;
    reference: string;
}

