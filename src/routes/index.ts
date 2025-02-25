import { Router } from 'express';
import authRoute from './auth.routes';
import userRoute from './user.routes';
import referralRoute from './referral.routes';
import reviewRoutes from './reviews.routes';
import marketRoute from './market.routes';
import categoryRoute from './category.routes';
import productRoute from './product.routes';
import shoppingListRoute from './shoppingList.routes';
import orderRoute from './order.routes';
import vendorRoute from './vendor.routes';
// import AdminRoutes from './Admin/admin.routes';

const router = Router();

router.use('/auth', authRoute);
router.use('/user', userRoute);
router.use('/market', marketRoute);
router.use('/category', categoryRoute);
router.use('/product', productRoute);
router.use('/shopping-list', shoppingListRoute);
router.use('/order', orderRoute);
router.use('/vendor', vendorRoute);
router.use('/review', reviewRoutes);
router.use('/referral', referralRoute);
// router.use('/admin', AdminRoutes);

export default router;


