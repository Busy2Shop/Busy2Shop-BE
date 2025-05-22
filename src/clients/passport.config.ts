// import passport from 'passport';
// // import { Strategy as FacebookStrategy } from 'passport-facebook';
// import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
// import User from '../models/user.model';
// import {
//     // FACEBOOK_APP_ID,
//     // FACEBOOK_APP_SECRET,
//     // API_URL,
//     GOOGLE_CLIENT_ID,
//     GOOGLE_CLIENT_SECRET,
// } from '../utils/constants';
// import UserService from '../services/user.service';
// // import { Transaction } from 'sequelize';
// // import { Database } from '../models';

// export default class FederationLoginConfig {
//     constructor() {
//         this.initialize();
//     }

//     private initialize() {
//         // this.configureFacebookStrategy();
//         this.configureGoogleStrategy();
//         this.serializeUser();
//         this.deserializeUser();
//     }
//     private configureGoogleStrategy() {
//         passport.use(
//             new GoogleStrategy(
//                 {
//                     clientID: GOOGLE_CLIENT_ID,
//                     clientSecret: GOOGLE_CLIENT_SECRET,
//                     callbackURL: '/api/v0/auth/google/callback',
//                 },
//                 async (accessToken, refreshToken, profile, done) => {
//                     try {
//                         const profileData = {
//                             email: profile.emails?.[0]?.value as string,
//                             firstName: profile.name?.givenName as string,
//                             lastName: profile.name?.familyName as string,
//                             googleId: profile.id,
//                             displayImage: profile.photos?.[0]?.value,
//                             status: {
//                                 activated: true,
//                                 emailVerified: true,
//                                 userType: 'customer',
//                             },
//                         };
//                         const user = await UserService.findOrCreateUserByGoogleProfile(profileData);
//                         return done(null, user);
//                     } catch (error) {
//                         return done(error as Error);
//                     }
//                 },
//             ),
//         );
//     }

//     private serializeUser() {
//         passport.serializeUser((user: any, done) => {
//             done(null, user.id);
//         });
//     }

//     private deserializeUser() {
//         passport.deserializeUser(async (id: string, done) => {
//             try {
//                 const user = await User.findByPk(id);
//                 done(null, user);
//             } catch (error) {
//                 done(error);
//             }
//         });
//     }
// }
