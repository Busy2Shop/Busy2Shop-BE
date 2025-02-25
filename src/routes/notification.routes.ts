import express, { Router } from 'express';
import NotificationController from '../controllers/notifications.controller';
import { AuthenticatedController, basicAuth } from '../middlewares/authMiddleware';

const router: Router = express.Router();

router
    .get('/', basicAuth('access'), AuthenticatedController(NotificationController.listNotifications))
    .get('/single', basicAuth('access'), AuthenticatedController(NotificationController.getNotification))
    .patch('/read', basicAuth('access'), AuthenticatedController(NotificationController.markNotificationAsRead));

export default router;

