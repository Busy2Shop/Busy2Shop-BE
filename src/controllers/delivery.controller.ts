// src/controllers/delivery.controller.ts
import { Request, Response } from 'express';
import Order from '../models/order.model';
import User from '../models/user.model';
import { logger } from '../utils/logger';
import { BadRequestError } from '../utils/customErrors';

/**
 * Delivery Controller
 * Handles delivery requests for orders (ready for ShipBubble integration)
 *
 * Note: This controller is provider-agnostic and ready to integrate with ShipBubble API
 */
class DeliveryController {
    /**
     * Request delivery for an order
     * POST /api/v1/delivery/request
     *
     * TODO: Integrate with ShipBubble API
     * - Validate sender and receiver addresses
     * - Fetch shipping rates from multiple couriers
     * - Create shipping label with selected courier
     * - Store shipment details in order
     */
    async requestDelivery(req: Request, res: Response): Promise<void> {
        try {
            const { orderId } = req.body;
            const agentId = (req as any).user?.id;

            if (!orderId) {
                res.status(400).json({
                    status: 'error',
                    message: 'Order ID is required',
                });
                return;
            }

            // Get order details
            const order = await Order.findOne({
                where: {
                    id: orderId,
                    agentId: agentId,
                },
                include: [
                    {
                        model: User,
                        as: 'customer',
                        attributes: ['firstName', 'lastName', 'phone', 'email'],
                    },
                ],
            });

            if (!order) {
                res.status(404).json({
                    status: 'error',
                    message: 'Order not found or not assigned to this agent',
                });
                return;
            }

            if (order.status !== 'in_progress') {
                res.status(400).json({
                    status: 'error',
                    message: 'Order must be in progress to request delivery',
                });
                return;
            }

            const deliveryAddress = typeof order.deliveryAddress === 'string'
                ? JSON.parse(order.deliveryAddress)
                : order.deliveryAddress;
            const customer = order.customer as any;
            const customerPhone = JSON.parse(customer.phone);

            // TODO: ShipBubble Integration Steps:
            // 1. Validate customer address using ShipBubble's /shipping/address/validate endpoint
            // 2. Get shipping rates using /shipping/fetch_rates endpoint
            // 3. Let customer/agent choose courier
            // 4. Create shipping label using /shipping/labels endpoint
            // 5. Store order_id from ShipBubble in order record

            // For now, return placeholder response
            logger.info('Delivery request initiated (pending ShipBubble integration)', {
                orderId,
                agentId,
                customerAddress: deliveryAddress,
            });

            res.status(200).json({
                status: 'success',
                message: 'Delivery integration pending - ShipBubble API will be integrated soon',
                data: {
                    orderId,
                    deliveryAddress,
                    customerDetails: {
                        name: `${customer.firstName} ${customer.lastName}`,
                        phone: `${customerPhone.countryCode}${customerPhone.number}`,
                        email: customer.email,
                    },
                    note: 'ShipBubble integration coming soon',
                },
            });

        } catch (error: any) {
            logger.error('Error requesting delivery:', error);
            res.status(500).json({
                status: 'error',
                message: 'Internal server error',
            });
        }
    }

    /**
     * Track delivery status
     * GET /api/v1/delivery/track/:taskId
     *
     * TODO: Integrate with ShipBubble API
     * - Use GET /shipping/labels/:order_id to get shipment status
     * - Return tracking URL, status, rider info, etc.
     */
    async trackDelivery(req: Request, res: Response): Promise<void> {
        try {
            const { taskId } = req.params;

            if (!taskId) {
                res.status(400).json({
                    status: 'error',
                    message: 'Task ID is required',
                });
                return;
            }

            // TODO: Call ShipBubble GET /shipping/labels/:order_id endpoint
            // Returns: status, tracking_url, courier info, package_status array, rider_info

            logger.info('Delivery tracking requested (pending ShipBubble integration)', {
                taskId,
            });

            res.status(200).json({
                status: 'success',
                message: 'Delivery tracking integration pending',
                data: {
                    taskId,
                    note: 'ShipBubble tracking integration coming soon',
                },
            });

        } catch (error: any) {
            logger.error('Error tracking delivery:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to track delivery',
            });
        }
    }

    /**
     * Get delivery estimate
     * POST /api/v1/delivery/estimate
     *
     * TODO: Integrate with ShipBubble API
     * - Validate both pickup and delivery addresses
     * - Call /shipping/fetch_rates to get rates from all couriers
     * - Return fastest_courier, cheapest_courier, and all available options
     */
    async getDeliveryEstimate(req: Request, res: Response): Promise<void> {
        try {
            const { pickupLatitude, pickupLongitude, deliveryLatitude, deliveryLongitude } = req.body;

            if (!pickupLatitude || !pickupLongitude || !deliveryLatitude || !deliveryLongitude) {
                res.status(400).json({
                    status: 'error',
                    message: 'Pickup and delivery coordinates are required',
                });
                return;
            }

            // Calculate distance (Haversine formula)
            const distance = this.calculateDistance(
                pickupLatitude,
                pickupLongitude,
                deliveryLatitude,
                deliveryLongitude
            );

            // Basic local calculation (fallback)
            const estimatedFee = this.calculateLocalDeliveryFee(distance);
            const estimatedTime = distance < 5 ? '30-45 minutes' : distance < 10 ? '45-60 minutes' : '60-90 minutes';

            // TODO: ShipBubble Integration:
            // 1. Validate addresses: POST /shipping/address/validate
            // 2. Get address_codes from validation response
            // 3. Fetch rates: POST /shipping/fetch_rates with address_codes
            // 4. Return fastest_courier, cheapest_courier, and all courier options

            logger.info('Delivery estimate requested (using local calculation)', {
                distance: distance.toFixed(2),
                estimatedFee,
            });

            res.status(200).json({
                status: 'success',
                message: 'Delivery estimate calculated (local)',
                data: {
                    distance: distance.toFixed(2),
                    estimatedFee,
                    estimatedTime,
                    note: 'ShipBubble multi-courier rates coming soon',
                },
            });

        } catch (error: any) {
            logger.error('Error calculating delivery estimate:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to calculate delivery estimate',
            });
        }
    }

    /**
     * Cancel delivery
     * POST /api/v1/delivery/cancel
     *
     * TODO: Integrate with ShipBubble API
     * - Call POST /shipping/labels/cancel/:order_id to cancel shipment
     */
    async cancelDelivery(req: Request, res: Response): Promise<void> {
        try {
            const { taskId, reason } = req.body;
            const agentId = (req as any).user?.id;

            if (!taskId || !reason) {
                res.status(400).json({
                    status: 'error',
                    message: 'Task ID and cancellation reason are required',
                });
                return;
            }

            // TODO: Call ShipBubble POST /shipping/labels/cancel/:order_id endpoint

            logger.info('Delivery cancellation requested (pending ShipBubble integration)', {
                taskId,
                reason,
                agentId,
            });

            res.status(200).json({
                status: 'success',
                message: 'Delivery cancellation integration pending',
                data: {
                    taskId,
                    reason,
                    note: 'ShipBubble cancellation integration coming soon',
                },
            });

        } catch (error: any) {
            logger.error('Error cancelling delivery:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to cancel delivery',
            });
        }
    }

    /**
     * Calculate distance between two points using Haversine formula
     * @returns Distance in kilometers
     */
    private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRadians(lat2 - lat1);
        const dLon = this.toRadians(lon2 - lon1);

        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Convert degrees to radians
     */
    private toRadians(degrees: number): number {
        return degrees * (Math.PI / 180);
    }

    /**
     * Calculate local delivery fee (fallback when ShipBubble is unavailable)
     * This is a simple calculation and should be replaced with ShipBubble rates
     */
    private calculateLocalDeliveryFee(distance: number, baseRate: number = 500, perKmRate: number = 100): number {
        const calculatedFee = baseRate + (distance * perKmRate);
        const minimumFee = 300;
        const maximumFee = 5000;

        return Math.min(Math.max(calculatedFee, minimumFee), maximumFee);
    }
}

export default new DeliveryController();
