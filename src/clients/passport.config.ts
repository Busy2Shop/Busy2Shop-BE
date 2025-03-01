import passport from 'passport';
// import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../models/user.model';
import {
    // FACEBOOK_APP_ID,
    // FACEBOOK_APP_SECRET,
    // API_URL,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
} from '../utils/constants';
import UserService from '../services/user.service';
// import { Transaction } from 'sequelize';
// import { Database } from '../models';

export default class FederationLoginConfig {
    constructor() {
        this.initialize();
    }

    private initialize() {
        // this.configureFacebookStrategy();
        this.configureGoogleStrategy();
        this.serializeUser();
        this.deserializeUser();
    }
    private configureGoogleStrategy() {
        passport.use(
            new GoogleStrategy(
                {
                    clientID: GOOGLE_CLIENT_ID,
                    clientSecret: GOOGLE_CLIENT_SECRET,
                    callbackURL: '/auth/google/callback',
                },
                async (accessToken, refreshToken, profile, done) => {
                    try {
                        const profileData = {
                            email: profile.emails?.[0]?.value as string,
                            firstName: profile.name?.givenName as string,
                            lastName: profile.name?.familyName as string,
                            username: profile.displayName,
                            googleId: profile.id,
                            displayImage: profile.photos?.[0]?.value,
                            status: {
                                activated: false,
                                emailVerified: false,
                                userType: 'customer',
                            },
                            // role: 'user',
                        };
                        const user = await UserService.findOrCreateUserByGoogleProfile(profileData);
                        return done(null, user);
                    } catch (error) {
                        return done(error as Error);
                    }
                },
            ),
        );
    }

    private serializeUser() {
        passport.serializeUser((user, done) => {
            console.log('\n ----------> Serialize User:');
            console.log(user);
            done(null, user);
        });
    }

    private deserializeUser() {
        passport.deserializeUser((user: User, done) => {
            console.log('\n ----------> Deserialize User:');
            console.log(user);
            done(null, user);
        });
    }
}
