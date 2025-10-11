import { Request, Response } from 'express';
import ShipBubbleService from '../services/shipbubble.service';
import ShoppingList from '../models/shoppingList.model';
import ShoppingListItem from '../models/shoppingListItem.model';
import Market from '../models/market.model';
import User from '../models/user.model';
import UserAddress from '../models/userAddress.model';
import ShipBubbleAddress from '../models/shipBubbleAddress.model';
import DeliveryQuote from '../models/deliveryQuote.model';
import Order from '../models/order.model';
import SystemSettings, { SYSTEM_SETTING_KEYS } from '../models/systemSettings.model';
import { BadRequestError, NotFoundError } from '../utils/customErrors';
import { logger } from '../utils/logger';
import moment from 'moment';

/**
 * DeliveryShipBubble Controller
 * Handles ShipBubble-specific delivery endpoints
 * For checkout flow: validate addresses, fetch quotes, select courier
 * For agent flow: create shipping labels, track shipments
 */
export default class DeliveryShipBubbleController {
    /**
     * POST /api/v1/delivery/shipbubble/validate-addresses
     * Validate customer and market addresses, return cached codes or validate with ShipBubble
     */
    static async validateAddresses(req: Request, res: Response) {
        try {
            const { userAddressId, marketId } = req.body;

            if (!userAddressId || !marketId) {
                throw new BadRequestError('User address ID and market ID are required');
            }

            // Get customer address with user info
            const userAddress = await UserAddress.findByPk(userAddressId, {
                include: [{ model: User, as: 'user' }],
            });
            if (!userAddress) {
                throw new NotFoundError('Customer address not found');
            }

            const user = (userAddress as any).user;
            if (!user) {
                throw new NotFoundError('User not found for address');
            }

            // Get market
            const market = await Market.findByPk(marketId);
            if (!market) {
                throw new NotFoundError('Market not found');
            }

            // Validate/cache receiver address (customer)
            const receiverHash = ShipBubbleService.calculateAddressHash(
                userAddress.address || userAddress.fullAddress,
                userAddress.city,
                userAddress.state
            );

            let receiverAddressCode: number;
            const cachedReceiver = await ShipBubbleAddress.findOne({
                where: { user_address_id: userAddressId, address_hash: receiverHash },
            });

            if (cachedReceiver) {
                logger.info('[ShipBubble] Using cached receiver address code:', {
                    addressCode: cachedReceiver.address_code,
                });
                receiverAddressCode = cachedReceiver.address_code;
            } else {
                // Validate with ShipBubble API
                logger.info('[ShipBubble] Validating receiver address with API');
                const validated = await ShipBubbleService.validateAddress({
                    name: `${user.firstName} ${user.lastName}`.trim() || 'Customer',
                    email: user.email || 'customer@busy2shop.com',
                    phone: user.phone || userAddress.contactPhone || '08012345678',
                    address: userAddress.fullAddress || userAddress.address,
                    city: userAddress.city,
                    state: userAddress.state,
                    country: userAddress.country || 'Nigeria',
                });

                // Cache result
                await ShipBubbleAddress.create({
                    user_address_id: userAddressId,
                    address_code: validated.address_code,
                    formatted_address: validated.formatted_address,
                    latitude: validated.latitude,
                    longitude: validated.longitude,
                    address_hash: receiverHash,
                    validation_date: new Date(),
                });

                receiverAddressCode = validated.address_code;
            }

            // Validate/cache sender address (market)
            const marketLocation = typeof market.location === 'string'
                ? JSON.parse(market.location)
                : market.location;

            const senderHash = ShipBubbleService.calculateAddressHash(
                market.address,
                marketLocation.city || '',
                marketLocation.state || ''
            );

            let senderAddressCode: number;
            const cachedSender = await ShipBubbleAddress.findOne({
                where: { market_id: marketId, address_hash: senderHash },
            });

            if (cachedSender) {
                logger.info('[ShipBubble] Using cached sender address code:', {
                    addressCode: cachedSender.address_code,
                });
                senderAddressCode = cachedSender.address_code;
            } else {
                // Validate with ShipBubble API
                logger.info('[ShipBubble] Validating sender address with API');
                const validated = await ShipBubbleService.validateAddress({
                    name: market.name || 'Market',
                    email: 'market@busy2shop.com',
                    phone: market.phoneNumber || '08012345678',
                    address: market.address,
                    city: marketLocation.city || '',
                    state: marketLocation.state || '',
                    country: marketLocation.country || 'Nigeria',
                });

                // Cache result
                await ShipBubbleAddress.create({
                    market_id: marketId,
                    address_code: validated.address_code,
                    formatted_address: validated.formatted_address,
                    latitude: validated.latitude,
                    longitude: validated.longitude,
                    address_hash: senderHash,
                    validation_date: new Date(),
                });

                senderAddressCode = validated.address_code;
            }

            res.json({
                success: true,
                data: {
                    senderAddressCode,
                    receiverAddressCode,
                },
            });
        } catch (error: any) {
            logger.error('[ShipBubble] Address validation error:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * POST /api/v1/delivery/shipbubble/quote
     * Fetch delivery rates for a shopping list
     */
    static async getDeliveryQuote(req: Request, res: Response) {
        try {
            const { shoppingListId, userAddressId } = req.body;

            if (!shoppingListId || !userAddressId) {
                throw new BadRequestError('Shopping list ID and user address ID are required');
            }

            // Get shopping list with items and market
            const shoppingList = await ShoppingList.findByPk(shoppingListId, {
                include: [
                    { model: ShoppingListItem, as: 'items' },
                    { model: Market, as: 'market' },
                ],
            });

            if (!shoppingList) {
                throw new NotFoundError('Shopping list not found');
            }

            if (!shoppingList.marketId) {
                throw new BadRequestError('Shopping list must have a market selected');
            }

            // Validate addresses and get codes
            const { senderAddressCode, receiverAddressCode } = await DeliveryShipBubbleController.getOrValidateAddressCodes(
                userAddressId,
                shoppingList.marketId
            );

            // Calculate package weight and dimensions
            const totalWeight = ShipBubbleService.calculatePackageWeight(
                shoppingList.items.map(item => ({
                    quantity: item.quantity,
                    unit: item.unit || undefined,
                }))
            );

            const dimensions = ShipBubbleService.getPackageDimensions(totalWeight);

            // Fetch rates from ShipBubble
            // Note: category_id is set by ShipBubbleService (environment-aware)
            const ratesResponse = await ShipBubbleService.fetchShippingRates({
                sender_address_code: senderAddressCode,
                reciever_address_code: receiverAddressCode,
                pickup_date: moment().add(1, 'day').format('YYYY-MM-DD'), // Tomorrow
                category_id: 0, // Will be overridden by ShipBubbleService based on environment
                package_items: shoppingList.items.map(item => ({
                    name: item.name || 'Grocery Item',
                    description: item.notes || 'Food item',
                    unit_weight: (item.quantity || 1).toString(), // In KG as string per ShipBubble API docs
                    unit_amount: ((item.estimatedPrice || 1000)).toString(), // As string per ShipBubble API docs
                    quantity: (item.quantity || 1).toString(), // As string per ShipBubble API docs
                })),
                package_dimension: dimensions,
                delivery_instructions: 'Handle with care - food items',
            });

            // Get shopping list total for courier recommendation
            const itemsTotal = shoppingList.items.reduce((sum, item) => {
                return sum + ((item.estimatedPrice || 0) * (item.quantity || 1));
            }, 0);

            // Get courier selection settings from system settings
            const courierSettings = await SystemSettings.findOne({
                where: { key: SYSTEM_SETTING_KEYS.COURIER_SELECTION_SETTINGS, isActive: true },
            });

            const settings = courierSettings?.value?.value || {
                highValueThreshold: 50000,
                mediumValueThreshold: 20000,
                maxDeliveryCostPercentage: 5,
                prioritizeSpeed: false,
                autoSelectRecommended: false,
            };

            // Get smart courier recommendation
            const recommendation = ShipBubbleService.recommendCourier({
                couriers: ratesResponse.couriers,
                fastestCourier: ratesResponse.fastest_courier,
                cheapestCourier: ratesResponse.cheapest_courier,
                orderTotal: itemsTotal,
                systemSettings: settings,
            });

            // Store quote in database
            const quote = await DeliveryQuote.create({
                shopping_list_id: shoppingListId,
                request_token: ratesResponse.request_token,
                sender_address_code: senderAddressCode,
                receiver_address_code: receiverAddressCode,
                category_id: ratesResponse.categoryId || (process.env.SHIPBUBBLE_ENV === 'production' ? 69709726 : 2178251),
                package_weight: totalWeight,
                package_dimensions: dimensions,
                couriers: ratesResponse.couriers,
                status: 'quoted',
                expires_at: moment().add(24, 'hours').toDate(),
            });

            logger.info('[ShipBubble] Delivery quote created:', {
                quoteId: quote.id,
                couriersCount: ratesResponse.couriers.length,
                recommendedCourier: recommendation.recommended.courier_name,
            });

            res.json({
                success: true,
                data: {
                    quoteId: quote.id,
                    couriers: ratesResponse.couriers,
                    fastestCourier: ratesResponse.fastest_courier,
                    cheapestCourier: ratesResponse.cheapest_courier,
                    recommendedCourier: {
                        courier: recommendation.recommended,
                        reason: recommendation.reason,
                        score: recommendation.score,
                        analysis: recommendation.analysis,
                    },
                    expiresAt: quote.expires_at,
                    packageWeight: totalWeight,
                    packageDimensions: dimensions,
                    orderTotal: itemsTotal,
                },
            });
        } catch (error: any) {
            logger.error('[ShipBubble] Quote fetch error:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * POST /api/v1/delivery/shipbubble/select-courier
     * Customer selects a courier from the quote
     */
    static async selectCourier(req: Request, res: Response) {
        try {
            const { quoteId, serviceCode } = req.body;

            if (!quoteId || !serviceCode) {
                throw new BadRequestError('Quote ID and service code are required');
            }

            const quote = await DeliveryQuote.findByPk(quoteId);

            if (!quote) {
                throw new NotFoundError('Delivery quote not found');
            }

            // Check if quote expired
            if (new Date() > new Date(quote.expires_at)) {
                throw new BadRequestError('Delivery quote has expired. Please refresh.');
            }

            // Find selected courier
            const selectedCourier = quote.couriers.find(
                (c: any) => c.service_code === serviceCode
            );

            if (!selectedCourier) {
                throw new BadRequestError('Selected courier not found in quote');
            }

            // Update quote with selection
            await quote.update({
                selected_service_code: serviceCode,
                selected_courier_id: selectedCourier.courier_id, // Store courier_id for label creation
                selected_amount: selectedCourier.amount,
                status: 'selected',
            });

            logger.info('[ShipBubble] Courier selected:', {
                quoteId: quote.id,
                serviceCode,
                amount: selectedCourier.amount,
            });

            res.json({
                success: true,
                data: {
                    deliveryFee: selectedCourier.amount,
                    courierName: selectedCourier.courier_name,
                    estimatedDeliveryTime: selectedCourier.estimated_delivery_time,
                },
            });
        } catch (error: any) {
            logger.error('[ShipBubble] Courier selection error:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * POST /api/v1/delivery/shipbubble/create-label
     * Agent creates shipping label (called from "Request Delivery" button)
     * This should be called by the agent controller, not directly
     */
    static async createShippingLabel(req: Request, res: Response) {
        try {
            const { orderId } = req.body;
            const agentId = (req as any).user?.id;

            if (!orderId) {
                throw new BadRequestError('Order ID is required');
            }

            // Get order with delivery quote
            const order = await Order.findOne({
                where: { id: orderId, agentId },
            });

            if (!order) {
                throw new NotFoundError('Order not found or not assigned to this agent');
            }

            if (order.status !== 'shopping_completed') {
                throw new BadRequestError('Order must be in shopping_completed status');
            }

            // Get delivery quote
            const deliveryQuoteId = order.deliveryQuoteId;
            if (!deliveryQuoteId) {
                throw new BadRequestError('No delivery quote found for this order');
            }

            const quote = await DeliveryQuote.findByPk(deliveryQuoteId);
            if (!quote) {
                throw new NotFoundError('Delivery quote not found');
            }

            // Check if quote expired (24 hours)
            if (new Date() > new Date(quote.expires_at)) {
                logger.info('[ShipBubble] Quote expired, re-fetching rates');

                // Re-fetch rates with same parameters
                const shoppingList = await ShoppingList.findByPk(quote.shopping_list_id, {
                    include: [{ model: ShoppingListItem, as: 'items' }],
                });

                if (!shoppingList) {
                    throw new NotFoundError('Shopping list not found');
                }

                const totalWeight = ShipBubbleService.calculatePackageWeight(
                    shoppingList.items.map(item => ({ quantity: item.quantity, unit: item.unit || undefined }))
                );
                const dimensions = ShipBubbleService.getPackageDimensions(totalWeight);

                const newRates = await ShipBubbleService.fetchShippingRates({
                    sender_address_code: quote.sender_address_code,
                    reciever_address_code: quote.receiver_address_code,
                    pickup_date: moment().add(1, 'day').format('YYYY-MM-DD'),
                    category_id: quote.category_id,
                    package_items: shoppingList.items.map(item => ({
                        name: item.name || 'Grocery Item',
                        description: 'Food item',
                        unit_weight: (item.quantity || 1).toString(), // In KG as string per ShipBubble API docs
                        unit_amount: ((item.estimatedPrice || 1000)).toString(), // As string per ShipBubble API docs
                        quantity: (item.quantity || 1).toString(), // As string per ShipBubble API docs
                    })),
                    package_dimension: dimensions,
                });

                // Update quote
                await quote.update({
                    request_token: newRates.request_token,
                    couriers: newRates.couriers,
                    expires_at: moment().add(24, 'hours').toDate(),
                });
            }

            if (!quote.selected_service_code || !quote.selected_courier_id) {
                throw new BadRequestError('No courier selected for this order');
            }

            // Create shipping label
            const label = await ShipBubbleService.createShippingLabel({
                request_token: quote.request_token,
                service_code: quote.selected_service_code,
                courier_id: quote.selected_courier_id,
            });

            // Find selected courier to get courier_image
            const selectedCourier = quote.couriers.find(
                (c: any) => c.courier_id === quote.selected_courier_id
            );

            // Update order with ShipBubble tracking info
            await order.update({
                status: 'delivery',
                deliveryStartedAt: new Date(),
                deliveryMetadata: {
                    shipbubbleOrderId: label.order_id,
                    trackingNumber: label.tracking_number,
                    courierName: label.courier_name,
                    courierId: quote.selected_courier_id,
                    courierImage: selectedCourier?.courier_image || null,
                    courierServiceCode: quote.selected_service_code,
                    trackingUrl: label.tracking_url,
                    estimatedDeliveryDate: label.estimated_delivery_date,
                    deliveryStatus: 'pending_pickup',
                    labelUrl: label.label_url,
                },
            });

            // Update quote status
            await quote.update({ status: 'label_created' });

            logger.info('[ShipBubble] Shipping label created:', {
                orderId: order.id,
                trackingNumber: label.tracking_number,
            });

            res.json({
                success: true,
                message: 'Shipping label created successfully',
                data: {
                    trackingNumber: label.tracking_number,
                    trackingUrl: label.tracking_url,
                    courierName: label.courier_name,
                    estimatedDeliveryDate: label.estimated_delivery_date,
                    labelUrl: label.label_url,
                },
            });
        } catch (error: any) {
            logger.error('[ShipBubble] Label creation error:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * Helper: Get or validate address codes
     */
    private static async getOrValidateAddressCodes(
        userAddressId: string,
        marketId: string
    ): Promise<{ senderAddressCode: number; receiverAddressCode: number }> {
        // Get customer address with user info
        const userAddress = await UserAddress.findByPk(userAddressId, {
            include: [{ model: User, as: 'user' }],
        });
        if (!userAddress) {
            throw new NotFoundError('Customer address not found');
        }

        const user = (userAddress as any).user;
        if (!user) {
            throw new NotFoundError('User not found for address');
        }

        // Get market
        const market = await Market.findByPk(marketId);
        if (!market) {
            throw new NotFoundError('Market not found');
        }

        // Check cache for receiver
        const receiverHash = ShipBubbleService.calculateAddressHash(
            userAddress.address || userAddress.fullAddress,
            userAddress.city,
            userAddress.state
        );

        let receiverAddressCode: number;
        const cachedReceiver = await ShipBubbleAddress.findOne({
            where: { user_address_id: userAddressId, address_hash: receiverHash },
        });

        if (cachedReceiver) {
            receiverAddressCode = cachedReceiver.address_code;
        } else {
            const validated = await ShipBubbleService.validateAddress({
                name: `${user.firstName} ${user.lastName}`.trim() || 'Customer',
                email: user.email || 'customer@busy2shop.com',
                phone: user.phone || userAddress.contactPhone || '08012345678',
                address: userAddress.fullAddress || userAddress.address,
                city: userAddress.city,
                state: userAddress.state,
                country: userAddress.country || 'Nigeria',
            });

            await ShipBubbleAddress.create({
                user_address_id: userAddressId,
                address_code: validated.address_code,
                formatted_address: validated.formatted_address,
                address_hash: receiverHash,
                validation_date: new Date(),
            });

            receiverAddressCode = validated.address_code;
        }

        // Check cache for sender
        const marketLocation = typeof market.location === 'string'
            ? JSON.parse(market.location)
            : market.location;

        const senderHash = ShipBubbleService.calculateAddressHash(
            market.address,
            marketLocation.city || '',
            marketLocation.state || ''
        );

        let senderAddressCode: number;
        const cachedSender = await ShipBubbleAddress.findOne({
            where: { market_id: marketId, address_hash: senderHash },
        });

        if (cachedSender) {
            senderAddressCode = cachedSender.address_code;
        } else {
            const validated = await ShipBubbleService.validateAddress({
                name: market.name || 'Market',
                email: 'market@busy2shop.com',
                phone: market.phoneNumber || '08012345678',
                address: market.address,
                city: marketLocation.city || '',
                state: marketLocation.state || '',
                country: marketLocation.country || 'Nigeria',
            });

            await ShipBubbleAddress.create({
                market_id: marketId,
                address_code: validated.address_code,
                formatted_address: validated.formatted_address,
                address_hash: senderHash,
                validation_date: new Date(),
            });

            senderAddressCode = validated.address_code;
        }

        return { senderAddressCode, receiverAddressCode };
    }

    /**
     * GET /api/v1/delivery/shipbubble/wallet-balance
     * Get shipping wallet balance (Admin only)
     */
    static async getWalletBalance(req: Request, res: Response) {
        try {
            const walletData = await ShipBubbleService.getWalletBalance();

            res.json({
                success: true,
                data: walletData,
            });
        } catch (error: any) {
            logger.error('[ShipBubble] Get wallet balance error:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * POST /api/v1/delivery/shipbubble/fund-wallet
     * Request wallet funding (Admin only)
     */
    static async fundWallet(req: Request, res: Response) {
        try {
            const { amount } = req.body;

            if (!amount || amount <= 0) {
                throw new BadRequestError('Valid amount is required');
            }

            const fundingData = await ShipBubbleService.requestWalletFund(amount);

            res.json({
                success: true,
                data: fundingData,
            });
        } catch (error: any) {
            logger.error('[ShipBubble] Fund wallet error:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * GET /api/v1/delivery/shipbubble/shipments
     * Get all shipments (paginated)
     */
    static async getShipments(req: Request, res: Response) {
        try {
            const page = parseInt(req.query.page as string) || 1;
            const perPage = parseInt(req.query.perPage as string) || 20;

            const shipmentsData = await ShipBubbleService.getShipments(page, perPage);

            res.json({
                success: true,
                data: shipmentsData,
            });
        } catch (error: any) {
            logger.error('[ShipBubble] Get shipments error:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * GET /api/v1/delivery/shipbubble/shipments/:orderIds
     * Get multiple specific shipments
     */
    static async getMultipleShipments(req: Request, res: Response) {
        try {
            const { orderIds } = req.params;

            if (!orderIds) {
                throw new BadRequestError('Order IDs are required');
            }

            const shipmentsData = await ShipBubbleService.getMultipleShipments(orderIds);

            res.json({
                success: true,
                data: shipmentsData,
            });
        } catch (error: any) {
            logger.error('[ShipBubble] Get multiple shipments error:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * GET /api/v1/delivery/shipbubble/categories
     * Get package categories
     */
    static async getPackageCategories(req: Request, res: Response) {
        try {
            const categories = await ShipBubbleService.getPackageCategories();

            res.json({
                success: true,
                data: categories,
            });
        } catch (error: any) {
            logger.error('[ShipBubble] Get categories error:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * GET /api/v1/delivery/shipbubble/couriers
     * Get available couriers
     */
    static async getAvailableCouriers(req: Request, res: Response) {
        try {
            const couriers = await ShipBubbleService.getAvailableCouriers();

            res.json({
                success: true,
                data: couriers,
            });
        } catch (error: any) {
            logger.error('[ShipBubble] Get couriers error:', error);
            res.status(error.statusCode || 500).json({
                success: false,
                error: error.message,
            });
        }
    }

    /**
     * Handle ShipBubble webhook events for delivery status updates
     * This endpoint receives real-time updates about shipment status changes
     * NO AUTHENTICATION - ShipBubble sends webhooks without auth headers
     */
    static async handleWebhook(req: Request, res: Response) {
        try {
            const webhookData = req.body;

            logger.info('[ShipBubble Webhook] Received webhook:', {
                event: webhookData.event,
                orderId: webhookData.order_id,
                trackingNumber: webhookData.tracking_number,
            });

            // Validate webhook payload
            if (!webhookData.event || !webhookData.order_id) {
                logger.warn('[ShipBubble Webhook] Invalid webhook payload - missing required fields');
                return res.status(400).json({
                    success: false,
                    error: 'Invalid webhook payload',
                });
            }

            // Find order by ShipBubble order_id stored in deliveryMetadata
            const order = await Order.findOne({
                where: {
                    deliveryMetadata: {
                        shipbubbleOrderId: webhookData.order_id,
                    },
                },
            });

            if (!order) {
                logger.warn('[ShipBubble Webhook] Order not found for ShipBubble order_id:', webhookData.order_id);
                // Return 200 to prevent ShipBubble from retrying
                return res.status(200).json({
                    success: true,
                    message: 'Order not found, but acknowledged',
                });
            }

            // Map ShipBubble events to our delivery status
            const eventToStatus: Record<string, string> = {
                'shipment.created': 'label_created',
                'shipment.picked_up': 'picked_up',
                'shipment.in_transit': 'in_transit',
                'shipment.out_for_delivery': 'out_for_delivery',
                'shipment.delivered': 'delivered',
                'shipment.failed': 'failed',
                'shipment.cancelled': 'cancelled',
                'shipment.returned': 'returned',
            };

            const deliveryStatus = eventToStatus[webhookData.event] || 'unknown';

            // Update order delivery metadata
            const updatedMetadata = {
                ...order.deliveryMetadata,
                deliveryStatus,
                lastWebhookEvent: webhookData.event,
                lastWebhookTimestamp: new Date().toISOString(),
                webhookData: {
                    event: webhookData.event,
                    status: webhookData.status,
                    message: webhookData.message,
                    location: webhookData.location,
                    updatedAt: webhookData.updated_at,
                },
            };

            await order.update({
                deliveryMetadata: updatedMetadata,
            });

            // If delivered, mark order as completed
            if (deliveryStatus === 'delivered') {
                await order.update({
                    status: 'completed',
                    completedAt: new Date(),
                });

                logger.info('[ShipBubble Webhook] Order completed and marked as delivered:', {
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                });
            }

            // If failed or cancelled, log error
            if (deliveryStatus === 'failed' || deliveryStatus === 'cancelled') {
                logger.error('[ShipBubble Webhook] Delivery failed or cancelled:', {
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    event: webhookData.event,
                    message: webhookData.message,
                });
            }

            logger.info('[ShipBubble Webhook] Order updated successfully:', {
                orderId: order.id,
                orderNumber: order.orderNumber,
                deliveryStatus,
            });

            // Send success response to ShipBubble
            return res.status(200).json({
                success: true,
                message: 'Webhook processed successfully',
            });
        } catch (error: any) {
            logger.error('[ShipBubble Webhook] Error processing webhook:', {
                error: error.message,
                stack: error.stack,
            });

            // Return 200 even on error to prevent ShipBubble from retrying
            // Log the error for investigation
            return res.status(200).json({
                success: false,
                error: 'Internal server error',
                message: 'Webhook received but processing failed',
            });
        }
    }
}
