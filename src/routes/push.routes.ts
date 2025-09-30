import express, { Router } from 'express';
import {
    subscribeToPushNotifications,
    unsubscribeFromPushNotifications,
    getPushNotificationStatus,
    sendTestPushNotification,
    getPushNotificationStatistics,
    cleanupOldSubscriptions,
} from '../controllers/push.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router: Router = express.Router();

// User push notification routes
router.post(
    '/subscribe',
    basicAuth('access'),
    AuthenticatedController(subscribeToPushNotifications),
);

router.delete(
    '/unsubscribe',
    basicAuth('access'),
    AuthenticatedController(unsubscribeFromPushNotifications),
);

router.get(
    '/status',
    basicAuth('access'),
    AuthenticatedController(getPushNotificationStatus),
);

router.post(
    '/test',
    basicAuth('access'),
    AuthenticatedController(sendTestPushNotification),
);

// Admin routes (if AdminController exists, otherwise comment out)
// router.get(
//     '/statistics',
//     basicAuth('access'),
//     AdminController(getPushNotificationStatistics),
// );

// router.post(
//     '/cleanup',
//     basicAuth('access'),
//     AdminController(cleanupOldSubscriptions),
// );

export default router;