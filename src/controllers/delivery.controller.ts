// src/controllers/delivery.controller.ts
import { Request, Response } from 'express';
import { kwikDeliveryService } from '../services/kwikDelivery.service';
import Order from '../models/order.model';
import User from '../models/user.model';
import { logger } from '../utils/logger';
import { BadRequestError } from '../utils/customErrors';

class DeliveryController {
    /**
     * Request delivery for an order
     * POST /api/v1/delivery/request
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
                        attributes: ['firstName', 'lastName', 'phone'],
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

            // Authenticate with Kwik API (in production, store credentials securely)
            await kwikDeliveryService.authenticate({
                domain: process.env.KWIK_DOMAIN || 'busy2shop',
                environment: process.env.KWIK_ENVIRONMENT || 'production',
                email: process.env.KWIK_EMAIL || '',
                password: process.env.KWIK_PASSWORD || '',
            });

            // Create delivery request
            const deliveryRequest = {
                pickup_address: {
                    latitude: 6.5244, // Default pickup location (should be from system settings)
                    longitude: 3.3792,
                    address: process.env.PICKUP_ADDRESS || 'ShopRite Ikeja City Mall, Lagos',
                },
                delivery_address: {
                    latitude: deliveryAddress.latitude,
                    longitude: deliveryAddress.longitude,
                    address: `${deliveryAddress.street}, ${deliveryAddress.city}`,
                },
                customer_details: {
                    name: `${customer.firstName} ${customer.lastName}`,
                    phone: `${customerPhone.countryCode}${customerPhone.number}`,
                },
                order_details: {
                    order_number: order.orderNumber,
                    total_amount: typeof order.totalAmount === 'string' 
                        ? parseFloat(order.totalAmount) 
                        : order.totalAmount,
                    delivery_fee: typeof order.deliveryFee === 'string'
                        ? parseFloat(order.deliveryFee)
                        : order.deliveryFee,
                    payment_method: 'prepaid' as const,
                },
                vehicle_type: 'bike' as const,
                delivery_instructions: `Busy2Shop Order ${order.orderNumber}. Customer: ${customer.firstName} ${customer.lastName}`,
            };

            // Validate addresses
            if (!kwikDeliveryService.validateAddresses(
                deliveryRequest.pickup_address,
                deliveryRequest.delivery_address
            )) {
                res.status(400).json({
                    status: 'error',
                    message: 'Invalid pickup or delivery address',
                });
                return;
            }

            // Create delivery request
            const deliveryResponse = await kwikDeliveryService.createDeliveryRequest(deliveryRequest);

            if (deliveryResponse.status === 'success') {
                // Update order with delivery information
                await order.update({
                    agentNotes: `Kwik Delivery: ${deliveryResponse.task_id}, ETA: ${deliveryResponse.estimated_delivery_time}`,
                    deliveryStartedAt: new Date(),
                });

                // Log the delivery request
                logger.info('Delivery request created successfully', {
                    orderId,
                    taskId: deliveryResponse.task_id,
                    agentId,
                });

                res.status(200).json({
                    status: 'success',
                    message: 'Delivery requested successfully',
                    data: {
                        taskId: deliveryResponse.task_id,
                        estimatedTime: deliveryResponse.estimated_delivery_time,
                        riderDetails: deliveryResponse.rider_details,
                        trackingUrl: deliveryResponse.tracking_url,
                    },
                });
            } else {
                logger.error('Delivery request failed', {
                    orderId,
                    error: deliveryResponse.error_message,
                });

                res.status(500).json({
                    status: 'error',
                    message: 'Failed to request delivery',
                    data: {
                        error: deliveryResponse.error_message,
                    },
                });
            }

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

            // Authenticate with Kwik API
            await kwikDeliveryService.authenticate({
                domain: process.env.KWIK_DOMAIN || 'busy2shop',
                environment: process.env.KWIK_ENVIRONMENT || 'production',
                email: process.env.KWIK_EMAIL || '',
                password: process.env.KWIK_PASSWORD || '',
            });

            const trackingData = await kwikDeliveryService.trackDelivery(taskId);

            res.status(200).json({
                status: 'success',
                message: 'Delivery tracking data retrieved',
                data: trackingData,
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
     */
    async getDeliveryEstimate(req: Request, res: Response): Promise<void> {
        try {
            const { pickupLatitude, pickupLongitude, deliveryLatitude, deliveryLongitude, vehicleType } = req.body;

            if (!pickupLatitude || !pickupLongitude || !deliveryLatitude || !deliveryLongitude) {
                res.status(400).json({
                    status: 'error',
                    message: 'Pickup and delivery coordinates are required',
                });
                return;
            }

            const pickup = {
                latitude: pickupLatitude,
                longitude: pickupLongitude,
                address: 'Pickup Location',
            };

            const delivery = {
                latitude: deliveryLatitude,
                longitude: deliveryLongitude,
                address: 'Delivery Location',
            };

            // Calculate distance (Haversine formula)
            const distance = this.calculateDistance(
                pickupLatitude,
                pickupLongitude,
                deliveryLatitude,
                deliveryLongitude
            );

            // Calculate delivery fee
            const deliveryFee = kwikDeliveryService.calculateDeliveryFee(distance);

            try {
                // Authenticate and get real estimate from Kwik
                await kwikDeliveryService.authenticate({
                    domain: process.env.KWIK_DOMAIN || 'busy2shop',
                    environment: process.env.KWIK_ENVIRONMENT || 'production',
                    email: process.env.KWIK_EMAIL || '',
                    password: process.env.KWIK_PASSWORD || '',
                });

                const kwikEstimate = await kwikDeliveryService.getDeliveryEstimate(pickup, delivery, vehicleType);

                res.status(200).json({
                    status: 'success',
                    message: 'Delivery estimate calculated',
                    data: {
                        distance: distance.toFixed(2),
                        estimatedFee: deliveryFee,
                        estimatedTime: kwikEstimate.estimated_time || '45-60 minutes',
                        kwikEstimate: kwikEstimate,
                    },
                });

            } catch (kwikError) {
                // Fallback to local calculation if Kwik API fails
                logger.warn('Kwik API estimate failed, using local calculation:', kwikError);

                res.status(200).json({
                    status: 'success',
                    message: 'Delivery estimate calculated (local)',
                    data: {
                        distance: distance.toFixed(2),
                        estimatedFee: deliveryFee,
                        estimatedTime: distance < 5 ? '30-45 minutes' : '45-60 minutes',
                        note: 'Estimate based on local calculation',
                    },
                });
            }

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

            // Authenticate with Kwik API
            await kwikDeliveryService.authenticate({
                domain: process.env.KWIK_DOMAIN || 'busy2shop',
                environment: process.env.KWIK_ENVIRONMENT || 'production',
                email: process.env.KWIK_EMAIL || '',
                password: process.env.KWIK_PASSWORD || '',
            });

            const cancelled = await kwikDeliveryService.cancelDelivery(taskId, reason);

            if (cancelled) {
                logger.info('Delivery cancelled successfully', {
                    taskId,
                    reason,
                    agentId,
                });

                res.status(200).json({
                    status: 'success',
                    message: 'Delivery cancelled successfully',
                });
            } else {
                res.status(500).json({
                    status: 'error',
                    message: 'Failed to cancel delivery',
                });
            }

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

    private toRadians(degrees: number): number {
        return degrees * (Math.PI / 180);
    }
}

export default new DeliveryController();