// src/services/kwikDelivery.service.ts
import axios from 'axios';
import { logger } from '../utils/logger';

interface KwikCredentials {
    domain: string;
    environment: string;
    email: string;
    password: string;
}

interface DeliveryAddress {
    latitude: number;
    longitude: number;
    address: string;
}

interface CustomerDetails {
    name: string;
    phone: string;
}

interface OrderDetails {
    order_number: string;
    total_amount: number;
    delivery_fee: number;
    payment_method: 'prepaid' | 'cash' | 'card';
}

interface KwikDeliveryRequest {
    pickup_address: DeliveryAddress;
    delivery_address: DeliveryAddress;
    customer_details: CustomerDetails;
    order_details: OrderDetails;
    vehicle_type: 'bike' | 'car' | 'truck';
    delivery_instructions?: string;
    scheduled_time?: string;
}

interface KwikDeliveryResponse {
    status: 'success' | 'error';
    task_id?: string;
    estimated_delivery_time?: string;
    rider_details?: {
        name: string;
        phone: string;
        vehicle: string;
    };
    tracking_url?: string;
    error_message?: string;
}

interface KwikLoginResponse {
    access_token: string;
    user_id: string;
    vendor_id: string;
    card_id: string;
}

class KwikDeliveryService {
    private baseUrl: string;
    private accessToken: string | null = null;
    private userId: string | null = null;
    private vendorId: string | null = null;
    private cardId: string | null = null;

    constructor() {
        this.baseUrl = process.env.KWIK_API_BASE_URL || 'https://app.kwik.delivery/api/v1';
    }

    /**
     * Authenticate with Kwik API and get access token
     */
    async authenticate(credentials: KwikCredentials): Promise<void> {
        try {
            const response = await axios.post(`${this.baseUrl}/admin/login`, {
                domain: credentials.domain,
                environment: credentials.environment,
                email: credentials.email,
                password: credentials.password,
            });

            if (response.data && response.data.data) {
                const data: KwikLoginResponse = response.data.data;
                this.accessToken = data.access_token;
                this.userId = data.user_id;
                this.vendorId = data.vendor_id;
                this.cardId = data.card_id;
                
                logger.info('Kwik API authentication successful');
            } else {
                throw new Error('Invalid authentication response from Kwik API');
            }
        } catch (error: any) {
            logger.error('Kwik API authentication failed:', error.message);
            throw new Error(`Failed to authenticate with Kwik API: ${error.message}`);
        }
    }

    /**
     * Get available delivery vehicles
     */
    async getAvailableVehicles(): Promise<any[]> {
        if (!this.accessToken) {
            throw new Error('Not authenticated with Kwik API');
        }

        try {
            const response = await axios.get(`${this.baseUrl}/delivery/vehicles`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            return response.data?.data || [];
        } catch (error: any) {
            logger.error('Failed to get available vehicles:', error.message);
            throw new Error(`Failed to get vehicles: ${error.message}`);
        }
    }

    /**
     * Get delivery pricing estimate
     */
    async getDeliveryEstimate(pickup: DeliveryAddress, delivery: DeliveryAddress, vehicleType: string = 'bike'): Promise<any> {
        if (!this.accessToken) {
            throw new Error('Not authenticated with Kwik API');
        }

        try {
            const response = await axios.post(`${this.baseUrl}/delivery/estimate`, {
                pickup_latitude: pickup.latitude,
                pickup_longitude: pickup.longitude,
                delivery_latitude: delivery.latitude,
                delivery_longitude: delivery.longitude,
                vehicle_type: vehicleType,
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            return response.data?.data || {};
        } catch (error: any) {
            logger.error('Failed to get delivery estimate:', error.message);
            throw new Error(`Failed to get estimate: ${error.message}`);
        }
    }

    /**
     * Create a delivery request
     */
    async createDeliveryRequest(deliveryRequest: KwikDeliveryRequest): Promise<KwikDeliveryResponse> {
        if (!this.accessToken) {
            throw new Error('Not authenticated with Kwik API');
        }

        try {
            // Get available vehicles first
            const vehicles = await this.getAvailableVehicles();
            const selectedVehicle = vehicles.find(v => v.type === deliveryRequest.vehicle_type) || vehicles[0];

            if (!selectedVehicle) {
                throw new Error('No available vehicles for delivery');
            }

            // Create the delivery task
            const taskPayload = {
                vehicle_id: selectedVehicle.vehicle_id,
                pickup_address: deliveryRequest.pickup_address.address,
                pickup_latitude: deliveryRequest.pickup_address.latitude,
                pickup_longitude: deliveryRequest.pickup_address.longitude,
                delivery_address: deliveryRequest.delivery_address.address,
                delivery_latitude: deliveryRequest.delivery_address.latitude,
                delivery_longitude: deliveryRequest.delivery_address.longitude,
                customer_name: deliveryRequest.customer_details.name,
                customer_phone: deliveryRequest.customer_details.phone,
                order_number: deliveryRequest.order_details.order_number,
                total_amount: deliveryRequest.order_details.total_amount,
                delivery_fee: deliveryRequest.order_details.delivery_fee,
                payment_method: deliveryRequest.order_details.payment_method,
                delivery_instructions: deliveryRequest.delivery_instructions || '',
                scheduled_time: deliveryRequest.scheduled_time || null,
                vendor_id: this.vendorId,
                card_id: this.cardId,
            };

            const response = await axios.post(`${this.baseUrl}/delivery/task`, taskPayload, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            if (response.data && response.data.status === 'success') {
                const deliveryData = response.data.data;
                
                return {
                    status: 'success',
                    task_id: deliveryData.task_id,
                    estimated_delivery_time: deliveryData.estimated_time || '45-60 minutes',
                    rider_details: {
                        name: deliveryData.rider_name || 'Kwik Rider',
                        phone: deliveryData.rider_phone || '+234800000000',
                        vehicle: selectedVehicle.type || 'bike',
                    },
                    tracking_url: deliveryData.tracking_url || `https://kwik.delivery/track/${deliveryData.task_id}`,
                };
            } else {
                throw new Error(response.data?.message || 'Failed to create delivery task');
            }

        } catch (error: any) {
            logger.error('Failed to create delivery request:', error.message);
            
            return {
                status: 'error',
                error_message: `Delivery request failed: ${error.message}`,
            };
        }
    }

    /**
     * Track delivery status
     */
    async trackDelivery(taskId: string): Promise<any> {
        if (!this.accessToken) {
            throw new Error('Not authenticated with Kwik API');
        }

        try {
            const response = await axios.get(`${this.baseUrl}/delivery/track/${taskId}`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            return response.data?.data || {};
        } catch (error: any) {
            logger.error('Failed to track delivery:', error.message);
            throw new Error(`Failed to track delivery: ${error.message}`);
        }
    }

    /**
     * Cancel delivery request
     */
    async cancelDelivery(taskId: string, reason: string): Promise<boolean> {
        if (!this.accessToken) {
            throw new Error('Not authenticated with Kwik API');
        }

        try {
            const response = await axios.post(`${this.baseUrl}/delivery/cancel`, {
                task_id: taskId,
                cancellation_reason: reason,
            }, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                },
            });

            return response.data?.status === 'success';
        } catch (error: any) {
            logger.error('Failed to cancel delivery:', error.message);
            return false;
        }
    }

    /**
     * Calculate delivery fee based on distance and system settings
     */
    calculateDeliveryFee(distance: number, baseRate: number = 200, perKmRate: number = 50): number {
        const calculatedFee = baseRate + (distance * perKmRate);
        const minimumFee = 150;
        const maximumFee = 500;
        
        return Math.min(Math.max(calculatedFee, minimumFee), maximumFee);
    }

    /**
     * Validate delivery addresses
     */
    validateAddresses(pickup: DeliveryAddress, delivery: DeliveryAddress): boolean {
        const isValidAddress = (addr: DeliveryAddress): boolean => {
            return !!(
                addr.latitude && 
                addr.longitude && 
                addr.address &&
                addr.latitude >= -90 && addr.latitude <= 90 &&
                addr.longitude >= -180 && addr.longitude <= 180
            );
        };

        return isValidAddress(pickup) && isValidAddress(delivery);
    }
}

// Export singleton instance
export const kwikDeliveryService = new KwikDeliveryService();
export default kwikDeliveryService;