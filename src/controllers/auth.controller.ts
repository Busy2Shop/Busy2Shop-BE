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
import { WEBSITE_URL } from '../utils/constants';
import { Transaction } from 'sequelize';
import CloudinaryClientConfig from '../clients/cloudinary.config';

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

        const userId = req.user.id;
        // Validate required fields
        await this.validateSignupData({
            firstName,
            lastName,
            password,
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

    static async googleSignIn(req: AuthenticatedRequest, res: Response) {
        try {
            // The user object is attached to the request by Passport
            const user = req.user;

            if (!user) {
                return res.redirect(`${WEBSITE_URL}/login?error=Authentication failed`);
            }

            // Generate tokens for the user
            const accessToken = await AuthUtil.generateToken({
                type: 'access',
                user: user,
            });

            const refreshToken = await AuthUtil.generateToken({
                type: 'refresh',
                user: user,
            });

            // Redirect to the frontend with tokens
            return res.redirect(
                `${WEBSITE_URL}/auth/social-callback?accessToken=${accessToken}&refreshToken=${refreshToken}`,
            );
        } catch (error) {
            logger.error('Google sign-in error:', error);
            return res.redirect(`${WEBSITE_URL}/login?error=Authentication failed`);
        }
    }
}
