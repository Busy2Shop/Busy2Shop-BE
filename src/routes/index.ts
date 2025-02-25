import { Router } from 'express';
import authRoute from './auth.routes';
import userRoute from './user.routes';
import referralRoutes from './referral.routes';
import reviewRoutes from './reviews.routes';
// import AdminRoutes from './Admin/admin.routes';

const router = Router();

router
    .use('/referral', referralRoutes)
    .use('/review', reviewRoutes)
    .use('/auth', authRoute)
    // .use('/iamBase', adminRoute)
    .use('/user', userRoute);

export default router;


