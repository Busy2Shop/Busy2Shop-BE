import { Queue, Worker } from 'bullmq';
import moment from 'moment';
import db from '../../models';
import { connection } from './connection';
import mailTemplates from '../utils/mailservice/mailTemplates';
import { bullBoard } from './bullboard';
import type express from 'express';
import { logger } from '../utils/logger';
import { fetchAssetsStats, saveAssetStats } from '../services/assets/assetStats';
import { fetchProductsStats, saveProductStats } from '../services/products/productStats';
import type { TenantInvoices } from '../../interface/Attributes';

const { TenantSubscription, Plan, TenantInvoice } = db;
const {
    subscriptionRenewalEmail,
    paymentReminderEmail,
    subscriptionExpiredEmail,
    paymentSuccessEmail,
} = mailTemplates;

// Queue Names
const INVOICE_QUEUE = 'invoice-processing';
const SUBSCRIPTION_QUEUE = 'subscription-management';
const BILLING_QUEUE = 'billing-processing';
const PAYMENT_SUCCESS_QUEUE = 'payment-success';
const PRODUCT_STATS_QUEUE = 'product-stats-processing';
const ASSET_STATS_QUEUE = 'asset-stats-processing';

// Queue Definitions
export const invoiceQueue = new Queue(INVOICE_QUEUE, { connection });
export const subscriptionQueue = new Queue(SUBSCRIPTION_QUEUE, { connection });
export const billingQueue = new Queue(BILLING_QUEUE, { connection });
export const paymentSuccessQueue = new Queue(PAYMENT_SUCCESS_QUEUE, { connection });
export const productStatsQueue = new Queue(PRODUCT_STATS_QUEUE, { connection });
export const assetStatsQueue = new Queue(ASSET_STATS_QUEUE, { connection });

// Helper function to generate scheduler IDs
export const getSchedulerId = (type: string, subscriptionId: string): string => {
    return `${type}-scheduler-${subscriptionId}`;
};
// Worker Processors
const invoiceWorker = new Worker(
    INVOICE_QUEUE,
    async job => {
        logger.info('starting invoice worker');
        const { subscriptionId, invoiceId } = job.data;

        const subscription = await TenantSubscription.findByPk(subscriptionId, {
            include: [{ model: Plan }],
        });

        if (!subscription || subscription.status !== 'active') {
            throw new Error('Invalid or inactive subscription');
        }

        // Get the invoice if ID is provided
        let invoice: TenantInvoices | null = null;
        if (invoiceId) {
            invoice = await TenantInvoice.findByPk(invoiceId);
            if (!invoice) {
                throw new Error('Invoice not found');
            }
        }

        // Send subscription renewal email using invoice details if available
        await subscriptionRenewalEmail(
            subscription.billingDetails?.email,
            subscription.billingDetails?.firstName || 'Valued Customer',
            {
                subscriptionName: subscription.name,
                renewalDate: moment(subscription.endDate).format('MMMM DD, YYYY'),
                amount: invoice ? Number(invoice.amount) : Number(subscription.Plan.price),
                planName: subscription.Plan.name,
                billingPeriod: subscription.Plan.billingPeriod,
            },
        );

        // Schedule payment reminder if we have an invoice
        if (invoice) {
            await billingQueue.add(
                'payment-reminder',
                {
                    subscriptionId,
                    invoiceId: invoice.id,
                },
                {
                    delay: moment(invoice.dueDate).subtract(2, 'days').diff(moment()),
                },
            );
        }

        logger.info('invoice worker completed');
    },
    { connection },
);

const subscriptionWorker = new Worker(
    SUBSCRIPTION_QUEUE,
    async job => {
        logger.info('starting subscription worker');
        const { subscriptionId } = job.data;

        const subscription = await TenantSubscription.findByPk(subscriptionId, {
            include: [{ model: Plan }],
        });
        if (!subscription) return;

        const endDate = moment(subscription.endDate);
        const today = moment();

        if (subscription.status === 'active' && subscription.autoRenew) {
            logger.info('checking subscription renewal for active subscription');
            if (endDate.diff(today, 'days') >= 7) {
                // Renewal due in 7 days
                // Schedule invoice generation
                await invoiceQueue.add(
                    'generate-invoice',
                    {
                        subscriptionId,
                    },
                    {
                        attempts: 3,
                        backoff: {
                            type: 'exponential',
                            delay: 1000,
                        },
                    },
                );

                // Send expiration notification
                await subscriptionExpiredEmail(
                    subscription.billingDetails?.email,
                    subscription.billingDetails?.firstName || 'Valued Customer',
                    {
                        subscriptionName: subscription.name,
                        planName: subscription.Plan.name,
                    },
                );
            }
        } else if (endDate.isSameOrBefore(today)) {
            logger.info('updating expired subscription');
            await subscription.update({
                status: 'expired',
                enabled: false,
            });
        }
        logger.info('subscription worker completed');
    },
    { connection },
);

const billingWorker = new Worker(
    BILLING_QUEUE,
    async job => {
        const { invoiceId } = job.data;

        const invoice = await TenantInvoice.findOne({
            where: { id: invoiceId },
            include: [
                {
                    model: TenantSubscription,
                    include: [{ model: Plan }],
                },
            ],
        });

        if (!invoice || invoice.status !== 'pending') return;

        // Send payment reminder
        await paymentReminderEmail(
            invoice.TenantSubscription.billingDetails?.email,
            invoice.TenantSubscription.billingDetails?.firstName || 'Valued Customer',
            {
                amount: Number(invoice.amount),
                dueDate: moment(invoice.dueDate).format('MMMM DD, YYYY'),
                downloadUrl: invoice.metadata?.downloadUrl,
                planName: invoice.TenantSubscription.Plan.name,
            },
        );
    },
    { connection },
);

const paymentSuccessWorker = new Worker(
    'payment-success',
    async job => {
        const { invoiceId } = job.data;

        try {
            const invoice = await TenantInvoice.findOne({
                where: { id: invoiceId },
                include: [
                    {
                        model: TenantSubscription,
                        include: [{ model: Plan }],
                    },
                ],
            });

            if (!invoice) return;

            await paymentSuccessEmail(
                invoice.TenantSubscription.billingDetails?.email,
                invoice.TenantSubscription.billingDetails?.firstName || 'Valued Customer',
                {
                    amount: Number(invoice.amount),
                    planName: invoice.TenantSubscription.Plan.name,
                    nextBillingDate: moment(invoice.TenantSubscription.endDate).format(
                        'MMMM DD, YYYY',
                    ),
                    invoiceUrl: invoice.metadata?.downloadUrl,
                },
            );

            // Update invoice status
            await invoice.update({ status: 'paid', paidDate: new Date() });
        } catch (error) {
            console.error('Payment success notification failed:', error);
            throw error;
        }
    },
    { connection },
);

const productStatsWorker = new Worker(
    PRODUCT_STATS_QUEUE,
    async job => {
        logger.info('Starting product stats worker');
        const { tenantId, productIds } = job.data;

        try {
            // Ensure productIds is always an array
            const productIdsArray = Array.isArray(productIds) ? productIds : [productIds];

            logger.info(`Processing stats for ${productIdsArray.length} products`);
            const productsStats = await fetchProductsStats(tenantId, productIdsArray);
            await saveProductStats(tenantId, productsStats);
            logger.info(
                `Product stats processed successfully for ${productIdsArray.length} products`,
            );
        } catch (error) {
            logger.error('Error processing product stats for batch:', error);
            throw error; // Rethrowing to trigger retry mechanism
        }
    },
    {
        connection,
        limiter: {
            max: 10, // Process max 10 jobs per
            duration: 1000, // per second
        },
    },
);

const assetStatsWorker = new Worker(
    ASSET_STATS_QUEUE,
    async job => {
        logger.info('Starting asset stats worker');
        const { tenantId, assetIds } = job.data;

        try {
            // Ensure assetIds is always an array
            const assetIdsArray = Array.isArray(assetIds) ? assetIds : [assetIds];

            logger.info(`Processing stats for ${assetIdsArray.length} assets`);
            const assetsStats = await fetchAssetsStats(tenantId, assetIdsArray, undefined);
            await saveAssetStats(tenantId, assetsStats);
            logger.info(`Asset stats processed successfully for ${assetIdsArray.length} assets`);
        } catch (error) {
            logger.error('Error processing asset stats for batch:', error);
            throw error; // Rethrowing to trigger retry mechanism
        }
    },
    {
        connection,
        limiter: {
            max: 10, // Process max 10 jobs per
            duration: 1000, // per second
        },
    },
);

// Error Handling
const workers = [invoiceWorker, subscriptionWorker, billingWorker, paymentSuccessWorker];

// Use for...of loop instead of forEach
for (const worker of workers) {
    worker.on('failed', async (job, error) => {
        if (job) {
            console.error(`${job.queueName} job ${job.id} failed:`, error);

            // Retry logic for failed jobs
            if (job.attemptsMade < 3) {
                logger.info(
                    `Retrying ${job.queueName} job ${job.id}. Attempt ${job.attemptsMade + 1} of 3`,
                );
                return;
            }
        }
    });
    worker.on('error', err => {
        console.error('Worker error:', err);
    });
}

// Initialize recurring jobs
export const initializeRecurringJobs = async (app: express.Application) => {
    try {
        // Daily subscription checks
        const activeSubscriptions = await TenantSubscription.findAll({
            where: { status: 'active' },
            attributes: [
                'TenantId',
                'id',
                'PlanCode',
                'name',
                'type',
                'startDate',
                'endDate',
                'status',
                'autoRenew',
                'billingDetails',
                'createdAt',
                'updatedAt',
            ],
            include: [
                {
                    model: Plan,
                    attributes: ['id', 'name', 'code', 'price', 'billingPeriod', 'features'],
                },
            ],
        });

        for (const subscription of activeSubscriptions) {
            await subscriptionQueue.upsertJobScheduler(
                getSchedulerId('subscription-check', subscription.id),
                {
                    pattern: '0 0 * * *', // Daily at midnight
                },
                {
                    name: 'check-renewal',
                    data: { subscriptionId: subscription.id },
                    opts: { attempts: 3 },
                },
            );
        }

        logger.info('✅ Recurring jobs and Bull Board initialized successfully');
        // Initialize Bull Board
        bullBoard.initialize({
            invoiceQueue,
            subscriptionQueue,
            billingQueue,
            paymentSuccessQueue,
            productStatsQueue,
            assetStatsQueue,
        });

        // Mount Bull Board routes
        bullBoard.mount(app);
    } catch (error) {
        console.error('Failed to initialize recurring jobs and Bull Board:', error);
        throw error;
    }
};

export default {
    queues: {
        invoiceQueue,
        subscriptionQueue,
        billingQueue,
        paymentSuccessQueue,
        productStatsQueue,
        assetStatsQueue,
    },
    workers: {
        invoiceWorker,
        subscriptionWorker,
        billingWorker,
        paymentSuccessWorker,
        productStatsWorker,
        assetStatsWorker,
    },
    initializeRecurringJobs,
};
