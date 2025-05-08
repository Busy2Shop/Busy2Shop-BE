import { Router } from 'express';
import ChatController from '../controllers/chat.controller';
import { basicAuth, AuthenticatedController } from '../middlewares/authMiddleware';
import { uploadMiddleware, UploadType } from '../middlewares/uploadMiddleware';

const router = Router();
const upload = uploadMiddleware(UploadType.Single, 'file');

// Order-related chat routes
router.get(
    '/orders/:orderId/messages',
    basicAuth('access'),
    AuthenticatedController(ChatController.getOrderMessages),
);
router.post(
    '/orders/:orderId/activate',
    basicAuth('access'),
    AuthenticatedController(ChatController.activateChat),
);
router.get(
    '/orders/:orderId/active',
    basicAuth('access'),
    AuthenticatedController(ChatController.isChatActive),
);

// File upload route
router.post(
    '/upload-image',
    basicAuth('access'),
    upload,
    AuthenticatedController(ChatController.uploadChatImage),
);

export default router;
