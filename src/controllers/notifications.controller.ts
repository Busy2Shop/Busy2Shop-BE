import { Response } from 'express';
import { BadRequestError } from '../utils/customErrors';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import NotificationService from '../services/notification.service';
import { INotification } from '../models/notification.model';
import { Database } from '../models';
import { Transaction } from 'sequelize';
import Pagination, { IPaging } from '../utils/pagination';

export default class NotificationController {
    static async listNotifications(req: AuthenticatedRequest, res: Response) {
        const profile = req.user;
        const { read, page, size } = req.query;

        // Check if the profile exists
        if (!profile) {
            throw new BadRequestError('Please complete your profile');
        }

        // Validate the 'read' query parameter
        if (read && read !== 'true' && read !== 'false') {
            throw new BadRequestError('Invalid read query parameter');
        }

        // Determine the read status or leave it undefined if not specified
        await Database.transaction(async (transaction: Transaction) => {
            let paginationQuery: { q?: string, page?: number, size?: number } = {
                ...(read && { q: read }),
            };
            let paginate = false;
            if (page && size) {
                // add pagination to the query
                paginationQuery = {
                    ...paginationQuery,
                    page: Number(page),
                    size: Number(size),
                };
                paginate = !!(paginationQuery.page && paginationQuery.size && paginationQuery.page > 0 && paginationQuery.size > 0);
            }

            console.log('paginate', paginate);
            // Fetch notifications based on read status
            const notifications = await NotificationService.viewNotifications(req.user.id, paginationQuery, transaction);
            const getNotificationStats = await NotificationService.getNotificationStats(req.user.id, transaction);
            let totalPages = {};
            if (paginate && notifications.length > 0) {
                totalPages = Pagination.estimateTotalPage({ count: getNotificationStats.total, limit: Number(size) } as IPaging);
                console.log(totalPages, 'totalPages');
            }
            res.status(200).json({
                status: 'success',
                message: 'Notifications retrieved successfully',
                data: {
                    notifications,
                    stats: {
                        ...getNotificationStats,
                        ...totalPages,
                    },
                },
            });
        });
    }

    static async getNotification(req: AuthenticatedRequest, res: Response) {
        const { notificationId } = req.query;
        if (!notificationId) {
            throw new BadRequestError('Notification ID is required');
        }
        // const notification = await WeavyClientConfig.getNotification(req.user, notificationId as string);
        const notification = await NotificationService.viewSingleNotificationById(notificationId as string);
        res.status(200).json({
            status: 'success',
            message: 'Notification retrieved successfully',
            data: notification,
        });
    }

    static async markNotificationAsRead(req: AuthenticatedRequest, res: Response) {
        const { notificationId, all } = req.query;
        const profile = req.user;

        if (!profile) {
            throw new BadRequestError('Please complete your profile');
        }

        if (all === 'true') {
            const updatedCount = await NotificationService.markAllNotificationsAsRead(profile.id);
            res.status(200).json({
                status: 'success',
                message: `${updatedCount} notifications marked as read`,
            });
        } else {
            if (!notificationId) {
                throw new BadRequestError('Notification ID is required');
            }
            await NotificationService.updateSingleNotification(notificationId as string, { read: true } as INotification);
            res.status(200).json({ status: 'success', message: 'Notification marked as read' });
        }
    }    
}
