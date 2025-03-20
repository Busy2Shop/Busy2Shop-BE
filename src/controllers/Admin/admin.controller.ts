import { Request, Response } from 'express';
import AdminService from '../../services/AdminServices/admin.service';
import { AdminAuthenticatedRequest } from '../../middlewares/authMiddleware';
import { BadRequestError, ForbiddenError } from '../../utils/customErrors';
import { ADMIN_EMAIL } from '../../utils/constants';
import { AuthUtil } from '../../utils/token';
import { emailService, EmailTemplate } from '../../utils/Email';
import UserService from '../../services/user.service';
import { IBlockMeta } from '../../models/userSettings.model';
import { AdminType } from '../../models/admin.model';

export default class AdminController {
    // static async getUserStats(req: Request, res: Response) {
    //     const stats = await AdminService.getUserStats();
    //     res.status(200).json({
    //         status: 'success',
    //         message: 'User stats retrieved successfully',
    //         data: stats,
    //     });
    // }

    static async loginSuperAdmin(req: Request, res: Response) {
        const { email } = req.body;

        let emailToUse = email.toLowerCase().trim();
        let firstName = 'Owner';

        if (email !== ADMIN_EMAIL) {
            const checkAdmin = await AdminService.getAdminByEmail(email);
            emailToUse = checkAdmin.email;
            firstName = checkAdmin.name.split(' ')[0];
        }

        const otpCode = await AuthUtil.generateCode({ type: 'adminlogin', identifier: emailToUse, expiry: 60 * 10 });

        const templateData = {
            otpCode,
            name: firstName,
        };
        
        // Send email with OTP
        await emailService.send({
            email: emailToUse,
            from: 'auth',
            subject: 'Admin Login Verification',
            html: await new EmailTemplate().adminLogin({ otpCode, name: firstName }),
            isPostmarkTemplate: true,
            postMarkTemplateAlias: 'verify-email',
            postmarkInfo: [{
                postMarkTemplateData: templateData,
                recipientEmail: email,
            }],
        });

        res.status(200).json({
            status: 'success',
            message: 'Verification code sent to admin email',
        });
    }

    static async verifySuperAdminLogin(req: Request, res: Response) {
        const { email, otpCode } = req.body;

        let emailToUse = email.toLowerCase().trim();
        let adminData: {
            email: string;
            name: string;
            adminType: AdminType;
            supermarketId: string | null;
        } = {
            email: emailToUse,
            name: 'Owner',
            adminType: AdminType.SUPER_ADMIN,
            supermarketId: null,
        };

        if (email !== ADMIN_EMAIL) {
            const checkAdmin = await AdminService.getAdminByEmail(email);
            emailToUse = checkAdmin.email;
            adminData = {
                email: checkAdmin.email,
                name: checkAdmin.name,
                adminType: checkAdmin.adminType,
                supermarketId: checkAdmin.supermarketId || null,
            };
        }

        const validCode = await AuthUtil.compareAdminCode({ identifier: emailToUse, tokenType: 'adminlogin', token: otpCode });
        if (!validCode) {
            throw new BadRequestError('Invalid verification code');
        }

        // Generate admin token
        const adminToken = await AuthUtil.generateAdminToken({ type: 'admin', identifier: emailToUse });

        res.status(200).json({
            status: 'success',
            message: 'Admin login successful',
            data: { adminToken, admin: adminData },
        });
    }

    static async createAdmin(req: AdminAuthenticatedRequest, res: Response) {
        const { name, email, adminType, supermarketId } = req.body;

        // Check permissions - only super admins can create new admins
        if (req.adminType !== AdminType.SUPER_ADMIN) {
            throw new ForbiddenError('Only super admin can create new admins');
        }

        if (email === ADMIN_EMAIL) {
            throw new BadRequestError('Admin with this email already exists');
        }

        // Create admin data object
        const adminData: { 
            name: string; 
            email: string; 
            adminType: AdminType; 
            supermarketId?: string 
        } = { 
            name, 
            email, 
            adminType };

        // If creating a vendor, require supermarketId
        if (adminType === AdminType.VENDOR) {
            if (!supermarketId) {
                throw new BadRequestError('Supermarket ID is required for vendor accounts');
            }
            adminData.supermarketId = supermarketId;
        }

        const newAdmin = await AdminService.createAdmin(adminData);
        
        res.status(201).json({
            status: 'success',
            message: 'New admin created successfully',
            data: newAdmin,
        });
    }

    static async getAllAdmins(req: AdminAuthenticatedRequest, res: Response) {
        // Only super admins and regular admins can view all admins
        if (req.adminType === AdminType.VENDOR) {
            throw new ForbiddenError('Vendors cannot access admin list');
        }

        const admins = await AdminService.getAllAdmins();
        
        res.status(200).json({
            status: 'success',
            message: 'Admins retrieved successfully',
            data: admins,
        });
    }

    static async deleteAdmin(req: AdminAuthenticatedRequest, res: Response) {
        const { adminId } = req.body;

        if (req.adminType !== AdminType.SUPER_ADMIN) {
            throw new ForbiddenError('Only super admin can delete admins');
        }

        await AdminService.deleteAdmin(adminId, req.adminType);

        res.status(200).json({
            status: 'success',
            message: 'Admin deleted successfully',
        });
    }

    static async blockUser(req: AdminAuthenticatedRequest, res: Response) {
        const { userId, reason } = req.body;

        // Add a permission check
        if (req.adminType === AdminType.VENDOR) {
            throw new ForbiddenError('Vendors cannot manage user accounts');
        }

        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const user = await UserService.viewSingleUser(userId);
        
        // Check if the user is already blocked
        if (user.settings.isBlocked) {
            throw new BadRequestError('User is already blocked');
        }

        // Update user settings to block the user
        const blockMeta: IBlockMeta = user.settings.meta || { blockHistory: [], unblockHistory: [] };
        
        // Add block entry to history
        const blockDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        blockMeta.blockHistory.push({ [blockDate]: reason || 'Blocked by admin' });

        await UserService.updateUserSettings(userId, { 
            isBlocked: true,
            meta: blockMeta,
        });

        res.status(200).json({
            status: 'success',
            message: 'User blocked successfully',
        });
    }

    static async unblockUser(req: AdminAuthenticatedRequest, res: Response) {
        const { userId, reason } = req.body;

        // Add a permission check
        if (req.adminType === AdminType.VENDOR) {
            throw new ForbiddenError('Vendors cannot manage user accounts');
        }

        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const user = await UserService.viewSingleUser(userId);
        
        // Check if the user is already unblocked
        if (!user.settings.isBlocked) {
            throw new BadRequestError('User is not blocked');
        }

        // Update user settings to unblock the user
        const blockMeta: IBlockMeta = user.settings.meta || { blockHistory: [], unblockHistory: [] };
        
        // Add unblock entry to history
        const unblockDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        blockMeta.unblockHistory.push({ [unblockDate]: reason || 'Unblocked by admin' });

        await UserService.updateUserSettings(userId, { 
            isBlocked: false,
            meta: blockMeta,
        });

        res.status(200).json({
            status: 'success',
            message: 'User unblocked successfully',
        });
    }

    static async deactivateUser(req: AdminAuthenticatedRequest, res: Response) {
        const { userId } = req.body;

        // Add a permission check
        if (req.adminType === AdminType.VENDOR) {
            throw new ForbiddenError('Vendors cannot manage user accounts');
        }

        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const user = await UserService.viewSingleUser(userId);
        
        // Check if the user is already deactivated
        if (user.settings.isDeactivated) {
            throw new BadRequestError('User is already deactivated');
        }

        // Update user settings to deactivate the user
        await UserService.updateUserSettings(userId, { isDeactivated: true });

        res.status(200).json({
            status: 'success',
            message: 'User deactivated successfully',
        });
    }

    static async activateUser(req: AdminAuthenticatedRequest, res: Response) {
        const { userId } = req.body;

        // Add a permission check
        if (req.adminType === AdminType.VENDOR) {
            throw new ForbiddenError('Vendors cannot manage user accounts');
        }

        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const user = await UserService.viewSingleUser(userId);
        
        // Check if the user is already activated
        if (!user.settings.isDeactivated) {
            throw new BadRequestError('User is already activated');
        }

        // Update user settings to activate the user
        await UserService.updateUserSettings(userId, { isDeactivated: false });

        res.status(200).json({
            status: 'success',
            message: 'User activated successfully',
        });
    }

    static async getAllUsers(req: AdminAuthenticatedRequest, res: Response) {
        const { page, size, q, isBlocked, isDeactivated, userType } = req.query;
        const queryParams: Record<string, unknown> = {};

        // Add a permission check
        if (req.adminType === AdminType.VENDOR) {
            throw new ForbiddenError('Vendors cannot manage user accounts');
        }

        if (page && size) {
            queryParams.page = Number(page);
            queryParams.size = Number(size);
        }

        // Add filters for blocked and deactivated users
        if (isBlocked !== undefined) {
            queryParams.isBlocked = isBlocked === 'true';
        }

        if (isDeactivated !== undefined) {
            queryParams.isDeactivated = isDeactivated === 'true';
        }

        // Add filter for user type (agent, user)
        if (userType && ['agent', 'customer'].includes(userType as string)) {
            queryParams.userType = userType;
        }

        // Add the search query if provided
        if (q) {
            queryParams.q = q as string;
        }

        const users = await UserService.viewUsers(queryParams);
        res.status(200).json({
            status: 'success',
            message: 'Users retrieved successfully',
            data: { ...users },
        });
    }

    static async getUser(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;

        // Add a permission check
        if (req.adminType === AdminType.VENDOR) {
            throw new ForbiddenError('Vendors cannot manage user accounts');
        }

        if (!id) {
            throw new BadRequestError('User ID is required');
        }

        const user = await UserService.viewSingleUser(id);

        res.status(200).json({
            status: 'success',
            message: 'User retrieved successfully',
            data: user,
        });
    }
}