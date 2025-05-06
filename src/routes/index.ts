import { Router } from 'express';
import authRoute from './auth.routes';
import referralRoute from './referral.routes';
import reviewRoutes from './reviews.routes';
import marketRoute from './market.routes';
import categoryRoute from './category.routes';
import productRoute from './product.routes';
import shoppingListRoute from './shoppingList.routes';
import orderRoute from './order.routes';
import agentRoute from './agent.routes';
import kycRoute from './kyc.routes';
import AdminRoutes from './admin.routes';
import chatRoute from './chat.routes';
import notificationRoutes from './notification.routes';

const router = Router();

router.use('/auth', authRoute);
router.use('/market', marketRoute);
router.use('/category', categoryRoute);
router.use('/product', productRoute);
router.use('/shopping-list', shoppingListRoute);
router.use('/order', orderRoute);
router.use('/agent', agentRoute);
router.use('/kyc', kycRoute);
router.use('/review', reviewRoutes);
router.use('/referral', referralRoute);
router.use('/admin', AdminRoutes);
router.use('/chat', chatRoute);
router.use('/notifications', notificationRoutes);

export default router;
