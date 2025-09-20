import { Router } from 'express';
import ChatController from '../controllers/chat.controller';
import EnhancedChatController from '../controllers/chat-enhanced.controller';
import { basicAuth, AuthenticatedController } from '../middlewares/authMiddleware';
import { uploadMiddleware, UploadType } from '../middlewares/uploadMiddleware';

const router = Router();
const upload = uploadMiddleware(UploadType.Single, 'file');

// Order-related chat routes
router.get(
    '/orders/:orderId/messages',
    basicAuth('access'),
    AuthenticatedController(EnhancedChatController.getOrderMessages),
);
router.post(
    '/orders/:orderId/messages',
    basicAuth('access'),
    AuthenticatedController(EnhancedChatController.sendMessage),
);
router.post(
    '/orders/:orderId/activate',
    basicAuth('access'),
    AuthenticatedController(EnhancedChatController.activateChat),
);
router.get(
    '/orders/:orderId/active',
    basicAuth('access'),
    AuthenticatedController(EnhancedChatController.isChatActive),
);
router.post(
    '/orders/:orderId/read',
    basicAuth('access'),
    AuthenticatedController(EnhancedChatController.markMessagesAsRead),
);

// Chat utility routes
router.get(
    '/unread-count',
    basicAuth('access'),
    AuthenticatedController(EnhancedChatController.getUnreadMessageCount),
);

// File upload route
router.post(
    '/upload-image',
    basicAuth('access'),
    upload,
    AuthenticatedController(EnhancedChatController.uploadChatImage),
);

export default router;
