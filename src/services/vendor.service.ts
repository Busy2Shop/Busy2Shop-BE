/* eslint-disable @typescript-eslint/no-explicit-any */
import { Transaction, Op, FindAndCountOptions } from 'sequelize';
import User from '../models/user.model';
import UserSettings from '../models/userSettings.model';
import Market from '../models/market.model';
import ShoppingList from '../models/shoppingList.model';
import Order from '../models/order.model';
import { NotFoundError, BadRequestError } from '../utils/customErrors';
import Pagination, { IPaging } from '../utils/pagination';
import { Database } from 'models';

export interface IViewVendorsQuery {
    page?: number;
    size?: number;
    q?: string; // Search query
    isActive?: boolean;
    lat?: number; // Latitude for location-based search
    lng?: number; // Longitude for location-based search
    distance?: number; // Distance in kilometers
}

export default class VendorService {
    static async getVendors(queryData?: IViewVendorsQuery): Promise<{ vendors: User[], count: number, totalPages?: number }> {
        const { page, size, q: query, isActive } = queryData || {};

        const where: any = {
            'status.userType': 'vendor',
        };

        // Handle search query
        if (query) {
            where[Op.or as unknown as string] = [
                { firstName: { [Op.iLike]: `%${query}%` } },
                { lastName: { [Op.iLike]: `%${query}%` } },
                { email: { [Op.iLike]: `%${query}%` } },
            ];
        }

        const settingsWhere: Record<string, unknown> = {};

        // Filter by active status
        if (isActive !== undefined) {
            settingsWhere.isDeactivated = !isActive;
        }

        // Basic query options
        const queryOptions: FindAndCountOptions<User> = {
            where,
            include: [
                {
                    model: UserSettings,
                    as: 'settings',
                    where: settingsWhere,
                },
            ],
        };

        // Handle pagination
        if (page && size && page > 0 && size > 0) {
            const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);
            queryOptions.limit = limit || 0;
            queryOptions.offset = offset || 0;
        }

        const { rows: vendors, count } = await User.findAndCountAll(queryOptions);

        // Calculate pagination metadata if applicable
        if (page && size && vendors.length > 0) {
            const totalPages = Pagination.estimateTotalPage({ count, limit: size } as IPaging);
            return { vendors, count, ...totalPages };
        } else {
            return { vendors, count };
        }
    }

    static async getVendorById(id: string): Promise<User> {
        const vendor = await User.findOne({
            where: {
                id,
                'status.userType': 'vendor',
            },
            include: [
                {
                    model: UserSettings,
                    as: 'settings',
                },
                {
                    model: Market,
                    as: 'ownedMarkets',
                },
            ],
        });

        if (!vendor) {
            throw new NotFoundError('Vendor not found');
        }

        return vendor;
    }

    static async getVendorStats(vendorId: string): Promise<{
        totalOrders: number;
        completedOrders: number;
        cancelledOrders: number;
        pendingOrders: number;
        totalMarkets: number;
    }> {
        // Get count of different order statuses
        const totalOrders = await Order.count({
            where: { vendorId },
        });

        const completedOrders = await Order.count({
            where: {
                vendorId,
                status: 'completed',
            },
        });

        const cancelledOrders = await Order.count({
            where: {
                vendorId,
                status: 'cancelled',
            },
        });

        const pendingOrders = await Order.count({
            where: {
                vendorId,
                status: {
                    [Op.in]: ['pending', 'accepted', 'in_progress'],
                },
            },
        });

        // Get count of markets owned by vendor
        const totalMarkets = await Market.count({
            where: { ownerId: vendorId },
        });

        return {
            totalOrders,
            completedOrders,
            cancelledOrders,
            pendingOrders,
            totalMarkets,
        };
    }

    static async getNearbyVendors(latitude: number, longitude: number, distance: number = 5, queryData?: IViewVendorsQuery): Promise<{ vendors: User[], count: number, totalPages?: number }> {
        // TODO: Implement geospatial search with PostGIS or similar
        // This is a placeholder implementation. In a real application, you'd use
        // a geospatial query to find vendors within a certain distance.
        console.log(`Searching for vendors near ${latitude}, ${longitude} within ${distance}km`);

        // For now, return all vendors
        return await this.getVendors(queryData);
    }

    static async getAvailableVendorsForOrder(shoppingListId: string): Promise<User[]> {
        // Get the shopping list to find its location
        const shoppingList = await ShoppingList.findByPk(shoppingListId, {
            include: [
                {
                    model: Market,
                    as: 'market',
                },
            ],
        });

        if (!shoppingList || !shoppingList.market) {
            throw new NotFoundError('Shopping list or market not found');
        }

        // const market = shoppingList.market;

        // Find active vendors (not blocked or deactivated)
        const vendors = await User.findAll({
            where: {
                'status.userType': 'vendor',
                'status.activated': true,
                'status.emailVerified': true,
            },
            include: [
                {
                    model: UserSettings,
                    as: 'settings',
                    where: {
                        isBlocked: false,
                        isDeactivated: false,
                    },
                },
            ],
        });

        // In a real application, you would filter vendors based on:
        // 1. Distance to the market
        // 2. Vendor availability/schedule
        // 3. Vendor rating/performance
        // 4. Vendor specialization (if relevant)

        return vendors;
    }

    static async assignOrderToVendor(orderId: string, vendorId: string): Promise<Order> {
        return Database.transaction(async (transaction: Transaction) => {
            // Get the order
            const order = await Order.findByPk(orderId, { transaction });

            if (!order) {
                throw new NotFoundError('Order not found');
            }

            if (order.status !== 'pending') {
                throw new BadRequestError('Can only assign pending orders to vendors');
            }

            // Verify the vendor exists and is active
            const vendor = await User.findOne({
                where: {
                    id: vendorId,
                    'status.userType': 'vendor',
                    'status.activated': true,
                    'status.emailVerified': true,
                },
                include: [
                    {
                        model: UserSettings,
                        as: 'settings',
                        where: {
                            isBlocked: false,
                            isDeactivated: false,
                        },
                    },
                ],
                transaction,
            });

            if (!vendor) {
                throw new NotFoundError('Vendor not found or is inactive');
            }

            // Update the order
            await order.update({
                vendorId,
                status: 'accepted',
                acceptedAt: new Date(),
            }, { transaction });

            // Also update the shopping list
            await ShoppingList.update(
                {
                    vendorId,
                    status: 'accepted',
                },
                {
                    where: { id: order.shoppingListId },
                    transaction,
                }
            );

            return order;
        });
    }
}