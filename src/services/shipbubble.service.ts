import axios, { AxiosInstance } from 'axios';
import { BadRequestError, NotFoundError } from '../utils/customErrors';
import { logger } from '../utils/logger';
import crypto from 'crypto';

export interface ShipBubbleConfig {
    apiKey: string;
    baseURL: string;
    environment: 'sandbox' | 'production';
}

export interface AddressValidationResult {
    address_code: number;
    formatted_address: string;
    latitude: number;
    longitude: number;
}

export interface CourierOption {
    courier_id: string; // Required for creating label
    service_code: string;
    courier_name: string;
    service_name: string;
    amount: number;
    total?: number; // ShipBubble uses 'total' instead of 'amount' in some responses
    estimated_delivery_time: string;
    delivery_eta?: string; // ShipBubble uses 'delivery_eta' in fetch_rates response
    logo_url?: string;
    courier_image?: string; // ShipBubble courier image URL
    tracking_level?: string | number; // String: FULL, PARTIAL, BASIC, NONE | Number: 1-7 (ShipBubble scale)
    ratings?: number; // 0-5 star rating
}

export interface FetchRatesRequest {
    sender_address_code: number;
    reciever_address_code: number; // Note: ShipBubble API has typo "reciever"
    pickup_date: string; // YYYY-MM-DD
    category_id: number;
    package_items: {
        name: string;
        description: string;
        unit_weight: string; // In KG, as string per ShipBubble docs
        unit_amount: string; // As string per ShipBubble docs
        quantity: string; // As string per ShipBubble docs
    }[];
    package_dimension: { // SINGULAR, not plural!
        length: number;
        width: number;
        height: number;
    };
    delivery_instructions?: string;
}

export interface FetchRatesResponse {
    request_token: string;
    couriers: CourierOption[];
    categoryId?: number;
    fastest_courier?: CourierOption;
    cheapest_courier?: CourierOption;
}

export interface CourierRecommendation {
    recommended: CourierOption;
    reason: string;
    score: number;
    analysis: {
        deliveryCostPercentage: number;
        isFastest: boolean;
        isCheapest: boolean;
        trackingQuality: string | number;
        rating: number;
    };
}

export interface CreateLabelRequest {
    request_token: string;
    service_code: string;
    courier_id: string; // Required as per ShipBubble API docs
}

export interface CreateLabelResponse {
    order_id: string;
    tracking_number: string;
    courier_name: string;
    tracking_url: string;
    estimated_delivery_date: string;
    label_url: string;
}

/**
 * ShipBubble Service
 * Integrates with ShipBubble API for delivery management
 *
 * API Documentation: https://api.shipbubble.com/v1/docs
 */
export default class ShipBubbleService {
    private static client: AxiosInstance | null = null;

    // Food/Grocery category IDs (environment-specific)
    // Sandbox: 2178251 (Groceries)
    // Production: 69709726 (Food)
    private static readonly FOOD_CATEGORY_ID_SANDBOX = 2178251;
    private static readonly FOOD_CATEGORY_ID_PRODUCTION = 69709726;

    // Get the correct category ID based on environment
    private static get FOOD_CATEGORY_ID(): number {
        const env = process.env.SHIPBUBBLE_ENV || 'sandbox';
        return env === 'production'
            ? this.FOOD_CATEGORY_ID_PRODUCTION
            : this.FOOD_CATEGORY_ID_SANDBOX;
    }

    // Package dimension presets based on weight
    private static readonly DIMENSION_PRESETS = {
        envelope: { length: 25, width: 35, height: 2, maxWeight: 0.5 },
        flyer: { length: 41, width: 31, height: 4, maxWeight: 2 },
        smallBox: { length: 32, width: 32, height: 10, maxWeight: 3 },
        bigBox: { length: 34, width: 34, height: 32, maxWeight: 12 },
        largeBox1: { length: 42, width: 36, height: 37, maxWeight: 18 },
        largeBox2: { length: 48, width: 40, height: 39, maxWeight: 25 },
        largeBox3: { length: 56, width: 50, height: 45, maxWeight: 40 },
    };

    /**
     * Initialize ShipBubble API client
     */
    private static getClient(): AxiosInstance {
        if (this.client) return this.client;

        const config: ShipBubbleConfig = {
            apiKey: process.env.SHIPBUBBLE_API_KEY || '',
            baseURL: process.env.SHIPBUBBLE_BASE_URL || 'https://api.shipbubble.com/v1',
            environment: (process.env.SHIPBUBBLE_ENV as 'sandbox' | 'production') || 'sandbox',
        };

        if (!config.apiKey) {
            throw new Error('SHIPBUBBLE_API_KEY not configured in environment variables');
        }

        this.client = axios.create({
            baseURL: config.baseURL,
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000, // 30 seconds
        });

        // Log requests in development
        if (process.env.NODE_ENV === 'development') {
            this.client.interceptors.request.use((req) => {
                logger.info(`[ShipBubble] ${req.method?.toUpperCase()} ${req.url}`, {
                    data: req.data,
                });
                return req;
            });
        }

        // Log responses and errors
        this.client.interceptors.response.use(
            (response) => {
                if (process.env.NODE_ENV === 'development') {
                    logger.info('[ShipBubble] Response:', { data: response.data });
                }
                return response;
            },
            (error) => {
                logger.error('[ShipBubble] API Error:', {
                    message: error.message,
                    response: error.response?.data,
                    status: error.response?.status,
                });
                throw error;
            }
        );

        return this.client;
    }

    /**
     * Calculate SHA256 hash for address change detection
     */
    static calculateAddressHash(address: string, city: string, state: string): string {
        const normalized = `${address}|${city}|${state}`.toLowerCase().trim();
        return crypto.createHash('sha256').update(normalized).digest('hex');
    }

    /**
     * Validate an address with ShipBubble API
     * @returns Validated address with address_code (integer)
     */
    static async validateAddress(params: {
        address: string;
        city: string;
        state: string;
        country?: string;
        name?: string;
        email?: string;
        phone?: string;
    }): Promise<AddressValidationResult> {
        try {
            // ShipBubble requires full address with city, state, and country
            // Format: "Street Address, City, State, Country"
            // Example: "Landmark Towers, Victoria Island, Lagos, Nigeria"
            const city = params.city || '';
            const state = params.state || '';
            const country = params.country || 'Nigeria';

            // Build complete address string
            const addressParts = [params.address, city, state, country].filter(Boolean);
            const fullAddress = addressParts.join(', ');

            logger.info('[ShipBubble] Validating address:', {
                originalAddress: params.address,
                fullAddress,
                city,
                state,
                country,
            });

            const response = await this.getClient().post('/shipping/address/validate', {
                name: params.name || 'Customer',
                email: params.email || 'customer@busy2shop.com',
                phone: params.phone || '+2348167291741', // Valid Nigerian number: +234...
                address: fullAddress, // ✅ Full address with city, state, and country
            });

            if (response.data.status === 'success') {
                logger.info('[ShipBubble] Address validated successfully:', {
                    addressCode: response.data.data.address_code,
                    formattedAddress: response.data.data.formatted_address,
                });
                return response.data.data as AddressValidationResult;
            }

            throw new BadRequestError(response.data.message || 'Address validation failed');
        } catch (error: any) {
            logger.error('[ShipBubble] Address validation error:', {
                address: params.address,
                city: params.city,
                state: params.state,
                error: error.response?.data || error.message,
            });

            if (error.response?.data?.message) {
                throw new BadRequestError(`Address validation failed: ${error.response.data.message}`);
            }
            throw error;
        }
    }

    /**
     * Calculate total package weight from shopping list items
     * @returns Weight in kg (clamped between 1kg and 40kg)
     */
    static calculatePackageWeight(items: {
        quantity: number;
        unit?: string;
    }[]): number {
        let totalWeight = 0;

        for (const item of items) {
            const quantity = item.quantity || 1;
            const unit = (item.unit || '').toLowerCase();

            if (unit.includes('kg')) {
                // Item measured in kg
                totalWeight += quantity;
            } else if (unit.includes('g') && unit.includes('gram')) {
                // Item measured in grams
                totalWeight += quantity / 1000;
            } else if (unit.includes('liter') || unit.includes('litre') || unit.includes('ml')) {
                // Liquid items: assume 1L = 1kg
                if (unit.includes('ml')) {
                    totalWeight += quantity / 1000;
                } else {
                    totalWeight += quantity;
                }
            } else {
                // Unknown unit: assume 0.5kg per piece (conservative estimate)
                totalWeight += quantity * 0.5;
            }
        }

        // Clamp between 1kg and 40kg (ShipBubble limits)
        return Math.max(1, Math.min(40, Math.round(totalWeight * 100) / 100));
    }

    /**
     * Get appropriate package dimensions based on weight
     */
    static getPackageDimensions(weight: number): { length: number; width: number; height: number } {
        if (weight <= this.DIMENSION_PRESETS.envelope.maxWeight) {
            return {
                length: this.DIMENSION_PRESETS.envelope.length,
                width: this.DIMENSION_PRESETS.envelope.width,
                height: this.DIMENSION_PRESETS.envelope.height,
            };
        } else if (weight <= this.DIMENSION_PRESETS.flyer.maxWeight) {
            return {
                length: this.DIMENSION_PRESETS.flyer.length,
                width: this.DIMENSION_PRESETS.flyer.width,
                height: this.DIMENSION_PRESETS.flyer.height,
            };
        } else if (weight <= this.DIMENSION_PRESETS.smallBox.maxWeight) {
            return {
                length: this.DIMENSION_PRESETS.smallBox.length,
                width: this.DIMENSION_PRESETS.smallBox.width,
                height: this.DIMENSION_PRESETS.smallBox.height,
            };
        } else if (weight <= this.DIMENSION_PRESETS.bigBox.maxWeight) {
            return {
                length: this.DIMENSION_PRESETS.bigBox.length,
                width: this.DIMENSION_PRESETS.bigBox.width,
                height: this.DIMENSION_PRESETS.bigBox.height,
            };
        } else if (weight <= this.DIMENSION_PRESETS.largeBox1.maxWeight) {
            return {
                length: this.DIMENSION_PRESETS.largeBox1.length,
                width: this.DIMENSION_PRESETS.largeBox1.width,
                height: this.DIMENSION_PRESETS.largeBox1.height,
            };
        } else if (weight <= this.DIMENSION_PRESETS.largeBox2.maxWeight) {
            return {
                length: this.DIMENSION_PRESETS.largeBox2.length,
                width: this.DIMENSION_PRESETS.largeBox2.width,
                height: this.DIMENSION_PRESETS.largeBox2.height,
            };
        } else {
            return {
                length: this.DIMENSION_PRESETS.largeBox3.length,
                width: this.DIMENSION_PRESETS.largeBox3.width,
                height: this.DIMENSION_PRESETS.largeBox3.height,
            };
        }
    }

    /**
     * Parse time string (e.g., "07:00", "18:30") to hour (7, 18.5)
     * @param timeString - Time in HH:MM format
     * @returns Hour as decimal (e.g., "18:30" → 18.5)
     */
    private static parseTimeToHour(timeString: string): number {
        const [hours, minutes] = timeString.split(':').map(Number);
        return hours + (minutes / 60);
    }

    /**
     * Get market hours for a specific day from operatingHours object
     * @param operatingHours - Market operating hours object
     * @param dayOfWeek - Day of week (0=Sunday, 6=Saturday)
     * @returns Object with open/close hours, or null if market is closed
     */
    private static getMarketHoursForDay(
        operatingHours: any,
        dayOfWeek: number
    ): { open: number; close: number } | null {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[dayOfWeek];

        if (!operatingHours || !operatingHours[dayName]) {
            return null; // Market closed or no hours defined
        }

        const dayHours = operatingHours[dayName];

        // Check if market is closed (e.g., { open: "closed", close: "closed" })
        if (dayHours.open === 'closed' || dayHours.close === 'closed' || !dayHours.open || !dayHours.close) {
            return null;
        }

        return {
            open: this.parseTimeToHour(dayHours.open),
            close: this.parseTimeToHour(dayHours.close),
        };
    }

    /**
     * Calculate optimal pickup date based on ShipBubble constraints and business logic
     *
     * ShipBubble Constraints:
     * - Rates requested after 6 PM (GMT+1 / WAT) are scheduled for next day
     * - Cannot request pickup more than 7 days in future
     * - Pickup must be on a business day (Mon-Sat for Nigerian markets)
     *
     * Business Logic:
     * - Allow 30-60 min buffer for shopping completion
     * - Consider market-specific opening hours (uses market operatingHours if provided)
     * - Agent should complete shopping before requesting pickup
     * - If market is closed on a day, skip to next open day
     *
     * @param options.shoppingCompletedAt - When shopping was completed (optional)
     * @param options.marketOperatingHours - Market's operatingHours object (JSONB from Market model)
     * @param options.marketOpeningHour - Manual override for market opening hour (default: 7 AM)
     * @param options.marketClosingHour - Manual override for market closing hour (default: 6 PM / 18:00)
     * @param options.bufferMinutes - Buffer time after shopping for pickup (default: 30)
     * @returns Pickup date in YYYY-MM-DD format
     */
    static calculatePickupDate(options: {
        shoppingCompletedAt?: Date;
        marketOperatingHours?: any;
        marketOpeningHour?: number;
        marketClosingHour?: number;
        bufferMinutes?: number;
    } = {}): string {
        const {
            shoppingCompletedAt,
            marketOperatingHours,
            marketOpeningHour,
            marketClosingHour,
            bufferMinutes = 30,
        } = options;

        // Use Lagos timezone (WAT = GMT+1)
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday

        // Calculate earliest possible pickup time
        let earliestPickup = new Date(now);

        // If shopping was completed, use that as base time + buffer
        if (shoppingCompletedAt) {
            earliestPickup = new Date(shoppingCompletedAt);
            earliestPickup.setMinutes(earliestPickup.getMinutes() + bufferMinutes);
        }

        // Use the earliest pickup time for all time-based checks
        const checkHour = earliestPickup.getHours();
        const checkMinute = earliestPickup.getMinutes();
        const checkDecimalHour = checkHour + (checkMinute / 60); // For more precise comparison

        // Determine market hours for today
        let effectiveMarketOpen = marketOpeningHour ?? 7; // Default 7 AM
        let effectiveMarketClose = marketClosingHour ?? 18; // Default 6 PM

        // If market operating hours are provided, use them
        if (marketOperatingHours) {
            const todayMarketHours = this.getMarketHoursForDay(marketOperatingHours, currentDay);
            if (todayMarketHours) {
                effectiveMarketOpen = todayMarketHours.open;
                effectiveMarketClose = todayMarketHours.close;
            } else {
                // Market is closed today, move to next day
                effectiveMarketOpen = 24; // Set impossible time to force next day
                effectiveMarketClose = 0;
            }
        }

        // Apply ShipBubble 6 PM cutoff rule
        // Requests after 6 PM WAT must be scheduled for next day
        const isAfter6PM = checkDecimalHour >= 18; // 6 PM or later

        // Apply market hours constraint
        // If current time is before market opens, still allow same day (market will open)
        // If current time is after market closes, move to next day
        const isBeforeMarketOpens = checkDecimalHour < effectiveMarketOpen;
        const isAfterMarketCloses = checkDecimalHour >= effectiveMarketClose;

        // Determine pickup date
        let pickupDate = new Date(earliestPickup);

        // ONLY move to next day if:
        // 1. After 6 PM ShipBubble cutoff, OR
        // 2. After market closing time (market already closed)
        // Do NOT move if just before market opens - same day pickup can still happen
        if (isAfter6PM || isAfterMarketCloses) {
            pickupDate.setDate(pickupDate.getDate() + 1);
        }

        // Ensure pickup is on a day when market is open
        // Try up to 7 days to find an open day
        let pickupDay = pickupDate.getDay();
        let daysChecked = 0;
        let maxAttempts = 7; // ShipBubble 7-day limit

        while (daysChecked < maxAttempts) {
            pickupDay = pickupDate.getDay();

            // Check if market is open on this day
            let isMarketOpenOnDay = true;

            if (marketOperatingHours) {
                const dayMarketHours = this.getMarketHoursForDay(marketOperatingHours, pickupDay);
                if (!dayMarketHours) {
                    // Market closed on this day
                    isMarketOpenOnDay = false;
                }
            } else {
                // No operating hours provided, assume closed only on Sunday (Nigerian default)
                if (pickupDay === 0) {
                    isMarketOpenOnDay = false;
                }
            }

            if (isMarketOpenOnDay) {
                break; // Found an open day
            }

            // Move to next day
            pickupDate.setDate(pickupDate.getDate() + 1);
            daysChecked++;
        }

        // Ensure we don't exceed 7-day ShipBubble limit
        const maxPickupDate = new Date(now);
        maxPickupDate.setDate(maxPickupDate.getDate() + 7);

        if (pickupDate > maxPickupDate) {
            // If calculated date exceeds limit, use max allowed date
            pickupDate = maxPickupDate;

            // But ensure market is still open on that day
            // Work backwards from max date to find an open day
            let foundOpenDay = false;
            for (let i = 0; i < 7; i++) {
                pickupDay = pickupDate.getDay();

                let isMarketOpenOnDay = true;
                if (marketOperatingHours) {
                    const dayMarketHours = this.getMarketHoursForDay(marketOperatingHours, pickupDay);
                    if (!dayMarketHours) {
                        isMarketOpenOnDay = false;
                    }
                } else {
                    // No operating hours provided, assume closed only on Sunday
                    if (pickupDay === 0) {
                        isMarketOpenOnDay = false;
                    }
                }

                if (isMarketOpenOnDay) {
                    foundOpenDay = true;
                    break;
                }

                // Move back one day
                pickupDate.setDate(pickupDate.getDate() - 1);
            }

            if (!foundOpenDay) {
                // Fallback: use max date anyway (unlikely scenario)
                pickupDate = maxPickupDate;
            }
        }

        // Format as YYYY-MM-DD for ShipBubble API
        const year = pickupDate.getFullYear();
        const month = String(pickupDate.getMonth() + 1).padStart(2, '0');
        const day = String(pickupDate.getDate()).padStart(2, '0');

        const formattedDate = `${year}-${month}-${day}`;

        logger.info('[ShipBubble] Calculated pickup date:', {
            now: now.toISOString(),
            currentHour,
            currentMinute,
            isAfter6PM,
            isBeforeMarketOpens,
            isAfterMarketCloses,
            effectiveMarketOpen,
            effectiveMarketClose,
            usedMarketOperatingHours: !!marketOperatingHours,
            pickupDate: formattedDate,
            dayOfWeek: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][pickupDate.getDay()],
        });

        return formattedDate;
    }

    /**
     * Fetch shipping rates from multiple couriers
     * @returns Request token (24-hour expiry) and courier options with pricing
     */
    static async fetchShippingRates(params: FetchRatesRequest): Promise<FetchRatesResponse> {
        try {
            // Validate required parameters
            if (!params.sender_address_code || !params.reciever_address_code) {
                throw new BadRequestError('Sender and receiver address codes are required');
            }

            if (!params.pickup_date) {
                throw new BadRequestError('Pickup date is required (YYYY-MM-DD format)');
            }

            if (!params.package_items || params.package_items.length === 0) {
                throw new BadRequestError('At least one package item is required');
            }

            // Ensure category_id is set to Food
            params.category_id = this.FOOD_CATEGORY_ID;

            logger.info('[ShipBubble] Fetching shipping rates:', {
                sender: params.sender_address_code,
                receiver: params.reciever_address_code,
                items: params.package_items.length,
            });

            const response = await this.getClient().post('/shipping/fetch_rates', params);

            if (response.data.status === 'success') {
                return {
                    request_token: response.data.data.request_token,
                    couriers: response.data.data.couriers,
                    categoryId: this.FOOD_CATEGORY_ID, // Return the actual category used
                    fastest_courier: response.data.data.fastest_courier,
                    cheapest_courier: response.data.data.cheapest_courier,
                };
            }

            throw new BadRequestError(response.data.message || 'Failed to fetch shipping rates');
        } catch (error: any) {
            if (error.response?.data?.message) {
                throw new BadRequestError(`Fetch rates failed: ${error.response.data.message}`);
            }
            throw error;
        }
    }

    /**
     * Create shipping label (commits the order to ShipBubble)
     * @requires Valid request_token from fetchShippingRates (within 24 hours)
     * @returns Order ID, tracking number, and label URL
     */
    static async createShippingLabel(params: CreateLabelRequest): Promise<CreateLabelResponse> {
        try {
            if (!params.request_token) {
                throw new BadRequestError('Request token is required');
            }

            if (!params.service_code) {
                throw new BadRequestError('Service code is required');
            }

            if (!params.courier_id) {
                throw new BadRequestError('Courier ID is required');
            }

            logger.info('[ShipBubble] Creating shipping label:', {
                service_code: params.service_code,
                courier_id: params.courier_id,
            });

            const response = await this.getClient().post('/shipping/labels', {
                request_token: params.request_token,
                service_code: params.service_code,
                courier_id: params.courier_id,
            });

            if (response.data.status === 'success') {
                return {
                    order_id: response.data.data.order_id,
                    tracking_number: response.data.data.tracking_number,
                    courier_name: response.data.data.courier_name,
                    tracking_url: response.data.data.tracking_url,
                    estimated_delivery_date: response.data.data.estimated_delivery_date,
                    label_url: response.data.data.label_url,
                };
            }

            throw new BadRequestError(response.data.message || 'Failed to create shipping label');
        } catch (error: any) {
            if (error.response?.data?.message) {
                throw new BadRequestError(`Create label failed: ${error.response.data.message}`);
            }
            throw error;
        }
    }

    /**
     * Track shipment status
     */
    static async trackShipment(trackingNumber: string): Promise<any> {
        try {
            const response = await this.getClient().get(`/shipping/track/${trackingNumber}`);

            if (response.data.status === 'success') {
                return response.data.data;
            }

            throw new NotFoundError('Shipment not found');
        } catch (error: any) {
            if (error.response?.status === 404) {
                throw new NotFoundError('Shipment not found');
            }
            throw error;
        }
    }

    /**
     * Cancel shipment (only before pickup)
     */
    static async cancelShipment(orderId: string): Promise<void> {
        try {
            const response = await this.getClient().post(`/shipping/cancel/${orderId}`);

            if (response.data.status !== 'success') {
                throw new BadRequestError(response.data.message || 'Failed to cancel shipment');
            }
        } catch (error: any) {
            if (error.response?.data?.message) {
                throw new BadRequestError(`Cancel shipment failed: ${error.response.data.message}`);
            }
            throw error;
        }
    }

    /**
     * Smart courier selection based on order value, delivery cost, speed, and system settings
     * Algorithm:
     * - For high-value orders (>₦50,000), prioritize speed if delivery cost is <5% of order
     * - For medium orders (₦20,000-₦50,000), balance speed and cost
     * - For low-value orders (<₦20,000), prioritize cheapest option
     * - Consider courier ratings and tracking capabilities
     */
    static recommendCourier(params: {
        couriers: CourierOption[];
        fastestCourier?: CourierOption;
        cheapestCourier?: CourierOption;
        orderTotal: number;
        systemSettings?: {
            highValueThreshold?: number;
            mediumValueThreshold?: number;
            maxDeliveryCostPercentage?: number;
            prioritizeSpeed?: boolean;
        };
    }): CourierRecommendation {
        const {
            couriers,
            fastestCourier,
            cheapestCourier,
            orderTotal,
            systemSettings = {},
        } = params;

        // Default thresholds (can be overridden by system settings)
        const HIGH_VALUE = systemSettings.highValueThreshold || 50000;
        const MEDIUM_VALUE = systemSettings.mediumValueThreshold || 20000;
        const MAX_DELIVERY_PERCENTAGE = systemSettings.maxDeliveryCostPercentage || 5;

        // Find fastest and cheapest from couriers if not provided by API
        const fastest = fastestCourier || couriers.reduce((prev, curr) =>
            this.parseDeliveryTime(curr.delivery_eta || curr.estimated_delivery_time) <
            this.parseDeliveryTime(prev.delivery_eta || prev.estimated_delivery_time) ? curr : prev
        );
        const cheapest = cheapestCourier || couriers.reduce((prev, curr) =>
            (curr.total || curr.amount || 0) < (prev.total || prev.amount || 0) ? curr : prev
        );

        // Score each courier
        const scoredCouriers = couriers.map(courier => {
            const cost = courier.total || courier.amount || 0;
            const deliveryHours = this.parseDeliveryTime(courier.delivery_eta || courier.estimated_delivery_time);
            const deliveryCostPercentage = (cost / orderTotal) * 100;
            const isFastest = courier.courier_id === fastest.courier_id;
            const isCheapest = courier.courier_id === cheapest.courier_id;

            // Rating score (0-1): normalized rating
            const ratingScore = (courier.ratings || 3) / 5;

            // Tracking score (0-1): better tracking = higher score
            // ShipBubble uses numeric tracking_level (1-7) where 7 is best
            let trackingScore = 0.5; // Default
            if (typeof courier.tracking_level === 'number') {
                // Normalize 1-7 to 0-1
                trackingScore = courier.tracking_level / 7;
            } else if (typeof courier.tracking_level === 'string') {
                const trackingMap: Record<string, number> = {
                    'FULL': 1.0,
                    'PARTIAL': 0.7,
                    'BASIC': 0.4,
                    'NONE': 0.0,
                };
                trackingScore = trackingMap[courier.tracking_level.toUpperCase()] || 0.5;
            }

            // Cost efficiency score (0-1): lower percentage = higher score
            const costEfficiencyScore = Math.max(0, 1 - (deliveryCostPercentage / 15));

            // Speed score (0-1): faster delivery = higher score (normalize to 0-72 hours)
            const speedScore = Math.max(0, 1 - (deliveryHours / 72));

            let totalScore = 0;
            let reason = '';

            // Decision logic based on order value
            if (orderTotal >= HIGH_VALUE) {
                // High-value orders: prioritize speed and tracking
                if (deliveryCostPercentage <= MAX_DELIVERY_PERCENTAGE) {
                    // Delivery is affordable, go for speed
                    totalScore = (speedScore * 0.5) + (trackingScore * 0.3) + (ratingScore * 0.15) + (costEfficiencyScore * 0.05);
                    reason = isFastest
                        ? `Fastest delivery (${courier.delivery_eta}) for high-value order with affordable delivery cost (${deliveryCostPercentage.toFixed(1)}% of order)`
                        : `Good balance of speed (${courier.delivery_eta}) and tracking for high-value order`;
                } else {
                    // Delivery is expensive, balance cost and speed
                    totalScore = (costEfficiencyScore * 0.4) + (speedScore * 0.3) + (trackingScore * 0.2) + (ratingScore * 0.1);
                    reason = `Balanced option for high-value order - delivery cost is ${deliveryCostPercentage.toFixed(1)}% of order`;
                }
            } else if (orderTotal >= MEDIUM_VALUE) {
                // Medium-value orders: balance speed, cost, and tracking
                totalScore = (speedScore * 0.35) + (costEfficiencyScore * 0.35) + (trackingScore * 0.2) + (ratingScore * 0.1);
                reason = isCheapest && isFastest
                    ? 'Best overall value - both fastest and cheapest'
                    : isCheapest
                        ? `Most cost-effective option (₦${cost})`
                        : isFastest
                            ? `Fastest delivery (${courier.delivery_eta}) at reasonable cost`
                            : 'Good balance of speed, cost, and reliability';
            } else {
                // Low-value orders: prioritize cost
                totalScore = (costEfficiencyScore * 0.6) + (speedScore * 0.2) + (trackingScore * 0.1) + (ratingScore * 0.1);
                reason = isCheapest
                    ? `Most affordable option (₦${cost}) - best for smaller orders`
                    : `Good value at ₦${cost} with ${courier.delivery_eta} delivery`;
            }

            return {
                courier,
                score: totalScore,
                reason,
                analysis: {
                    deliveryCostPercentage,
                    isFastest,
                    isCheapest,
                    trackingQuality: courier.tracking_level || 'UNKNOWN',
                    rating: courier.ratings || 0,
                },
            };
        });

        // Sort by score and return best option
        scoredCouriers.sort((a, b) => b.score - a.score);
        const best = scoredCouriers[0];

        logger.info('[ShipBubble] Courier recommendation calculated:', {
            orderTotal,
            recommendedCourier: best.courier.courier_name,
            score: best.score.toFixed(3),
            reason: best.reason,
        });

        return {
            recommended: best.courier,
            reason: best.reason,
            score: best.score,
            analysis: best.analysis,
        };
    }

    /**
     * Parse delivery ETA string to hours
     * Examples: "Within 24 hrs", "2-3 days", "Within 48 hrs"
     */
    private static parseDeliveryTime(eta: string): number {
        if (!eta) return 48; // Default to 48 hours

        const lowerEta = eta.toLowerCase();

        // Check for hours
        const hoursMatch = lowerEta.match(/(\d+)\s*hrs?/);
        if (hoursMatch) {
            return parseInt(hoursMatch[1], 10);
        }

        // Check for days
        const daysMatch = lowerEta.match(/(\d+)[\s-]*(\d*)\s*days?/);
        if (daysMatch) {
            const minDays = parseInt(daysMatch[1], 10);
            const maxDays = daysMatch[2] ? parseInt(daysMatch[2], 10) : minDays;
            return ((minDays + maxDays) / 2) * 24; // Average in hours
        }

        // Default fallback
        return 48;
    }

    /**
     * Get shipping wallet balance
     * @returns Wallet balance and country code
     */
    static async getWalletBalance(): Promise<{ balance: number; country_code: string }> {
        try {
            const response = await this.getClient().get('/shipping/wallet/balance');

            if (response.data.status === 'success') {
                const { balance, currency } = response.data.data;

                // Map currency to country code
                const countryCodeMap: { [key: string]: string } = {
                    'NGN': 'NG',
                    'USD': 'US',
                    'GHS': 'GH',
                    'KES': 'KE',
                };

                const country_code = countryCodeMap[currency] || 'NG'; // Default to NG

                logger.info('[ShipBubble] Wallet balance retrieved:', {
                    balance,
                    currency,
                    country_code,
                });

                return {
                    balance,
                    country_code,
                };
            }

            throw new BadRequestError(response.data.message || 'Failed to get wallet balance');
        } catch (error: any) {
            logger.error('[ShipBubble] Get wallet balance error:', {
                error: error.response?.data || error.message,
            });
            if (error.response?.data?.message) {
                throw new BadRequestError(`Get wallet balance failed: ${error.response.data.message}`);
            }
            throw error;
        }
    }

    /**
     * Request wallet fund
     * @param amount - Amount to fund (in Naira)
     * @returns Payment reference and URL
     */
    static async requestWalletFund(amount: number): Promise<{ reference: string; payment_url: string }> {
        try {
            if (!amount || amount <= 0) {
                throw new BadRequestError('Valid amount is required for wallet funding');
            }

            const response = await this.getClient().post('/shipping/wallet/fund', { amount });

            if (response.data.status === 'success') {
                logger.info('[ShipBubble] Wallet fund request created:', {
                    reference: response.data.data.reference,
                    amount,
                });
                return response.data.data;
            }

            throw new BadRequestError(response.data.message || 'Failed to request wallet fund');
        } catch (error: any) {
            logger.error('[ShipBubble] Request wallet fund error:', {
                error: error.response?.data || error.message,
            });
            if (error.response?.data?.message) {
                throw new BadRequestError(`Request wallet fund failed: ${error.response.data.message}`);
            }
            throw error;
        }
    }

    /**
     * Get shipping labels (paginated)
     * @param page - Page number (default: 1)
     * @param perPage - Items per page (default: 20)
     * @returns Paginated list of shipping labels
     */
    static async getShipments(page: number = 1, perPage: number = 20): Promise<any> {
        try {
            const response = await this.getClient().get('/shipping/labels', {
                params: { Page: page, PerPage: perPage },
            });

            if (response.data.status === 'success') {
                logger.info('[ShipBubble] Shipments retrieved:', {
                    page,
                    perPage,
                    totalResults: response.data.data.results?.length || 0,
                });
                return response.data.data;
            }

            throw new BadRequestError(response.data.message || 'Failed to get shipments');
        } catch (error: any) {
            logger.error('[ShipBubble] Get shipments error:', {
                error: error.response?.data || error.message,
            });
            if (error.response?.data?.message) {
                throw new BadRequestError(`Get shipments failed: ${error.response.data.message}`);
            }
            throw error;
        }
    }

    /**
     * Get multiple specific shipments by order IDs
     * @param orderIds - Comma-separated list of order IDs (e.g., "GET-ABC123,GET-DEF456")
     * @returns List of specific shipments
     */
    static async getMultipleShipments(orderIds: string): Promise<any> {
        try {
            if (!orderIds || orderIds.trim() === '') {
                throw new BadRequestError('Order IDs are required');
            }

            const response = await this.getClient().get(`/shipping/labels/list/${orderIds}`);

            if (response.data.status === 'success') {
                logger.info('[ShipBubble] Multiple shipments retrieved:', {
                    orderIds,
                    count: response.data.data?.results?.length || 0,
                });
                return response.data.data;
            }

            throw new BadRequestError(response.data.message || 'Failed to get shipments');
        } catch (error: any) {
            logger.error('[ShipBubble] Get multiple shipments error:', {
                error: error.response?.data || error.message,
            });
            if (error.response?.data?.message) {
                throw new BadRequestError(`Get multiple shipments failed: ${error.response.data.message}`);
            }
            throw error;
        }
    }

    /**
     * Get package categories
     * @returns List of available package categories for shipping
     */
    static async getPackageCategories(): Promise<any[]> {
        try {
            const response = await this.getClient().get('/shipping/labels/categories');

            if (response.data.status === 'success') {
                logger.info('[ShipBubble] Package categories retrieved:', {
                    count: response.data.data?.length || 0,
                });
                return response.data.data;
            }

            throw new BadRequestError(response.data.message || 'Failed to get package categories');
        } catch (error: any) {
            logger.error('[ShipBubble] Get package categories error:', {
                error: error.response?.data || error.message,
            });
            if (error.response?.data?.message) {
                throw new BadRequestError(`Get package categories failed: ${error.response.data.message}`);
            }
            throw error;
        }
    }

    /**
     * Get available couriers
     * @returns List of available courier services
     */
    static async getAvailableCouriers(): Promise<any[]> {
        try {
            const response = await this.getClient().get('/shipping/couriers');

            if (response.data.status === 'success') {
                logger.info('[ShipBubble] Available couriers retrieved:', {
                    count: response.data.data?.length || 0,
                });
                return response.data.data;
            }

            throw new BadRequestError(response.data.message || 'Failed to get available couriers');
        } catch (error: any) {
            logger.error('[ShipBubble] Get available couriers error:', {
                error: error.response?.data || error.message,
            });
            if (error.response?.data?.message) {
                throw new BadRequestError(`Get available couriers failed: ${error.response.data.message}`);
            }
            throw error;
        }
    }
}
