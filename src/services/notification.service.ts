import Notification, { INotification } from '../models/notification.model';
import { col, fn, Op, Sequelize, Transaction } from 'sequelize';
import { BadRequestError } from '../utils/customErrors';
import Pagination, { IPaginationQuery, IPaging } from '../utils/pagination';
import NotificationUtil from '../clients/oneSignal.config';
import { emailService } from '../utils/Email';
import User from '../models/user.model';
import { NotificationTypes } from '../utils/interface';
import { logger } from '../utils/logger';

interface IGroupedNotification extends INotification {
    count: number;
    latest_id: string;
    latest_date: Date;
}

export default class NotificationService {
    // Adding this new method to handle email notifications
    static async sendEmailNotification(notification: INotification): Promise<void> {
        try {
            // Only send emails for chat-related notifications
            const chatNotificationTypes = [
                NotificationTypes.CHAT_MESSAGE_RECEIVED,
                NotificationTypes.CHAT_ACTIVATED,
                NotificationTypes.USER_LEFT_CHAT,
            ];

            if (!chatNotificationTypes.includes(notification.title as NotificationTypes)) {
                return; // Skip if not a chat notification
            }

            // Get user details to send the email
            const user = await User.findByPk(notification.userId);

            if (!user?.email) {
                logger.warn(
                    `Cannot send email notification: No email found for user ${notification.userId}`,
                );
                return;
            }

            // Get actor details (if applicable)
            let actorName = 'System';
            if (notification.actorId) {
                const actor = await User.findByPk(notification.actorId);
                if (actor) {
                    actorName = `${actor.firstName} ${actor.lastName}`.trim();
                }
            }

            // Send email notification
            await emailService.sendChatNotificationEmail(user.email, {
                recipientName: `${user.firstName} ${user.lastName}`.trim(),
                senderName: actorName,
                message: notification.message,
                notificationType: notification.title,
                resourceId: notification.resource ?? '',
            });
        } catch (error) {
            logger.error('Error sending email notification:', error);
            // Don't throw the error, just log it
        }
    }

    static async addNotification(
        notificationData: INotification,
        transaction?: Transaction,
    ): Promise<Notification> {
        const [notification, created] = await Notification.findOrCreate({
            where: {
                title: notificationData.title,
                userId: notificationData.userId,
                resource: notificationData.resource,
            },
            defaults: notificationData,
            transaction,
        });

        if (!created) {
            await notification.update(notificationData, { transaction });
        }

        if (created) {
            try {
                const userIds = [notificationData.userId];

                const result = await NotificationUtil.sendNotificationToUser(
                    userIds,
                    notificationData,
                );

                if (result === 'success') {
                    console.log('Push notification sent successfully');
                } else {
                    console.error('Failed to send push notification');
                }

                // Added this line to send an email notification
                await this.sendEmailNotification(notificationData);
            } catch (error) {
                console.error('Error sending push notification:', error);
            }
        }

        return notification;
    }

    static async addNotifications(
        notificationsData: INotification[],
        transaction?: Transaction,
    ): Promise<Notification[]> {
        // Find existing notifications
        const whereClauses = notificationsData.map(({ title, userId, resource }) => ({
            title,
            userId,
            resource,
        }));

        const existingNotifications = await Notification.findAll({
            where: { [Op.or]: whereClauses },
            transaction,
        });

        // Create the map of existing notifications
        const existingNotificationMap = new Map<string, Notification>();
        existingNotifications.forEach(notification => {
            const key = `${notification.title}-${notification.userId}-${notification.resource}-${notification.message}`;
            existingNotificationMap.set(key, notification);
        });

        // Filter out existing notifications
        const newNotificationsData = notificationsData.filter(notification => {
            const key = `${notification.title}-${notification.userId}-${notification.resource}-${notification.message}`;
            return !existingNotificationMap.has(key);
        });

        let newNotifications: Notification[] = [];
        if (newNotificationsData.length > 0) {
            // Bulk create new notifications
            newNotifications = await Notification.bulkCreate(newNotificationsData, {
                transaction,
                returning: true,
            });

            try {
                // Group notifications by user ID to handle multiple notifications per user
                const notificationsByUser = new Map<string, INotification[]>();

                newNotificationsData.forEach(notification => {
                    const userNotifications = notificationsByUser.get(notification.userId) || [];
                    userNotifications.push(notification);
                    notificationsByUser.set(notification.userId, userNotifications);
                });

                // Process in batches of 2000 users (OneSignal limit)
                const BATCH_SIZE = 2000;
                const uniqueUserIds = [...notificationsByUser.keys()];

                for (let i = 0; i < uniqueUserIds.length; i += BATCH_SIZE) {
                    const batchUserIds = uniqueUserIds.slice(i, i + BATCH_SIZE);
                    const batchPromises = batchUserIds.map(async userId => {
                        const userNotifications = notificationsByUser.get(userId);
                        if (!userNotifications?.length) return;

                        // Use the most recent notification for this user
                        const latestNotification = userNotifications[userNotifications.length - 1];

                        // Added this: Send email notification for the latest notification
                        await this.sendEmailNotification(latestNotification);

                        return NotificationUtil.sendNotificationToUser(
                            [userId],
                            latestNotification,
                        );
                    });

                    const results = await Promise.all(batchPromises);

                    // Log results
                    const successCount = results.filter(r => r === 'success').length;
                    const failCount = batchUserIds.length - successCount;

                    if (successCount > 0) {
                        logger.info(`Successfully sent ${successCount} notifications in batch`);
                    }
                    if (failCount > 0) {
                        logger.error(`Failed to send ${failCount} notifications in batch`);
                    }
                }
            } catch (error) {
                logger.error('Error sending push notifications:', error);
            }
        }

        return [...existingNotifications, ...newNotifications];
    }

    static async viewNotifications(
        userId: string,
        queryData?: IPaginationQuery,
        transaction?: Transaction,
    ): Promise<IGroupedNotification[]> {
        const { page, size } = queryData as IPaginationQuery;

        // Get pagination parameters
        const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);

        // Step 1: Get the latest notification IDs and their counts using Sequelize aggregation
        const subQueryResults = (await Notification.findAll({
            attributes: [
                'title',
                'resource',
                [fn('MAX', col('id')), 'latest_id'],
                [fn('COUNT', col('id')), 'count'],
            ],
            where: { userId },
            group: ['title', 'resource'],
            order: [[fn('MAX', col('createdAt')), 'DESC']],
            limit: limit ?? undefined,
            offset: offset ?? undefined,
            transaction,
            raw: true, // Ensures we get raw data
        })) as unknown as IGroupedNotification[];

        // Ensure that we have results
        if (!subQueryResults || subQueryResults.length === 0) {
            return [];
        }

        // Extract the latest notification IDs
        const latestNotificationIds = subQueryResults.map(result => result.latest_id);

        // Step 2: Fetch the full notifications using the latest IDs
        const latestNotifications = await Notification.findAll({
            where: {
                id: {
                    [Op.in]: latestNotificationIds,
                },
            },
            order: [['createdAt', 'DESC']],
            transaction,
        });
        // Step 3: Map the notifications to include the count and ensure only the most recent notification is included
        const groupedNotificationsMap: { [key: string]: IGroupedNotification } =
            latestNotifications.reduce(
                (acc, notification) => {
                    const key = `${notification.title}-${notification.resource}`;
                    const countData = subQueryResults.find(
                        result => result.latest_id === notification.id,
                    );

                    if (
                        !acc[key] ||
                        new Date(notification.createdAt) > new Date(acc[key].latest_date)
                    ) {
                        acc[key] = {
                            ...notification.get({ plain: true }),
                            count: countData ? Number(countData.count) : 1,
                            latest_id: notification.id,
                            latest_date: notification.createdAt,
                        };
                    }

                    return acc;
                },
                {} as { [key: string]: IGroupedNotification },
            );

        // Convert the map to an array
        return Object.values(groupedNotificationsMap);
    }

    static async viewNotificationByEntityId(
        entityId: string,
        page?: number,
        limit?: number,
    ): Promise<Notification[]> {
        const query =
            page && limit
                ? { where: { entityId }, limit, offset: (page - 1) * limit }
                : { where: { entityId } };
        return await Notification.findAll(query);
    }

    static async viewSingleNotificationById(id: string): Promise<Notification> {
        console.log(id);
        const notification = await Notification.findByPk(id);
        if (!notification) throw new BadRequestError('Notification not found');
        return notification;
    }

    static async updateSingleNotification(
        id: string,
        data: Partial<INotification>,
    ): Promise<Notification | null> {
        const notification = await this.viewSingleNotificationById(id);
        if (!notification) return null;

        await notification.update(data);

        return await this.viewSingleNotificationById(id);
    }

    static async markAllNotificationsAsRead(userId: string): Promise<number> {
        const [updatedCount] = await Notification.update(
            { read: true },
            { where: { userId, read: false } },
        );
        return updatedCount;
    }

    static async getUnreadNotifications(userId: string): Promise<Notification[]> {
        return await Notification.findAll({ where: { userId, read: false } });
    }

    static async getNotificationStats(
        userId: string,
        transaction?: Transaction,
    ): Promise<{ total: number; read: number; unread: number }> {
        const stats = await Notification.findAll({
            attributes: [
                [
                    Sequelize.literal(
                        'COUNT(DISTINCT CONCAT("title", "userId", "resource", "heading", "message"))',
                    ),
                    'total',
                ],
                [
                    Sequelize.literal(
                        'COUNT(DISTINCT CASE WHEN "read" = false THEN CONCAT("title", "userId", "resource", "heading", "message") END)',
                    ),
                    'unread',
                ],
            ],
            where: { userId },
            transaction,
        });

        // Aggregate the results manually after grouping
        const total = stats.length > 0 ? parseInt(stats[0].get('total') as string, 10) : 0;
        const unread = stats.length > 0 ? parseInt(stats[0].get('unread') as string, 10) : 0;
        const read = total - unread;

        return {
            total,
            read,
            unread,
        };
    }

    static async deleteOldNotifications(): Promise<number> {
        // Step 1: Delete notifications older than 30 days
        await Notification.destroy({
            where: {
                createdAt: {
                    [Op.lt]: Sequelize.literal("CURRENT_TIMESTAMP - INTERVAL '30 days'"),
                },
            },
        });

        // Step 2: Find and delete duplicate notifications, keeping only the latest
        const duplicates = (await Notification.findAll({
            attributes: [
                'title',
                'message',
                'heading',
                'resource',
                'userId',
                [fn('COUNT', col('id')), 'count'],
                [fn('MAX', col('createdAt')), 'latest_date'],
            ],
            group: ['title', 'message', 'heading', 'resource', 'userId'],
            having: Sequelize.literal('COUNT(id) > 1'),
            raw: true,
        })) as unknown as IGroupedNotification[];

        let deleteCount = 0;

        // For each group of duplicates, find the IDs of the notifications to delete
        for (const duplicate of duplicates) {
            const { title, message, heading, resource, userId, latest_date } = duplicate;

            const notificationsToDelete = await Notification.findAll({
                where: {
                    title,
                    message,
                    heading,
                    resource,
                    userId,
                    createdAt: {
                        [Op.lt]: latest_date,
                    },
                },
                attributes: ['id'],
                raw: true,
            });

            const idsToDelete = notificationsToDelete.map(n => n.id);

            // Delete the duplicate notifications
            const result = await Notification.destroy({
                where: {
                    id: {
                        [Op.in]: idsToDelete,
                    },
                },
            });

            deleteCount += result;
        }

        return deleteCount;
    }
}
