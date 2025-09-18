import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../../middlewares/authMiddleware';
import PaystackService from '../../services/payment/paystack.service';
import OrderService from '../../services/order.service';
import ShoppingListService from '../../services/shoppingList.service';
import SystemSettingsService from '../../services/systemSettings.service';
import PaymentStatusSyncService from '../../services/paymentStatusSync.service';
import { BadRequestError, NotFoundError } from '../../utils/customErrors';
import { logger } from '../../utils/logger';
import ShoppingListItem from '../../models/shoppingListItem.model';

// Interface for calculated fees
interface CalculatedFees {
    subtotal: number;
    serviceFee: number;
    deliveryFee: number;
    discountAmount: number;
    total: number;
}

// Helper function to calculate fees
async function calculateOrderFees(
    subtotal: number | string,
    discountAmount: number = 0
): Promise<CalculatedFees> {
    // Ensure subtotal is a number
    const numericSubtotal = typeof subtotal === 'string' ? parseFloat(subtotal) : subtotal;

    if (isNaN(numericSubtotal) || numericSubtotal < 0) {
        throw new BadRequestError('Invalid subtotal amount');
    }

    // Ensure discount is a number
    const numericDiscount = typeof discountAmount === 'string' ? parseFloat(discountAmount) : (discountAmount || 0);
    const finalDiscount = isNaN(numericDiscount) ? 0 : Math.max(0, numericDiscount);

    // Get fees from system settings
    const serviceFee = await SystemSettingsService.calculateServiceFee(numericSubtotal);
    const deliveryFee = await SystemSettingsService.getDeliveryFee();

    // Calculate total ensuring all values are numbers
    const total = Math.max(0, numericSubtotal + serviceFee + deliveryFee - finalDiscount);

    return {
        subtotal: numericSubtotal,
        serviceFee: Math.round(serviceFee * 100) / 100,
        deliveryFee: Math.round(deliveryFee * 100) / 100,
        discountAmount: Math.round(finalDiscount * 100) / 100,
        total: Math.round(total * 100) / 100,
    };
}

export default class PaystackController {

    /**
     * Initialize Paystack payment for shopping list
     */
    static async initializeShoppingListPayment(req: AuthenticatedRequest, res: Response) {
        const { shoppingListId } = req.params;
        const { currency, deliveryAddress, customerNotes, discountAmount } = req.body;

        if (!shoppingListId) {
            throw new BadRequestError('Shopping list ID is required');
        }

        if (!deliveryAddress) {
            throw new BadRequestError('Delivery address is required');
        }

        try {
            // Get shopping list details
            const shoppingList = await ShoppingListService.getShoppingList(shoppingListId);

            if (!shoppingList) {
                throw new NotFoundError('Shopping list not found');
            }

            // Check if the shopping list belongs to the user
            if (shoppingList.customerId !== req.user.id) {
                throw new BadRequestError('You do not have access to this shopping list');
            }

            // Allow payment generation for draft status only
            if (shoppingList.status !== 'draft') {
                throw new BadRequestError(`This shopping list has already been processed (status: ${shoppingList.status})`);
            }

            // Check for existing order - follow same pattern as AlatPay
            const existingOrder = await OrderService.findOrderByShoppingListId(shoppingListId, req.user.id);

            if (existingOrder) {
                logger.info(`Found existing order ${existingOrder.orderNumber} for shopping list ${shoppingListId}`);

                // If payment is completed, return completed order details
                if (existingOrder.paymentStatus === 'completed') {
                    const freshOrder = await OrderService.getOrder(existingOrder.id, true, false);

                    res.status(200).json({
                        status: 'success',
                        message: 'Payment already completed for this order',
                        data: {
                            authorization_url: '',
                            access_code: '',
                            reference: freshOrder.paymentId || '',
                            orderId: freshOrder.id,
                            orderNumber: freshOrder.orderNumber,
                            amount: freshOrder.totalAmount,
                            amountInKobo: PaystackService.toKobo(freshOrder.totalAmount),
                            fees: {
                                subtotal: freshOrder.totalAmount - freshOrder.serviceFee - freshOrder.deliveryFee,
                                serviceFee: freshOrder.serviceFee,
                                deliveryFee: freshOrder.deliveryFee,
                                discountAmount: 0,
                                total: freshOrder.totalAmount,
                            },
                            publicKey: PaystackService.getPublicKey(),
                            isExistingOrder: true,
                            paymentCompleted: true,
                        },
                    });
                    return;
                }

                // Check if pending order is still valid
                if (existingOrder.paymentStatus === 'pending' && existingOrder.paymentId) {
                    const paymentTimeoutMinutes = await SystemSettingsService.getPaymentTimeout();
                    const orderAge = Date.now() - new Date(existingOrder.createdAt).getTime();
                    const timeoutMs = paymentTimeoutMinutes * 60 * 1000;

                    // Verify with Paystack for missed webhooks
                    let paystackStatus = null;
                    let shouldSync = false;

                    try {
                        logger.info(`Verifying existing order ${existingOrder.orderNumber} with Paystack`);
                        paystackStatus = await PaystackService.verifyTransaction(existingOrder.paymentId);

                        const isPaystackCompleted = paystackStatus?.data?.status === 'success';

                        if (isPaystackCompleted && existingOrder.paymentStatus === 'pending') {
                            logger.warn(`Payment completed but not synced! Order: ${existingOrder.orderNumber}`);
                            shouldSync = true;
                        }
                    } catch (verificationError) {
                        logger.warn('Failed to verify existing order with Paystack:', verificationError);
                    }

                    // Auto-sync if payment is completed on Paystack
                    if (shouldSync && paystackStatus) {
                        try {
                            logger.info(`Auto-syncing completed payment for order ${existingOrder.orderNumber}`);

                            const result = await PaymentStatusSyncService.confirmPayment(
                                existingOrder.id,
                                existingOrder.paymentId,
                                'api_sync',
                                req.user.id
                            );

                            if (result.success) {
                                const syncedOrder = await OrderService.getOrder(existingOrder.id, true, false);

                                logger.info(`Payment auto-synced successfully for order ${existingOrder.orderNumber}`);

                                res.status(200).json({
                                    status: 'success',
                                    message: 'Payment completed and synced',
                                    data: {
                                        authorization_url: '',
                                        access_code: '',
                                        reference: syncedOrder.paymentId,
                                        orderId: syncedOrder.id,
                                        orderNumber: syncedOrder.orderNumber,
                                        amount: syncedOrder.totalAmount,
                                        amountInKobo: PaystackService.toKobo(syncedOrder.totalAmount),
                                        fees: {
                                            subtotal: syncedOrder.totalAmount - syncedOrder.serviceFee - syncedOrder.deliveryFee,
                                            serviceFee: syncedOrder.serviceFee,
                                            deliveryFee: syncedOrder.deliveryFee,
                                            discountAmount: 0,
                                            total: syncedOrder.totalAmount,
                                        },
                                        publicKey: PaystackService.getPublicKey(),
                                        isExistingOrder: true,
                                        paymentCompleted: true,
                                        autoSynced: true,
                                    },
                                });
                                return;
                            } else {
                                logger.error(`Auto-sync failed for order ${existingOrder.orderNumber}:`, result.error);
                            }
                        } catch (syncError) {
                            logger.error(`Failed to auto-sync order ${existingOrder.orderNumber}:`, syncError);
                        }
                    }

                    if (orderAge < timeoutMs) {
                        // Return existing pending order - re-use existing Paystack reference
                        res.status(200).json({
                            status: 'success',
                            message: 'Existing pending payment found',
                            data: {
                                authorization_url: '', // Frontend will handle popup with existing reference
                                access_code: '',
                                reference: existingOrder.paymentId,
                                orderId: existingOrder.id,
                                orderNumber: existingOrder.orderNumber,
                                amount: existingOrder.totalAmount,
                                amountInKobo: PaystackService.toKobo(existingOrder.totalAmount),
                                fees: {
                                    subtotal: existingOrder.totalAmount - existingOrder.serviceFee - existingOrder.deliveryFee,
                                    serviceFee: existingOrder.serviceFee,
                                    deliveryFee: existingOrder.deliveryFee,
                                    discountAmount: 0,
                                    total: existingOrder.totalAmount,
                                },
                                publicKey: PaystackService.getPublicKey(),
                                isExistingOrder: true,
                                paymentCompleted: false,
                                paystackStatus: paystackStatus?.data?.status || 'not_checked',
                            },
                        });
                        return;
                    } else {
                        // Expire old pending order
                        await OrderService.updateOrderPaymentStatus(existingOrder.id, 'expired');
                        logger.info(`Expired old pending order ${existingOrder.orderNumber}`);
                    }
                }
            }

            // Calculate order totals
            const subtotal = shoppingList.estimatedTotal ||
                shoppingList.items.reduce((acc: number, item: ShoppingListItem) =>
                    acc + ((item as any).userSetPrice || (item as any).userProvidedPrice || item.estimatedPrice || 0) * item.quantity, 0);

            const calculatedFees = await calculateOrderFees(subtotal, discountAmount || 0);

            // Create new order
            const order = await OrderService.createOrder({
                customerId: req.user.id,
                shoppingListId: shoppingListId,
                totalAmount: calculatedFees.total,
                status: 'pending',
                paymentStatus: 'pending',
                serviceFee: calculatedFees.serviceFee,
                deliveryFee: calculatedFees.deliveryFee,
                deliveryAddress: deliveryAddress,
                customerNotes: customerNotes,
                paymentMethod: 'PAYSTACK',
            });

            // Generate unique reference
            const reference = PaystackService.generateReference(`busy2shop_${order.id}`);

            // Initialize Paystack transaction
            const paymentResponse = await PaystackService.initializeTransaction({
                email: req.user.email,
                amount: PaystackService.toKobo(calculatedFees.total),
                currency: currency || 'NGN',
                reference,
                metadata: {
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    customerId: req.user.id,
                    custom_fields: [
                        {
                            display_name: 'Customer Name',
                            variable_name: 'customer_name',
                            value: `${req.user.firstName} ${req.user.lastName}`,
                        },
                        {
                            display_name: 'Shopping List',
                            variable_name: 'shopping_list_name',
                            value: shoppingList.name,
                        },
                        {
                            display_name: 'Order Number',
                            variable_name: 'order_number',
                            value: order.orderNumber,
                        },
                    ],
                },
            });

            // Update order with payment reference
            await OrderService.updateOrderPaymentId(order.id, reference);

            logger.info(`Paystack payment initialized for order ${order.orderNumber}`, {
                reference,
                orderId: order.id,
                amount: calculatedFees.total,
                amountInKobo: PaystackService.toKobo(calculatedFees.total),
            });

            res.status(200).json({
                status: 'success',
                message: 'Paystack payment initialized successfully',
                data: {
                    authorization_url: paymentResponse.data.authorization_url,
                    access_code: paymentResponse.data.access_code,
                    reference: paymentResponse.data.reference,
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    amount: calculatedFees.total,
                    amountInKobo: PaystackService.toKobo(calculatedFees.total),
                    fees: calculatedFees,
                    publicKey: PaystackService.getPublicKey(),
                },
            });

        } catch (error) {
            logger.error('Error initializing Paystack payment:', error);
            throw error;
        }
    }

    /**
     * Verify Paystack payment
     */
    static async verifyPayment(req: AuthenticatedRequest, res: Response) {
        const { reference } = req.params;

        if (!reference) {
            throw new BadRequestError('Payment reference is required');
        }

        try {
            // Verify transaction with Paystack
            const verificationResponse = await PaystackService.verifyTransaction(reference);

            if (!verificationResponse.data || verificationResponse.data.status !== 'success') {
                res.status(400).json({
                    status: 'error',
                    message: 'Payment verification failed',
                    data: {
                        reference,
                        paymentStatus: verificationResponse.data?.status || 'failed',
                        gateway_response: verificationResponse.data?.gateway_response,
                    },
                });
                return;
            }

            // Find order by payment reference
            const order = await OrderService.getOrderByPaymentId(reference);

            if (!order) {
                throw new NotFoundError('Order not found for this payment reference');
            }

            // Check if user is authorized
            if (order.customerId !== req.user.id) {
                throw new BadRequestError('Not authorized to verify this payment');
            }

            // Check if payment is already confirmed
            if (order.paymentStatus === 'completed') {
                res.status(200).json({
                    status: 'success',
                    message: 'Payment already verified',
                    data: {
                        reference,
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        paymentStatus: order.paymentStatus,
                        amount: PaystackService.fromKobo(verificationResponse.data.amount),
                        alreadyProcessed: true,
                    },
                });
                return;
            }

            // Process payment confirmation using unified service - same as AlatPay
            const result = await PaymentStatusSyncService.confirmPayment(
                order.id,
                reference,
                'api_sync',
                req.user.id
            );

            if (result.success) {
                logger.info(`Paystack payment verified and confirmed for order ${order.orderNumber}`, {
                    reference,
                    assignedAgentId: result.assignedAgentId,
                });

                res.status(200).json({
                    status: 'success',
                    message: 'Payment verified and confirmed successfully',
                    data: {
                        reference,
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        paymentStatus: 'completed',
                        amount: PaystackService.fromKobo(verificationResponse.data.amount),
                        paidAt: verificationResponse.data.paid_at,
                        assignedAgentId: result.assignedAgentId,
                        gateway_response: verificationResponse.data.gateway_response,
                    },
                });
            } else {
                logger.error(`Failed to confirm Paystack payment for order ${order.orderNumber}:`, result.error);

                res.status(500).json({
                    status: 'error',
                    message: 'Payment verified but order confirmation failed',
                    data: {
                        reference,
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        error: result.error,
                    },
                });
            }

        } catch (error) {
            logger.error('Error verifying Paystack payment:', error);
            throw error;
        }
    }

    /**
     * Handle Paystack webhook
     */
    static async handleWebhook(req: Request, res: Response) {
        try {
            const signature = req.headers['x-paystack-signature'] as string;
            const payload = JSON.stringify(req.body);

            // Validate webhook signature
            if (!PaystackService.validateWebhookSignature(payload, signature)) {
                logger.warn('Invalid Paystack webhook signature');
                res.status(400).json({ status: 'error', message: 'Invalid signature' });
                return;
            }

            const event = req.body;
            const { event: eventType, data } = event;

            logger.info('Processing Paystack webhook', {
                eventType,
                reference: data.reference,
                status: data.status,
                amount: data.amount,
            });

            // Only process successful charge events
            if (eventType !== 'charge.success' || data.status !== 'success') {
                logger.info(`Paystack webhook ignored - Event: ${eventType}, Status: ${data.status}`);
                res.status(200).json({ status: 'success', message: 'Event acknowledged' });
                return;
            }

            // Find order by payment reference
            const order = await OrderService.getOrderByPaymentId(data.reference);

            if (!order) {
                logger.warn(`No order found for Paystack reference: ${data.reference}`);
                res.status(200).json({ status: 'success', message: 'Order not found' });
                return;
            }

            // Skip if already processed
            if (order.paymentStatus === 'completed') {
                logger.info(`Order ${order.orderNumber} already completed`);
                res.status(200).json({ status: 'success', message: 'Already processed' });
                return;
            }

            // Process payment confirmation - same as AlatPay
            const result = await PaymentStatusSyncService.confirmPayment(
                order.id,
                data.reference,
                'webhook',
                'system'
            );

            if (result.success) {
                logger.info(`Paystack webhook processed successfully for order ${order.orderNumber}`, {
                    assignedAgentId: result.assignedAgentId,
                });

                res.status(200).json({
                    status: 'success',
                    message: 'Payment confirmed',
                    data: {
                        orderId: order.id,
                        orderNumber: order.orderNumber,
                        assignedAgentId: result.assignedAgentId,
                    },
                });
                return;
            } else {
                logger.error(`Paystack webhook processing failed for order ${order.orderNumber}:`, result.error);
                res.status(200).json({ status: 'success', message: 'Processing failed' });
                return;
            }

        } catch (error) {
            logger.error('Paystack webhook processing error:', {
                error: error instanceof Error ? error.message : String(error),
                payload: req.body,
            });

            // Always return 200 to prevent webhook retries
            res.status(200).json({ status: 'success', message: 'Webhook received' });
        }
    }


    /**
     * Get basic payment status (simple version)
     */
    static async getPaymentStatus(req: AuthenticatedRequest, res: Response) {
        const { reference } = req.params;

        if (!reference) {
            throw new BadRequestError('Payment reference is required');
        }

        try {
            // Find order by payment reference
            const order = await OrderService.getOrderByPaymentId(reference);

            if (!order) {
                res.status(404).json({
                    status: 'error',
                    message: 'Order not found for this reference',
                    data: null,
                });
                return;
            }

            // Check authorization
            if (order.customerId !== req.user.id) {
                throw new BadRequestError('Not authorized to view this payment');
            }

            res.status(200).json({
                status: 'success',
                message: 'Payment status retrieved',
                data: {
                    reference,
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    paymentStatus: order.paymentStatus,
                    orderStatus: order.status,
                    amount: order.totalAmount,
                    paymentMethod: order.paymentMethod,
                    createdAt: order.createdAt,
                    paymentProcessedAt: order.paymentProcessedAt,
                },
            });

        } catch (error) {
            logger.error('Error getting Paystack payment status:', error);
            throw error;
        }
    }

    /**
     * Get Paystack public key for frontend
     */
    static async getPublicKey(req: Request, res: Response) {
        try {
            if (!PaystackService.isConfigured()) {
                throw new BadRequestError('Paystack not properly configured');
            }

            res.status(200).json({
                status: 'success',
                message: 'Paystack public key retrieved',
                data: {
                    publicKey: PaystackService.getPublicKey(),
                },
            });

        } catch (error) {
            logger.error('Error getting Paystack public key:', error);
            throw error;
        }
    }

    /**
     * Test endpoint for confirming payment - NO AUTH REQUIRED (for testing only)
     */
    static async testConfirmPayment(req: Request, res: Response) {
        const { orderId, reference, source, performedBy } = req.body;

        // Validate required fields
        if (!orderId) {
            return res.status(400).json({
                status: 'error',
                message: 'orderId is required',
            });
        }

        if (!reference) {
            return res.status(400).json({
                status: 'error',
                message: 'reference is required',
            });
        }

        // Set defaults for optional fields
        const confirmationSource = source || 'api_sync';
        const performedByUser = performedBy || 'test-user';

        logger.info('TEST: Confirming Paystack payment manually', {
            orderId,
            reference,
            source: confirmationSource,
            performedBy: performedByUser,
        });

        try {
            // Import and call the payment confirmation service
            const result = await PaymentStatusSyncService.confirmPayment(
                orderId,
                reference,
                confirmationSource,
                performedByUser
            );

            logger.info('TEST: Paystack payment confirmation successful', {
                orderId,
                reference,
                result,
            });

            res.status(200).json({
                status: 'success',
                message: 'Payment confirmed successfully',
                data: {
                    orderId,
                    reference,
                    assignedAgentId: result.assignedAgentId,
                    source: confirmationSource,
                    performedBy: performedByUser,
                    fullDetails: result,
                },
            });
        } catch (error) {
            logger.error('TEST: Paystack payment confirmation failed', {
                orderId,
                reference,
                error: error instanceof Error ? error.message : String(error),
            });

            res.status(500).json({
                status: 'error',
                message: 'Payment confirmation failed',
                data: {
                    orderId,
                    reference,
                    error: error instanceof Error ? error.message : String(error),
                },
            });
        }
    }
}