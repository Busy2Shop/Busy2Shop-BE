import { AuthToken, DecodedTokenData } from '../utils/interface';
import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, NotFoundError, ForbiddenError } from '../utils/customErrors';
import User from '../models/user.model';
import UserService from '../services/user.service';
import { logger } from '../utils/logger';
import { AuthUtil, TokenCacheUtil } from '../utils/token';
// import AdminService from '../services/AdminServices/admin.service';
import Admin from '../models/admin.model';
// import { ADMIN_EMAIL } from '../utils/constants';


export interface AuthenticatedRequest extends Request {
    user: User;
}

export interface AdminAuthenticatedRequest extends Request {
    isSuperAdmin: boolean;
    email: string;
    admin: Admin;
}

// eslint-disable-next-line no-unused-vars
export type AuthenticatedAsyncController<T = AuthenticatedRequest> = (req: T, res: Response, next: NextFunction) => Promise<void>;

export function AuthenticatedController<T = AuthenticatedRequest>(
    controller: AuthenticatedAsyncController<T>
) {
    return async (req: Request, res: Response, next: NextFunction) => {
        return controller(req as T, res, next);
    };
}

export function AdminAuthenticatedController<T = AdminAuthenticatedRequest>(
    controller: AuthenticatedAsyncController<T>
) {
    return async (req: Request, res: Response, next: NextFunction) => {
        return controller(req as T, res, next);
    };
}

export const basicAuth = function (tokenType: AuthToken) {
    return async (req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer'))
            return next(new UnauthorizedError('Invalid authorization header'));

        const jwtToken = authHeader.split(' ')[1];
        if (req.method === 'GET' && req.path === '/authtoken') {
            const payload = (AuthUtil.verifyToken(jwtToken, tokenType)) as unknown as DecodedTokenData;
            const user: User | null = await UserService.viewSingleUser(payload.user.id);
            const accessToken = await AuthUtil.generateToken({ type: 'access', user });

            return res.status(200).json({
                status: 'success',
                message: 'Refresh successful',
                data: {
                    accessToken,
                },
            });
        }

        const payload = AuthUtil.verifyToken(jwtToken, tokenType);

        const tokenData = payload as unknown as DecodedTokenData;
        logger.payload('Token data', tokenData);
        tokenData.token = jwtToken;

        if (tokenData.tokenType !== tokenType) {
            return next(new UnauthorizedError('You are not authorized to perform this action'));
        }

        const key = `${tokenType}_token:${tokenData.user.id}`;
        const token = await TokenCacheUtil.getTokenFromCache(key);

        if (token !== jwtToken) {
            return next(new UnauthorizedError('You are not authorized to perform this action'));
        }

        const user: User | null = await UserService.viewSingleUser(tokenData.user.id);

        if (!user) {
            return next(new NotFoundError('Oops User not found'));
        }

        if (user.settings.isBlocked) {
            throw new ForbiddenError('Oops! Your account has been blocked. Please contact support');
        }

        if (user.settings.isDeactivated) {
            throw new ForbiddenError('Oops! This account has been deactivated by the owner. Please contact support');
        }

        (req as AuthenticatedRequest).user = user;

        logger.authorized('User authorized');

        next();
    };
};

// export const adminAuth = function (tokenType: ENCRYPTEDTOKEN) {
//     return async (req: Request, res: Response, next: NextFunction) => {
//         const authHeader = req.headers.authorization;
//         if (!authHeader?.startsWith('Bearer'))
//             return next(new UnauthorizedError('Invalid authorization header'));

//         const jwtToken = authHeader.split(' ')[1];

//         const payload = AuthUtil.verifyAdminToken(jwtToken, tokenType);

//         const tokenData = payload as unknown as Omit<DecodedTokenData, 'user'>;
//         logger.payload('Admin Token data', tokenData);

//         if (tokenData.tokenType !== 'admin') {
//             return next(new UnauthorizedError('You are not authorized to perform this action'));
//         }

//         const key = `${tokenType}_token:${tokenData.authKey}`;
//         const token = await TokenCacheUtil.getTokenFromCache(key);

//         if (token !== jwtToken) {
//             return next(new UnauthorizedError('You are not authorized to perform this action'));
//         }

//         let emailToUse = (tokenData.authKey as string).toLowerCase().trim();
//         if ((tokenData.authKey as string) !== ADMIN_EMAIL) {
//             const admin = await AdminService.getAdminByEmail(tokenData.authKey as string);
//             emailToUse = admin.email;
//             (req as AdminAuthenticatedRequest).admin = admin;
//             (req as AdminAuthenticatedRequest).isSuperAdmin = admin.isSuperAdmin;
//         } else {
//             (req as AdminAuthenticatedRequest).isSuperAdmin = true;
//         }

//         (req as AdminAuthenticatedRequest).email = emailToUse;


//         logger.authorized('User authorized');

//         next();
//     };
// };

// Add custom middleware to allow optional authentication
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
    // check if the request has an authorization header and it is not an iAdmin request
    if (req.headers.authorization && !req.headers['x-iadmin-access'] && req.headers['x-iadmin-access'] !== 'true') {
        return basicAuth('access')(req, res, next);
    }
    return next();
};
