import express, { Router } from 'express';
import AuthController from '../controllers/auth.controller';
import { basicAuth, AuthenticatedController } from '../middlewares/authMiddleware';
import { uploadMiddleware, UploadType } from 'middlewares/uploadMiddleware';
// import { rateLimiter } from '../middlewares/rateLimiter';
// import passport from 'passport';



const router: Router = express.Router();

// // Configure the upload middleware for single file upload
const upload = uploadMiddleware(UploadType.Single, 'file');

router
    .post('/signup', AuthController.signup)
    .post('/verifyemail', AuthController.verifyEmail)
    .get('/resendverifyemail', AuthController.resendVerificationEmail)
    .post('/forgotpassword', AuthController.forgotPassword)
    .post('/login', AuthController.login)
    .post('/resetpassword', AuthController.resetPassword)

    // .post('/setpassword', basicAuth('setpassword'), AuthenticatedController(AuthController.setPassword))
    .post('/changepassword', basicAuth('access'), AuthenticatedController(AuthController.changePassword))
    .get('/logout', basicAuth('access'), AuthenticatedController(AuthController.logout))
    .get('/loggeduser', basicAuth('access'), AuthenticatedController(AuthController.getLoggedUserData))
    .patch('/update-profile', basicAuth('access'), upload, AuthenticatedController(AuthController.updateUser))
    .get('/authtoken', basicAuth('refresh'));

// Google authentication route
// router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
// router.get(
//     '/google/callback',
//     passport.authenticate('google', {
//         failureRedirect: '/register',
//         session: false,
//     }),
//     AuthController.googleSignIn,
// );


export default router;

