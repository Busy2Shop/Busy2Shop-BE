import express, { Router } from 'express';
import ChatController from '../controllers/chat.controller';
import { basicAuth, AuthenticatedController } from '../middlewares/authMiddleware';

const router: Router = express.Router();

router
    .get('/messages/:orderId', basicAuth('access'), AuthenticatedController(ChatController.getOrderMessages))
    .get('/unread', basicAuth('access'), AuthenticatedController(ChatController.getUnreadMessageCount))
    .post('/read/:orderId', basicAuth('access'), AuthenticatedController(ChatController.markMessagesAsRead));

export default router;
