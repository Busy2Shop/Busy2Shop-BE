import { logger } from '../utils/logger';
import {
    ONESIGNAL_USER_AUTH_KEY,
    ONESIGNAL_REST_API_KEY,
    ONESIGNAL_APP_ID,
} from '../utils/constants';
import { INotification } from '../models/notification.model';
import * as OneSignal from '@onesignal/node-onesignal';

// export class NotificationUtil {
//     private static client = new OneSignal.DefaultApi(OneSignal.createConfiguration({
//         restApiKey: ONESIGNAL_REST_API_KEY,
//         userAuthKey: ONESIGNAL_USER_AUTH_KEY,
//     }));

//     static async sendNotificationToUser(userIds: string[], notification: Notifications): Promise<'success' | null> {
//         console.log('push notification', notification);
//         if (!userIds || userIds.length === 0) {
//             logger.error('No user IDs provided for notification');
//             // throw new BadRequestError('No user IDs provided');
//             return null;
//         }

//         if (userIds.length > 2000) {
//             logger.error('Too many user IDs provided (limit is 2000)');
//             // throw new BadRequestError('Too many user IDs (max 2000)');
//             return null;
//         }

//         try {
//             const oneSignalNotification = new OneSignal.Notification();
//             oneSignalNotification.contents = { en: notification.message };
//             oneSignalNotification.headings = { en: notification.heading || notification.title };
//             // oneSignalNotification.include_aliases = { 'external_id': userIds};
//             oneSignalNotification.app_id = ONESIGNAL_APP_ID!;
//             oneSignalNotification.included_segments = ['All'];
//             (oneSignalNotification as OneSignal.Notification).include_external_user_ids = userIds;
//             (oneSignalNotification as OneSignal.Notification).target_channel = 'web';

//             await this.client.createNotification(oneSignalNotification);
//             return 'success';
//         } catch (error: unknown) {
//             logger.error('Error sending notification to users', { meta: { error: (error as Error).stack } });
//             return null;
//         }
//     }
// }

// export default NotificationUtil;

class NotificationUtil {
    private static client = new OneSignal.DefaultApi(
        OneSignal.createConfiguration({
            restApiKey: ONESIGNAL_REST_API_KEY,
            userAuthKey: ONESIGNAL_USER_AUTH_KEY,
        }),
    );

    static async sendNotificationToUser(
        userIds: string[],
        notification: INotification,
    ): Promise<'success' | null> {
        console.log('push notification', notification);
        // userids is the array of external_ids of the users and is limited to 2000 entries per request
        try {
            const oneSignalNotification = new OneSignal.Notification();
            oneSignalNotification.contents = { en: notification.message };
            oneSignalNotification.headings = { en: notification.heading || notification.title };
            oneSignalNotification.include_aliases = { external_id: userIds };
            // For email only
            oneSignalNotification.target_channel = 'email';
            oneSignalNotification.app_id = ONESIGNAL_APP_ID;
            oneSignalNotification.included_segments = ['All'];

            await this.client.createNotification(oneSignalNotification);
            return 'success';
        } catch (error: unknown) {
            logger.error('Error sending notification to users', {
                meta: { error: (error as Error).stack },
            });
            return null;
        }
    }
}

export default NotificationUtil;
