// src/controllers/auth.controller.ts
import { Request, Response } from 'express';
import { BadRequestError, ForbiddenError } from '../utils/customErrors';
import Validator from '../utils/validators';
import Password from '../models/password.model';
import { AuthUtil } from '../utils/token';
import { logger } from '../utils/logger';
import { Database } from '../models';
import { emailService, EmailTemplate } from '../utils/Email';
import UserService, { IDynamicQueryOptions } from '../services/user.service';
import { AuthenticatedRequest } from '../middlewares/authMiddleware';
import { WEBSITE_URL, GOOGLE_CLIENT_ID } from '../utils/constants';
import { Transaction } from 'sequelize';
import CloudinaryClientConfig from '../clients/cloudinary.config';
import { OAuth2Client } from 'google-auth-library';

export default class AuthController {
    /**
     * Validates signup data for both customer and agent registrations
     * @param signupData The signup data to validate
     * @throws BadRequestError if validation fails
     */
    private static validateSignupData(signupData: {
        firstName?: string;
        lastName?: string;
        email?: string;
        password?: string;
        userType?: string;
    }) {
        const { firstName, lastName, email, password, userType } = signupData;

        // Validate required fields
        if (!firstName || !lastName || !email || !password) {
            throw new BadRequestError('First name, last name, email, and password are required');
        }

        // Validate email format
        const validEmail = Validator.isValidEmail(email);
        if (!validEmail) {
            throw new BadRequestError('Invalid email format');
        }

        // Validate password format
        if (!Validator.isValidPassword(password)) {
            throw new BadRequestError('Invalid password format');
        }

        // Validate user type
        const validUserTypes = ['customer', 'agent'];
        if (!userType || !validUserTypes.includes(userType)) {
            throw new BadRequestError('Invalid user type');
        }
    }

    static async validateAuth(req: Request, res: Response) {
        const { email, userType } = req.body;

        // Validate required fields
        if (!email || !userType) {
            throw new BadRequestError('Email is required');
        }

        // Check if email is available for the specified user type
        const { isAvailable, isActivated } = await UserService.isEmailAvailable(email, userType);

        // Case 1: Email doesn't exist for this user type - Create new user
        if (isAvailable) {
            const newUser = await UserService.addUser({
                email,
                status: {
                    activated: false,
                    emailVerified: false,
                    userType,
                },
            });

            // Generate and send OTP
            const otpCode = await AuthUtil.generateCode({
                type: 'emailverification',
                identifier: newUser.id,
                expiry: 60 * 10,
            });

            await emailService.send({
                email: 'batch',
                subject: 'Email Verification',
                from: 'auth',
                isPostmarkTemplate: true,
                postMarkTemplateAlias: 'verify-email',
                postmarkInfo: [
                    {
                        postMarkTemplateData: { otpCode },
                        recipientEmail: email,
                    },
                ],
                html: await new EmailTemplate().accountActivation({ otpCode }),
            });

            return res.status(200).json({
                status: 'success',
                message: 'Email verification code sent successfully',
                data: {
                    email: newUser.email,
                    userExists: false,
                    isActivated: false,
                    action: 'verify_email',
                },
            });
        }

        // Case 2: Email exists but not activated - Resend verification
        if (!isActivated) {
            const user = await UserService.viewSingleUserByEmail(email);

            const otpCode = await AuthUtil.generateCode({
                type: 'emailverification',
                identifier: user.id,
                expiry: 60 * 20,
            });

            await emailService.send({
                email: 'batch',
                subject: 'Email Verification',
                from: 'auth',
                isPostmarkTemplate: true,
                postMarkTemplateAlias: 'verify-email',
                postmarkInfo: [
                    {
                        postMarkTemplateData: { otpCode },
                        recipientEmail: email,
                    },
                ],
                html: await new EmailTemplate().accountActivation({ otpCode }),
            });

            return res.status(200).json({
                status: 'success',
                message: 'Verification code resent successfully',
                data: {
                    email: user.email,
                    userExists: true,
                    isActivated: false,
                    action: 'verify_email',
                },
            });
        }

        // Case 3: Email exists and is activated - Prompt to login
        return res.status(200).json({
            status: 'success',
            message: `Email already registered as ${userType}. Please login to continue.`,
            data: {
                email,
                userExists: true,
                isActivated: true,
                action: 'login',
            },
        });
    }

    static async verifyEmail(req: Request, res: Response) {
        const { otpCode, email }: { otpCode: string; email: string } = req.body;

        if (!email || !otpCode) {
            throw new BadRequestError('Email and OTP code are required');
        }

        await Database.transaction(async (transaction: Transaction) => {
            const user = await UserService.viewSingleUserByEmail(email, transaction);

            if (!user) {
                throw new BadRequestError('User not found');
            }

            if (user.status.emailVerified && user.status.activated) {
                throw new BadRequestError('Email already verified');
            }

            const validCode = await AuthUtil.compareCode({
                user,
                tokenType: 'emailverification',
                token: otpCode,
            });
            if (!validCode) throw new BadRequestError('Invalid OTP code');

            await user.update({
                status: {
                    ...user.status,
                    emailVerified: true,
                },
            }, { transaction });

            await AuthUtil.deleteToken({
                user,
                tokenType: 'emailverification',
                tokenClass: 'code',
            });

            const accessToken = await AuthUtil.generateToken({ type: 'setup', user });

            res.status(200).json({
                status: 'success',
                message: 'Email verified successfully',
                data: {
                    email: user.email,
                    accessToken,
                },
            });
        });
    }

    static async completeAccount(req: AuthenticatedRequest, res: Response) {
        const {
            firstName,
            lastName,
            dob,
            location: { country, city, address } = {},
            otherName,
            displayImage,
            gender,
            phone: { countryCode, number } = {},
            password,
        } = req.body;

        console.log({ reqBody: req.body });

        const userId = req.user.id;
        // Validate required fields
        await AuthController.validateSignupData({
            firstName,
            lastName,
            password,
            email: req.user.email,
            userType: req.user.status.userType,
        });

        // Get user and verify email is verified
        const user = await UserService.viewSingleUser(userId);
        if (!user.status.emailVerified) {
            throw new BadRequestError('Please verify your email first');
        }

        // Update user with complete information
        const updatedUser = await UserService.updateUser(user, {
            firstName,
            lastName,
            otherName,
            displayImage,
            dob,
            gender,
            location: country
                ? {
                    country,
                    city,
                    address,
                }
                : undefined,
            phone: countryCode
                ? {
                    countryCode,
                    number,
                }
                : undefined,
            status: {
                ...user.status,
                activated: true,
            },
        });

        // Create password for the user
        await Password.create({
            userId: updatedUser.id,
            password,
        });

        const accessToken = await AuthUtil.generateToken({ type: 'access', user });
        const refreshToken = await AuthUtil.generateToken({ type: 'refresh', user });

        res.status(200).json({
            status: 'success',
            message: 'Account completed successfully',
            data: {
                user: updatedUser,
                accessToken,
                refreshToken,
            },
        });
    }

    static async resendVerificationEmail(req: Request, res: Response) {
        const email = req.query.email as string;

        const user = await UserService.viewSingleUserByEmail(email);

        if (user.status.emailVerified) {
            throw new BadRequestError('Email already verified');
        }

        const otpCode = await AuthUtil.generateCode({
            type: 'emailverification',
            identifier: user.id,
            expiry: 60 * 10,
        });

        const templateData = {
            otpCode,
            name: user.firstName,
        };

        console.log('sending email');
        await emailService.send({
            email: 'batch',
            subject: 'Account Activation',
            from: 'auth',
            isPostmarkTemplate: true,
            postMarkTemplateAlias: 'verify-email',
            postmarkInfo: [
                {
                    postMarkTemplateData: templateData,
                    recipientEmail: email,
                },
            ],
            html: await new EmailTemplate().accountActivation({ otpCode }),
        });
        res.status(200).json({
            status: 'success',
            message: 'Email verification code resent successfully',
            data: null,
        });
    }

    static async forgotPassword(req: Request, res: Response) {
        const { email, redirectUrl } = req.body;

        console.log({ email, redirectUrl });

        const user = await UserService.viewSingleUserByEmail(email);

        if (!user) {
            throw new BadRequestError('Oops User not found');
        }

        const resetToken = await AuthUtil.generateCode({
            type: 'passwordreset',
            identifier: user.id,
            expiry: 60 * 10,
        });
        const redirectLink: string = redirectUrl ?? `${WEBSITE_URL}/reset-password`;

        const resetLink = `${redirectLink}?prst=${resetToken}&e=${encodeURIComponent(email)}`;

        const templateData = {
            link: resetLink,
            name: user.firstName,
        };

        //TODO: Send email with the reset password link with the resetToken as query param
        await emailService.send({
            email: 'batch',
            subject: 'Password Reset ',
            from: 'auth',
            isPostmarkTemplate: true,
            postMarkTemplateAlias: 'password-reset',
            postmarkInfo: [
                {
                    postMarkTemplateData: templateData,
                    recipientEmail: email,
                },
            ],
            html: await new EmailTemplate().forgotPassword({
                link: resetLink,
                name: user.firstName,
            }),
        });

        res.status(200).json({
            status: 'success',
            message: 'Reset password instructions sent successfully',
            data: null,
        });
    }

    static async resetPassword(req: Request, res: Response) {
        const {
            resetToken,
            email,
            newPassword,
        }: { resetToken: string; email: string; newPassword: string } = req.body;

        const validPassword = Validator.isValidPassword(newPassword);
        if (!validPassword) {
            throw new BadRequestError('Invalid password format');
        }

        const user = await UserService.viewSingleUserByEmail(email);

        const validCode = await AuthUtil.compareCode({
            user,
            tokenType: 'passwordreset',
            token: resetToken,
        });

        if (!validCode) {
            throw new BadRequestError('Invalid reset token');
        }

        const password = await user.$get('password');
        if (!password) {
            // if the email is verified and not activated, create the new password for the user
            if (!user.status.activated) {
                if (!user.status.emailVerified) {
                    await user.update({ status: { ...user.status, emailVerified: true } });
                }
                // create new password for user
                await Password.create({ userId: user.id, password: newPassword });
            } else {
                throw new ForbiddenError('Please contact support');
            }
        } else {
            // await Password.update({ password: newPassword }, { where: { id: password.id } });
            password.password = newPassword;
            await password.save();
        }

        // await AuthUtil.deleteToken({ user, tokenType: 'passwordreset', tokenClass: 'token' });

        res.status(200).json({
            status: 'success',
            message: 'Password reset successfully. Please login with your new password',
            data: null,
        });
    }

    static async changePassword(req: AuthenticatedRequest, res: Response) {
        const { oldPassword, newPassword }: { oldPassword: string; newPassword: string } = req.body;

        const validPassword = Validator.isValidPassword(newPassword);
        if (!validPassword) {
            throw new BadRequestError('Invalid password');
        }

        const { id } = req.user;
        const user = await UserService.viewSingleUser(id);

        const password = await user.$get('password');
        if (!password) throw new ForbiddenError('Please contact support');

        const validOldPassword = password.isValidPassword(oldPassword);
        if (!validOldPassword) {
            throw new BadRequestError('Invalid old password');
        }

        await password.update({ password: newPassword });

        res.status(200).json({
            status: 'success',
            message: 'Password changed successfully',
            data: null,
        });
    }

    static async login(req: Request, res: Response) {
        const { password, userType } = req.body;
        let data: IDynamicQueryOptions;

        // Validate required fields
        if (!password || !userType) {
            throw new BadRequestError('Password and user type are required');
        }

        // Check if login is with email or phone
        if (req.body.email) {
            // Validate email format
            const validEmail = Validator.isValidEmail(req.body.email);
            if (!validEmail) {
                throw new BadRequestError('Invalid email format');
            }
            data = { query: { email: req.body.email } };
        } else if (req.body.phone) {
            const { countryCode, number } = req.body.phone;

            // Validate phone components
            if (!countryCode || !number) {
                throw new BadRequestError('Country code and phone number are required');
            }

            // Validate phone format
            const validPhone = Validator.isValidPhone(number);
            if (!validPhone) {
                throw new BadRequestError('Invalid phone number format');
            }

            // Validate country code format
            const validCountryCode = Validator.isValidCountryCode(countryCode);
            if (!validCountryCode) {
                throw new BadRequestError('Invalid country code format');
            }

            data = {
                query: {
                    'phone.countryCode': countryCode,
                    'phone.number': number,
                },
            };
        } else {
            throw new BadRequestError('Please provide either email or phone number');
        }

        // Find user with email/phone and user type
        const user = await UserService.viewSingleUserDynamic(data);

        // Check if user exists and matches the requested user type
        if (!user || user.status.userType !== userType) {
            throw new BadRequestError(`No ${userType} account found with the provided credentials`);
        }

        // Check if email is verified
        if (!user.status.emailVerified) {
            const otpCode = await AuthUtil.generateCode({
                type: 'emailverification',
                identifier: user.id,
                expiry: 60 * 10,
            });

            await emailService.send({
                email: 'batch',
                subject: 'Email Verification',
                from: 'auth',
                isPostmarkTemplate: true,
                postMarkTemplateAlias: 'verify-email',
                postmarkInfo: [
                    {
                        postMarkTemplateData: { otpCode },
                        recipientEmail: user.email,
                    },
                ],
                html: await new EmailTemplate().accountActivation({ otpCode }),
            });

            throw new BadRequestError(
                'Please verify your email first. A new verification code has been sent.',
            );
        }

        // Check if account is completed
        if (!user.status.activated) {
            throw new BadRequestError(
                'Please complete your account setup before logging in',
            );
        }

        // Get and validate password
        const userPassword = await user.$get('password');
        if (!userPassword) {
            throw new BadRequestError(
                'Please set a password using the forgot password link',
            );
        }

        const validPassword = userPassword.isValidPassword(password);
        if (!validPassword) {
            throw new BadRequestError('Invalid password');
        }

        // Check if account is blocked
        if (user.settings.isBlocked) {
            throw new ForbiddenError('Account has been blocked. Please contact support');
        }

        // Check if account is deactivated
        if (user.settings.isDeactivated) {
            throw new ForbiddenError('Account has been deactivated. Please contact support');
        }

        // Generate tokens
        const accessToken = await AuthUtil.generateToken({ type: 'access', user });
        const refreshToken = await AuthUtil.generateToken({ type: 'refresh', user });

        // Update last login
        await UserService.updateUserSettings(user.id, { lastLogin: new Date() });

        res.status(200).json({
            status: 'success',
            message: 'Login successful',
            data: {
                user: user.dataValues,
                accessToken,
                refreshToken,
            },
        });
    }

    static async logout(req: AuthenticatedRequest, res: Response) {
        await AuthUtil.deleteToken({ user: req.user, tokenType: 'access', tokenClass: 'token' });
        await AuthUtil.deleteToken({ user: req.user, tokenType: 'refresh', tokenClass: 'token' });

        res.status(200).json({
            status: 'success',
            message: 'Logout successful',
            data: null,
        });
    }

    static async getLoggedUserData(req: AuthenticatedRequest, res: Response) {
        const user = req.user;

        res.status(200).json({
            status: 'success',
            message: 'user data retrieved successfully',
            data: {
                user: user.dataValues,
            },
        });
    }

    static async updateUser(req: AuthenticatedRequest, res: Response) {
        const { firstName, lastName, otherName, displayImage, location, gender, isDeactivated } =
            req.body;

        // eslint-disable-next-line no-undef
        const file = req.file;
        let url;
        if (file) {
            const result = await CloudinaryClientConfig.uploadtoCloudinary({
                fileBuffer: file.buffer,
                id: req.user.id,
                name: file.originalname,
                type: 'image',
            });
            url = result.url as string;
        } else if (displayImage) {
            url = displayImage;
        }

        // Prepare the update data for the user profile
        const updateData = {
            ...(firstName && { firstName }),
            ...(lastName && { lastName }),
            ...(otherName && { otherName }),
            ...(gender && { gender }),
            ...(url && { displayImage: url }),
            ...(location && {
                location: {
                    country: location.country || 'NGN',
                    city: location.city,
                    address: location.address,
                },
            }),
        };

        // Only update settings if isDeactivated is provided in the request body
        let settingsData = {};
        if (isDeactivated !== undefined && isDeactivated === 'true') {
            const state: boolean = isDeactivated === 'true';
            settingsData = {
                ...(state === req.user.settings.isDeactivated ? {} : { isDeactivated: state }),
            };
        }

        const dataKeys = Object.keys(updateData);
        const settingsKeys = Object.keys(settingsData);

        if (dataKeys.length === 0 && settingsKeys.length === 0) {
            throw new BadRequestError('No new data to update');
        }

        const updatedUser = await UserService.updateUser(req.user, updateData);

        if (settingsKeys.length > 0) {
            await UserService.updateUserSettings(req.user.id, settingsData);
        }

        res.status(200).json({
            status: 'success',
            message: 'User updated successfully',
            data: updatedUser,
        });
    }

    /**
     * Handle Google Sign-In authentication
     * This method verifies the Google ID token and creates/authenticates the user
     */
    static async handleGoogleCallback(req: Request, res: Response) {
        try {
            const { id_token } = req.body;

            if (!id_token) {
                throw new BadRequestError('Google ID token is required');
            }

            // Debug: Log the token structure (first and last 10 characters for security)
            logger.info(`Received Google ID token: ${id_token.substring(0, 10)}...${id_token.substring(id_token.length - 10)}`);

            // Verify Google Client ID is configured
            if (!GOOGLE_CLIENT_ID) {
                logger.error('GOOGLE_CLIENT_ID is not configured in environment variables');
                throw new BadRequestError('Google authentication is not configured');
            }

            // Debug: Log the Client ID being used for verification
            logger.info(`Using Google Client ID for verification: ${GOOGLE_CLIENT_ID}`);

            // Try to decode the token payload without verification first to debug
            try {
                const tokenParts = id_token.split('.');
                if (tokenParts.length === 3) {
                    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
                    logger.info(`Token audience (aud): ${payload.aud}`);
                    logger.info(`Token issuer (iss): ${payload.iss}`);
                    logger.info(`Token expiry (exp): ${new Date(payload.exp * 1000).toISOString()}`);

                    // Check if the audience matches our client ID
                    if (payload.aud !== GOOGLE_CLIENT_ID) {
                        logger.error(`Audience mismatch! Token aud: ${payload.aud}, Expected: ${GOOGLE_CLIENT_ID}`);
                        throw new BadRequestError('Google Client ID mismatch. Token was issued for a different application.');
                    }
                }
            } catch (decodeError) {
                logger.error('Failed to decode token for debugging:', decodeError);
            }

            // Create OAuth2Client with explicit configuration
            const client = new OAuth2Client({
                clientId: GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET, // Optional for ID token verification
            });

            let ticket;
            try {
                // Verify the Google ID token with detailed error logging
                ticket = await client.verifyIdToken({
                    idToken: id_token,
                    audience: GOOGLE_CLIENT_ID,
                    // Add additional verification options
                    maxExpiry: 86400, // 24 hours
                });

                logger.info('Google token verification successful');
            } catch (verifyError: any) {
                logger.error('Google token verification failed:', {
                    error: verifyError.message,
                    stack: verifyError.stack,
                    clientId: GOOGLE_CLIENT_ID,
                });

                // Provide more specific error messages
                if (verifyError.message.includes('audience')) {
                    throw new BadRequestError('Google Client ID mismatch. Please check your configuration.');
                } else if (verifyError.message.includes('expired')) {
                    throw new BadRequestError('Google token has expired. Please try signing in again.');
                } else if (verifyError.message.includes('signature')) {
                    throw new BadRequestError('Invalid Google token signature.');
                } else {
                    throw new BadRequestError(`Google token verification failed: ${verifyError.message}`);
                }
            }

            const payload = ticket.getPayload();
            if (!payload) {
                throw new BadRequestError('Invalid Google token payload');
            }

            const { sub: googleId, email, given_name, family_name, picture, email_verified } = payload;

            logger.info(`Google authentication for email: ${email}, verified: ${email_verified}`);

            if (!email || !email_verified) {
                throw new BadRequestError('Google email not verified or not available');
            }

            // Use transaction to ensure data consistency
            const user = await Database.transaction(async (transaction: Transaction) => {
                // Check if user already exists
                const existingUser = await UserService.isEmailExistingWithSettings(email);

                if (existingUser) {
                    logger.info(`Existing user found for email: ${email}`);

                    // User exists - update Google ID if not set and authenticate
                    if (!existingUser.googleId) {
                        await existingUser.update({ googleId }, { transaction });
                        logger.info(`Updated user with Google ID: ${googleId}`);
                    }

                    // Ensure the user is activated and email verified
                    if (!existingUser.status.emailVerified || !existingUser.status.activated) {
                        await existingUser.update({
                            status: {
                                ...existingUser.status,
                                emailVerified: true,
                                activated: true,
                            },
                            ...(picture && !existingUser.displayImage && { displayImage: picture }),
                        }, { transaction });
                        logger.info('Updated user activation status');
                    }

                    // Ensure user settings exist using the new method
                    await UserService.createOrUpdateUserSettings(existingUser.id, {
                        lastLogin: new Date(),
                    });

                    // Get the full user with settings
                    const fullUser = await UserService.viewSingleUser(existingUser.id);

                    // Check if account is blocked or deactivated
                    if (fullUser.settings.isBlocked) {
                        throw new ForbiddenError('Account has been blocked. Please contact support');
                    }

                    if (fullUser.settings.isDeactivated) {
                        throw new ForbiddenError('Account has been deactivated. Please contact support');
                    }

                    return fullUser;
                } else {
                    logger.info(`Creating new user for email: ${email}`);

                    // Create new user account with settings
                    const newUser = await UserService.findOrCreateUserByGoogleProfile({
                        email,
                        firstName: given_name || 'User',
                        lastName: family_name || '',
                        googleId,
                        displayImage: picture,
                        status: {
                            activated: true,
                            emailVerified: true,
                            userType: 'customer', // Default to customer for Google sign-ins
                        },
                    });

                    logger.info(`Created new user with ID: ${newUser.id}`);
                    return newUser;
                }
            });

            // Generate authentication tokens
            const accessToken = await AuthUtil.generateToken({ type: 'access', user });
            const refreshToken = await AuthUtil.generateToken({ type: 'refresh', user });

            // Update last login (this should now work since settings exist)
            try {
                await UserService.createOrUpdateUserSettings(user.id, { lastLogin: new Date() });
            } catch (settingsError) {
                logger.error('Failed to update last login:', settingsError);
                // Don't throw here, just log the error since authentication was successful
            }

            logger.info(`Google authentication successful for user: ${user.email}`);

            res.status(200).json({
                status: 'success',
                message: 'Google authentication successful',
                data: {
                    user: user.dataValues,
                    accessToken,
                    refreshToken,
                },
            });

        } catch (error) {
            logger.error('Google authentication error:', error);

            if (error instanceof BadRequestError || error instanceof ForbiddenError) {
                throw error;
            }

            throw new BadRequestError('Google authentication failed. Please try again.');
        }
    }

    /**
     * Alternative OAuth 2.0 flow handler (for authorization code flow)
     */
    static async handleGoogleOAuthCallback(req: Request, res: Response) {
        try {
            const { code, redirect_uri } = req.body;

            if (!code) {
                throw new BadRequestError('Authorization code is required');
            }

            if (!GOOGLE_CLIENT_ID) {
                throw new BadRequestError('Google authentication is not configured');
            }

            const client = new OAuth2Client(
                GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri
            );

            // Exchange authorization code for tokens
            const { tokens } = await client.getToken(code);

            if (!tokens.id_token) {
                throw new BadRequestError('No ID token received from Google');
            }

            // Verify the ID token
            const ticket = await client.verifyIdToken({
                idToken: tokens.id_token,
                audience: GOOGLE_CLIENT_ID,
            });

            const payload = ticket.getPayload();
            if (!payload) {
                throw new BadRequestError('Invalid Google token payload');
            }

            const { sub: googleId, email, given_name, family_name, picture, email_verified } = payload;

            if (!email || !email_verified) {
                throw new BadRequestError('Google email not verified or not available');
            }

            // Rest of the logic is similar to handleGoogleCallback
            let user = await UserService.isEmailExisting(email);

            if (user) {
                if (!user.googleId) {
                    await user.update({ googleId });
                }

                if (!user.status.emailVerified || !user.status.activated) {
                    await user.update({
                        status: {
                            ...user.status,
                            emailVerified: true,
                            activated: true,
                        },
                        ...(picture && !user.displayImage && { displayImage: picture }),
                    });
                }

                const fullUser = await UserService.viewSingleUser(user.id);
                if (fullUser.settings.isBlocked) {
                    throw new ForbiddenError('Account has been blocked. Please contact support');
                }

                if (fullUser.settings.isDeactivated) {
                    throw new ForbiddenError('Account has been deactivated. Please contact support');
                }

                user = fullUser;
            } else {
                user = await UserService.findOrCreateUserByGoogleProfile({
                    email,
                    firstName: given_name || 'User',
                    lastName: family_name || '',
                    googleId,
                    displayImage: picture,
                    status: {
                        activated: true,
                        emailVerified: true,
                        userType: 'customer',
                    },
                });
            }

            const accessToken = await AuthUtil.generateToken({ type: 'access', user });
            const refreshToken = await AuthUtil.generateToken({ type: 'refresh', user });

            await UserService.updateUserSettings(user.id, { lastLogin: new Date() });

            res.status(200).json({
                status: 'success',
                message: 'Google OAuth authentication successful',
                data: {
                    user: user.dataValues,
                    accessToken,
                    refreshToken,
                },
            });

        } catch (error) {
            logger.error('Google OAuth authentication error:', error);

            if (error instanceof BadRequestError || error instanceof ForbiddenError) {
                throw error;
            }

            throw new BadRequestError('Google OAuth authentication failed. Please try again.');
        }
    }

    /**
     * Refresh access token using refresh token
     */
    static async refreshToken(req: Request, res: Response) {
        try {
            const { refreshToken } = req.body;

            if (!refreshToken) {
                throw new BadRequestError('Refresh token is required');
            }

            // Verify the refresh token
            const payload = AuthUtil.verifyToken(refreshToken, 'refresh') as any;

            if (!payload || !payload.user || !payload.user.id) {
                throw new BadRequestError('Invalid refresh token');
            }

            // Get the user
            const user = await UserService.viewSingleUser(payload.user.id);

            if (!user) {
                throw new BadRequestError('User not found');
            }

            // Check if account is blocked or deactivated
            if (user.settings.isBlocked) {
                throw new ForbiddenError('Account has been blocked. Please contact support');
            }

            if (user.settings.isDeactivated) {
                throw new ForbiddenError('Account has been deactivated. Please contact support');
            }

            // Generate new access token
            const accessToken = await AuthUtil.generateToken({ type: 'access', user });

            res.status(200).json({
                status: 'success',
                message: 'Token refreshed successfully',
                data: {
                    accessToken,
                },
            });

        } catch (error) {
            logger.error('Token refresh error:', error);

            if (error instanceof BadRequestError || error instanceof ForbiddenError) {
                throw error;
            }

            throw new BadRequestError('Failed to refresh token. Please login again.');
        }
    }
}