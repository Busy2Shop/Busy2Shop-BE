import { Request, Response } from 'express';
import AdminService from '../../services/AdminServices/admin.service';
import { AdminAuthenticatedRequest } from '../../middlewares/authMiddleware';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/customErrors';
import { ADMIN_EMAIL } from '../../utils/constants';
import { AuthUtil } from '../../utils/token';
import { emailService, EmailTemplate } from '../../utils/Email';
import UserService, { IViewUsersQuery } from '../../services/user.service';
import { IBlockMeta, IAgentMeta } from '../../models/userSettings.model';
import { Database } from '../../models';
import { QueryTypes } from 'sequelize';
import Order from '../../models/order.model';
import ShoppingList from '../../models/shoppingList.model';
import ShoppingListItem from '../../models/shoppingListItem.model';
import Market from '../../models/market.model';
import AgentLocation from '../../models/agentLocation.model';
import UserAddress from '../../models/userAddress.model';

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

        const otpCode = await AuthUtil.generateCode({
            type: 'adminlogin',
            identifier: emailToUse,
            expiry: 60 * 10,
        });
        

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
            postmarkInfo: [
                {
                    postMarkTemplateData: templateData,
                    recipientEmail: email,
                },
            ],
        });

        res.status(200).json({
            status: 'success',
            message: 'Verification code sent to admin email',
        });
    }

    static async verifySuperAdminLogin(req: Request, res: Response) {
        const { email, otpCode } = req.body;

        let emailToUse = email.toLowerCase().trim();
        let adminData = { email: emailToUse, name: 'Owner', isSuperAdmin: true };
        if (email !== ADMIN_EMAIL) {
            const checkAdmin = await AdminService.getAdminByEmail(email);
            emailToUse = checkAdmin.email;
            adminData = checkAdmin;
        }

        const validCode = await AuthUtil.compareAdminCode({
            identifier: emailToUse,
            tokenType: 'adminlogin',
            token: otpCode,
        });
        if (!validCode) {
            throw new BadRequestError('Invalid verification code');
        }

        // Generate admin token
        const adminToken = await AuthUtil.generateAdminToken({
            type: 'admin',
            identifier: emailToUse,
        });

        res.status(200).json({
            status: 'success',
            message: 'Admin login successful',
            data: { adminToken, admin: adminData },
        });
    }

    static async createAdmin(req: AdminAuthenticatedRequest, res: Response) {
        const { name, email, isSuperAdmin } = req.body;

        if (!req.isSuperAdmin) {
            throw new ForbiddenError('Only super admin can create new admins');
        }

        if (email === ADMIN_EMAIL) {
            throw new BadRequestError('Admin with this email already exists');
        }

        const newAdmin = await AdminService.createAdmin({ name, email, isSuperAdmin });

        res.status(201).json({
            status: 'success',
            message: 'New admin created successfully',
            data: newAdmin,
        });
    }

    static async getAllAdmins(req: AdminAuthenticatedRequest, res: Response) {
        const page = req.query.page ? Number(req.query.page) : 1;
        const size = req.query.size ? Number(req.query.size) : 10;
        const { q, isSuperAdmin } = req.query;

        const queryParams: Record<string, unknown> = {
            page,
            size,
        };

        if (q) queryParams.q = q as string;

        if (isSuperAdmin !== undefined) {
            queryParams.isSuperAdmin = isSuperAdmin === 'true';
        }

        const result = await AdminService.getAllAdmins(queryParams);

        res.status(200).json({
            status: 'success',
            message: 'Admins retrieved successfully',
            data: { ...result },
        });
    }

    static async deleteAdmin(req: AdminAuthenticatedRequest, res: Response) {
        const { adminId } = req.body;

        if (!adminId) {
            throw new BadRequestError('Admin ID is required');
        }

        if (!req.isSuperAdmin) {
            throw new ForbiddenError('Only super admin can delete admins');
        }

        await AdminService.deleteAdmin(adminId);

        res.status(200).json({
            status: 'success',
            message: 'Admin deleted successfully',
        });
    }

    static async blockUser(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { reason } = req.body;
        const userId = req.body.userId || id;

        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        if (!reason || reason.trim().length === 0) {
            throw new BadRequestError('Block reason is required');
        }

        const user = await UserService.viewSingleUser(userId);
        const currentSettings = user.settings;

        if (currentSettings.isBlocked) {
            throw new BadRequestError('User is already blocked');
        }

        // Update block status and add to history
        const currentMeta = (currentSettings.meta as IBlockMeta) || {
            blockHistory: [],
            unblockHistory: [],
        };

        const today = new Date().toISOString().split('T')[0];
        currentMeta.blockHistory.push({ [today]: reason.trim() });

        await UserService.updateUserSettings(userId, {
            isBlocked: true,
            meta: currentMeta,
        });

        const updatedUser = await UserService.viewSingleUser(userId);

        res.status(200).json({
            status: 'success',
            message: 'User blocked successfully',
            data: updatedUser,
        });
    }

    static async unblockUser(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { reason } = req.body;
        const userId = req.body.userId || id;

        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        if (!reason || reason.trim().length === 0) {
            throw new BadRequestError('Unblock reason is required');
        }

        const user = await UserService.viewSingleUser(userId);
        const currentSettings = user.settings;

        if (!currentSettings.isBlocked) {
            throw new BadRequestError('User is not blocked');
        }

        // Update block status and add to history
        const currentMeta = (currentSettings.meta as IBlockMeta) || {
            blockHistory: [],
            unblockHistory: [],
        };

        const today = new Date().toISOString().split('T')[0];
        currentMeta.unblockHistory.push({ [today]: reason.trim() });

        await UserService.updateUserSettings(userId, {
            isBlocked: false,
            meta: currentMeta,
        });

        const updatedUser = await UserService.viewSingleUser(userId);

        res.status(200).json({
            status: 'success',
            message: 'User unblocked successfully',
            data: updatedUser,
        });
    }

    static async deactivateUser(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { reason } = req.body;
        const userId = req.body.userId || id;

        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        if (!reason || reason.trim().length === 0) {
            throw new BadRequestError('Deactivation reason is required');
        }

        const user = await UserService.viewSingleUser(userId);
        const currentSettings = user.settings;

        if (currentSettings.isDeactivated) {
            throw new BadRequestError('User is already deactivated');
        }

        await UserService.updateUserSettings(userId, {
            isDeactivated: true,
        });

        const updatedUser = await UserService.viewSingleUser(userId);

        res.status(200).json({
            status: 'success',
            message: 'User deactivated successfully',
            data: updatedUser,
        });
    }

    static async activateUser(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const userId = req.body.userId || id;

        if (!userId) {
            throw new BadRequestError('User ID is required');
        }

        const user = await UserService.viewSingleUser(userId);
        const currentSettings = user.settings;

        if (!currentSettings.isDeactivated) {
            throw new BadRequestError('User is already active');
        }

        await UserService.updateUserSettings(userId, {
            isDeactivated: false,
        });

        const updatedUser = await UserService.viewSingleUser(userId);

        res.status(200).json({
            status: 'success',
            message: 'User activated successfully',
            data: updatedUser,
        });
    }

    static async getAllUsers(req: AdminAuthenticatedRequest, res: Response) {
        const { page, size, q, isBlocked, isDeactivated, userType } = req.query;
        const queryParams: IViewUsersQuery = {};

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

        // Add filter for user type (agent, customer)
        if (userType && ['agent', 'customer'].includes(userType as string)) {
            queryParams.userType = userType as string;
        }

        // Add the search query if provided
        if (q) {
            queryParams.q = q as string;
        }

        const result = await UserService.viewUsers(queryParams);
        res.status(200).json({
            status: 'success',
            message: 'Users retrieved successfully',
            data: {
                users: result.users,
                pagination: {
                    total: result.count,
                    page: queryParams.page || 1,
                    size: queryParams.size || result.count,
                    totalPages: result.totalPages || 1,
                },
            },
        });
    }

    static async getUser(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;

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

    static async getAllCustomers(req: AdminAuthenticatedRequest, res: Response) {
        // First, ensure all customer users have UserSettings
        await AdminController.ensureUserSettingsExist('customer');

        const queryData: IViewUsersQuery = {
            page: req.query.page ? parseInt(req.query.page as string) : undefined,
            size: req.query.size ? parseInt(req.query.size as string) : undefined,
            q: req.query.q as string,
            isBlocked: req.query.isBlocked ? req.query.isBlocked === 'true' : undefined,
            isDeactivated: req.query.isDeactivated ? req.query.isDeactivated === 'true' : undefined,
            userType: 'customer',
        };

        const result = await UserService.viewUsers(queryData);

        res.status(200).json({
            status: 'success',
            message: 'Users retrieved successfully',
            data: {
                users: result.users,
                pagination: {
                    total: result.count,
                    page: queryData.page || 1,
                    size: queryData.size || result.count,
                    totalPages: result.totalPages || 1,
                },
            },
        });
    }

    /**
     * Helper method to ensure all users of a given type have UserSettings
     */
    private static async ensureUserSettingsExist(userType: string) {
        console.log(`🔧 Ensuring UserSettings exist for ${userType} users`);
        
        const usersWithoutSettings = await Database.query(`
            SELECT u.id 
            FROM "Users" u
            LEFT JOIN "UserSettings" us ON u.id = us."userId"
            WHERE u.status->>'userType' = :userType
            AND us.id IS NULL
        `, {
            replacements: { userType },
            type: QueryTypes.SELECT,
        }) as Array<{id: string}>;

        console.log(`Found ${usersWithoutSettings.length} ${userType} users without UserSettings`);

        if (usersWithoutSettings.length > 0) {
            // Create UserSettings for users who don't have them
            const today = new Date().toISOString().split('T')[0];
            for (const user of usersWithoutSettings) {
                await UserService.createOrUpdateUserSettings(user.id, {
                    joinDate: today,
                    isBlocked: false,
                    isDeactivated: false,
                    isKycVerified: false,
                    ...(userType === 'agent' && {
                        agentMetaData: {
                            nin: '',
                            images: [],
                            currentStatus: 'offline',
                            lastStatusUpdate: new Date().toISOString(),
                            isAcceptingOrders: false,
                        },
                    }),
                });
            }
        }
    }

    static async getAllAgents(req: AdminAuthenticatedRequest, res: Response) {
        // First, ensure all agent users have UserSettings
        await AdminController.ensureUserSettingsExist('agent');
        
        const queryData: IViewUsersQuery = {
            page: req.query.page ? parseInt(req.query.page as string) : undefined,
            size: req.query.size ? parseInt(req.query.size as string) : undefined,
            q: req.query.q as string,
            isBlocked: req.query.isBlocked ? req.query.isBlocked === 'true' : undefined,
            isDeactivated: req.query.isDeactivated ? req.query.isDeactivated === 'true' : undefined,
            userType: 'agent',
        };

        const result = await UserService.viewUsers(queryData);

        res.status(200).json({
            status: 'success',
            message: 'Agents retrieved successfully',
            data: {
                agents: result.users,
                pagination: {
                    total: result.count,
                    page: queryData.page || 1,
                    size: queryData.size || result.count,
                    totalPages: result.totalPages || 1,
                },
            },
        });
    }

    static async approveAgentKyc(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;

        const user = await UserService.viewSingleUser(id);

        if (user.status?.userType !== 'agent') {
            throw new BadRequestError('User is not an agent');
        }

        const currentSettings = user.settings;

        if (currentSettings.isKycVerified) {
            throw new BadRequestError('Agent KYC is already approved');
        }

        await UserService.updateUserSettings(id, {
            isKycVerified: true,
        });

        const updatedUser = await UserService.viewSingleUser(id);

        res.status(200).json({
            status: 'success',
            message: 'Agent KYC approved successfully',
            data: updatedUser,
        });
    }

    static async rejectAgentKyc(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { reason } = req.body;

        if (!reason || reason.trim().length === 0) {
            throw new BadRequestError('Rejection reason is required');
        }

        const user = await UserService.viewSingleUser(id);

        if (user.status?.userType !== 'agent') {
            throw new BadRequestError('User is not an agent');
        }

        await UserService.updateUserSettings(id, {
            isKycVerified: false,
        });

        const updatedUser = await UserService.viewSingleUser(id);

        res.status(200).json({
            status: 'success',
            message: 'Agent KYC rejected successfully',
            data: updatedUser,
        });
    }

    static async getUserStats(req: AdminAuthenticatedRequest, res: Response) {
        try {
            const { userType } = req.query;
            const type = userType as string || 'customer';

            // Use direct database queries for accurate counts
            const totalCount = await Database.query(`
                SELECT COUNT(*) as count
                FROM "Users" u
                WHERE u.status->>'userType' = :userType
            `, {
                replacements: { userType: type },
                type: QueryTypes.SELECT,
            }) as [{count: string}];

            const blockedCount = await Database.query(`
                SELECT COUNT(*) as count
                FROM "Users" u
                INNER JOIN "UserSettings" us ON u.id = us."userId"
                WHERE u.status->>'userType' = :userType
                AND us."isBlocked" = true
            `, {
                replacements: { userType: type },
                type: QueryTypes.SELECT,
            }) as [{count: string}];

            const deactivatedCount = await Database.query(`
                SELECT COUNT(*) as count
                FROM "Users" u
                INNER JOIN "UserSettings" us ON u.id = us."userId"
                WHERE u.status->>'userType' = :userType
                AND us."isDeactivated" = true
            `, {
                replacements: { userType: type },
                type: QueryTypes.SELECT,
            }) as [{count: string}];

            const total = parseInt(totalCount[0]?.count || '0');
            const blocked = parseInt(blockedCount[0]?.count || '0');
            const deactivated = parseInt(deactivatedCount[0]?.count || '0');

            // For agents, get KYC stats
            let kycStats = null;
            if (type === 'agent') {
                const verifiedCount = await Database.query(`
                    SELECT COUNT(*) as count
                    FROM "Users" u
                    INNER JOIN "UserSettings" us ON u.id = us."userId"
                    WHERE u.status->>'userType' = 'agent'
                    AND us."isKycVerified" = true
                `, {
                    type: QueryTypes.SELECT,
                }) as [{count: string}];

                const pendingCount = await Database.query(`
                    SELECT COUNT(*) as count
                    FROM "Users" u
                    INNER JOIN "UserSettings" us ON u.id = us."userId"
                    WHERE u.status->>'userType' = 'agent'
                    AND us."isKycVerified" = false
                `, {
                    type: QueryTypes.SELECT,
                }) as [{count: string}];

                const verified = parseInt(verifiedCount[0]?.count || '0');
                const pending = parseInt(pendingCount[0]?.count || '0');

                kycStats = {
                    verified,
                    pending,
                    verificationRate: total > 0 ? Math.round((verified / total) * 100) : 0,
                };
            }

            const stats = {
                total,
                active: total - blocked - deactivated,
                blocked,
                deactivated,
                ...(kycStats && { kyc: kycStats }),
            };

            res.status(200).json({
                status: 'success',
                message: 'User statistics retrieved successfully',
                data: stats,
            });
        } catch (error) {
            console.error('Error in getUserStats:', error);
            throw error;
        }
    }

    static async getUserActivity(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { page = 1, size = 10, type } = req.query;

        const user = await UserService.viewSingleUser(id);

        // Handle special types for performance and analytics
        if (type === 'performance') {
            return AdminController.getAgentPerformanceMetrics(req, res);
        }

        if (type === 'analytics') {
            return AdminController.getAgentAnalytics(req, res);
        }

        // Default activity behavior
        const activities = [];
        
        // Get shopping lists
        const shoppingLists = await user.$get('shoppingLists', {
            limit: parseInt(size as string),
            offset: (parseInt(page as string) - 1) * parseInt(size as string),
            order: [['createdAt', 'DESC']],
        });

        // Get actual orders for better activity tracking
        let orders: Order[] = [];
        if (user.status.userType === 'customer') {
            orders = await Order.findAll({
                where: { customerId: id },
                include: [{ model: ShoppingList, as: 'shoppingList', attributes: ['name'] }],
                limit: parseInt(size as string),
                offset: (parseInt(page as string) - 1) * parseInt(size as string),
                order: [['createdAt', 'DESC']]
            });
        } else if (user.status.userType === 'agent') {
            orders = await Order.findAll({
                where: { agentId: id },
                include: [{ model: ShoppingList, as: 'shoppingList', attributes: ['name'] }],
                limit: parseInt(size as string),
                offset: (parseInt(page as string) - 1) * parseInt(size as string),
                order: [['createdAt', 'DESC']]
            });
        }

        // Add order activities
        activities.push(...orders.map(order => ({
            id: order.id,
            type: user.status.userType === 'agent' ? 'order_assigned' : 'order_placed',
            description: user.status.userType === 'agent' 
                ? `Assigned order: ${order.shoppingList?.name || 'Shopping List'}`
                : `Placed order: ${order.shoppingList?.name || 'Shopping List'}`,
            status: order.status,
            date: order.createdAt,
        })));

        // Add shopping list activities
        activities.push(...shoppingLists.map(list => ({
            id: list.id,
            type: 'shopping_list_created',
            description: `Created shopping list: ${list.name}`,
            status: list.status,
            date: list.createdAt,
        })));

        // Sort activities by date
        activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        res.status(200).json({
            status: 'success',
            message: 'User activity retrieved successfully',
            data: {
                user: {
                    id: user.id,
                    name: user.fullName,
                    email: user.email,
                    userType: user.status.userType,
                },
                activities: activities.slice(0, parseInt(size as string)),
                pagination: {
                    page: parseInt(page as string),
                    size: parseInt(size as string),
                    total: activities.length,
                    totalPages: Math.ceil(activities.length / parseInt(size as string)),
                },
            },
        });
    }

    static async updateUserProfile(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { firstName, lastName, phone, gender } = req.body;

        const user = await UserService.viewSingleUser(id);

        const updateData: any = {};
        if (firstName) updateData.firstName = firstName;
        if (lastName) updateData.lastName = lastName;
        if (phone) updateData.phone = phone;
        if (gender) updateData.gender = gender;

        const updatedUser = await UserService.updateUser(user, updateData);

        res.status(200).json({
            status: 'success',
            message: 'User profile updated successfully',
            data: updatedUser,
        });
    }

    static async deleteUser(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { reason } = req.body;

        if (!reason || reason.trim().length === 0) {
            throw new BadRequestError('Deletion reason is required');
        }

        const user = await UserService.viewSingleUser(id);

        await UserService.updateUserSettings(id, {
            isDeactivated: true,
        });

        res.status(200).json({
            status: 'success',
            message: 'User account deleted successfully',
            data: null,
        });
    }

    static async bulkUserAction(req: AdminAuthenticatedRequest, res: Response) {
        const { userIds, action, reason } = req.body;

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            throw new BadRequestError('User IDs array is required');
        }

        if (!action || !['block', 'unblock', 'activate', 'deactivate', 'approve_kyc', 'reject_kyc'].includes(action)) {
            throw new BadRequestError('Valid action is required (block, unblock, activate, deactivate, approve_kyc, reject_kyc)');
        }

        if ((action === 'block' || action === 'deactivate' || action === 'reject_kyc') && !reason) {
            throw new BadRequestError('Reason is required for block/deactivate/reject_kyc actions');
        }

        const results = [];
        const errors = [];

        for (const userId of userIds) {
            try {
                const user = await UserService.viewSingleUser(userId);
                let updateData: any = {};

                switch (action) {
                    case 'block':
                        if (!user.settings.isBlocked) {
                            const currentMeta = (user.settings.meta as IBlockMeta) || {
                                blockHistory: [],
                                unblockHistory: [],
                            };
                            const today = new Date().toISOString().split('T')[0];
                            currentMeta.blockHistory.push({ [today]: reason });
                            updateData = { isBlocked: true, meta: currentMeta };
                        }
                        break;
                    case 'unblock':
                        if (user.settings.isBlocked) {
                            const currentMeta = (user.settings.meta as IBlockMeta) || {
                                blockHistory: [],
                                unblockHistory: [],
                            };
                            const today = new Date().toISOString().split('T')[0];
                            currentMeta.unblockHistory.push({ [today]: reason || 'Bulk unblock action' });
                            updateData = { isBlocked: false, meta: currentMeta };
                        }
                        break;
                    case 'activate':
                        if (user.settings.isDeactivated) {
                            updateData = { isDeactivated: false };
                        }
                        break;
                    case 'deactivate':
                        if (!user.settings.isDeactivated) {
                            updateData = { isDeactivated: true };
                        }
                        break;
                    case 'approve_kyc':
                        if (user.status.userType === 'agent' && !user.settings.isKycVerified) {
                            updateData = { isKycVerified: true };
                        }
                        break;
                    case 'reject_kyc':
                        if (user.status.userType === 'agent' && user.settings.isKycVerified) {
                            updateData = { isKycVerified: false };
                        }
                        break;
                }

                if (Object.keys(updateData).length > 0) {
                    await UserService.updateUserSettings(userId, updateData);
                }

                results.push({
                    userId,
                    success: true,
                    message: `User ${action}ed successfully`,
                });
            } catch (error: any) {
                errors.push({
                    userId,
                    success: false,
                    error: error.message,
                });
            }
        }

        res.status(200).json({
            status: 'success',
            message: `Bulk ${action} completed`,
            data: {
                successful: results,
                failed: errors,
                summary: {
                    total: userIds.length,
                    successful: results.length,
                    failed: errors.length,
                },
            },
        });
    }

    static async getUserOrders(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { page = 1, size = 10, status } = req.query;

        const user = await UserService.viewSingleUser(id);

        // Get actual orders based on user type
        let orders: any[] = [];
        let totalCount = 0;

        const whereCondition: any = {};
        if (status) {
            whereCondition.status = status;
        }

        if (user.status.userType === 'customer') {
            // Get orders where user is the customer
            const result = await Order.findAndCountAll({
                where: {
                    customerId: id,
                    ...whereCondition
                },
                include: [{
                    model: ShoppingList,
                    as: 'shoppingList',
                    attributes: ['id', 'name', 'notes', 'estimatedTotal'],
                    include: [{
                        model: ShoppingListItem,
                        as: 'items',
                        attributes: ['id', 'name', 'quantity', 'unit', 'notes']
                    }]
                }],
                limit: parseInt(size as string),
                offset: (parseInt(page as string) - 1) * parseInt(size as string),
                order: [['createdAt', 'DESC']],
            });

            orders = result.rows.map(order => ({
                id: order.id,
                orderNumber: order.orderNumber,
                status: order.status,
                totalAmount: order.totalAmount,
                serviceFee: order.serviceFee,
                deliveryFee: order.deliveryFee,
                deliveryAddress: order.deliveryAddress,
                customerNotes: order.customerNotes,
                agentNotes: order.agentNotes,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt,
                completedAt: order.completedAt,
                shoppingList: order.shoppingList,
                items: order.shoppingList?.items || []
            }));

            totalCount = result.count;
        } else if (user.status.userType === 'agent') {
            // Get orders assigned to the agent
            const result = await Order.findAndCountAll({
                where: {
                    agentId: id,
                    ...whereCondition
                },
                include: [{
                    model: ShoppingList,
                    as: 'shoppingList',
                    attributes: ['id', 'name', 'notes', 'estimatedTotal'],
                    include: [{
                        model: ShoppingListItem,
                        as: 'items',
                        attributes: ['id', 'name', 'quantity', 'unit', 'notes']
                    }]
                }],
                limit: parseInt(size as string),
                offset: (parseInt(page as string) - 1) * parseInt(size as string),
                order: [['createdAt', 'DESC']],
            });

            orders = result.rows.map(order => ({
                id: order.id,
                orderNumber: order.orderNumber,
                status: order.status,
                totalAmount: order.totalAmount,
                serviceFee: order.serviceFee,
                deliveryFee: order.deliveryFee,
                deliveryAddress: order.deliveryAddress,
                customerNotes: order.customerNotes,
                agentNotes: order.agentNotes,
                createdAt: order.createdAt,
                updatedAt: order.updatedAt,
                acceptedAt: order.acceptedAt,
                completedAt: order.completedAt,
                shoppingList: order.shoppingList,
                items: order.shoppingList?.items || []
            }));

            totalCount = result.count;
        }

        res.status(200).json({
            status: 'success',
            message: 'User orders retrieved successfully',
            data: {
                orders,
                pagination: {
                    page: parseInt(page as string),
                    size: parseInt(size as string),
                    total: totalCount,
                    totalPages: Math.ceil(totalCount / parseInt(size as string)),
                },
            },
        });
    }

    static async getUserShoppingLists(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { page = 1, size = 10, status } = req.query;

        const user = await UserService.viewSingleUser(id);
        
        const whereCondition: any = {};
        if (status) {
            whereCondition.status = status;
        }

        const shoppingLists = await user.$get('shoppingLists', {
            where: whereCondition,
            include: [{
                model: ShoppingListItem,
                as: 'items',
            }, {
                model: Market,
                as: 'market',
                attributes: ['id', 'name', 'address'],
            }],
            limit: parseInt(size as string),
            offset: (parseInt(page as string) - 1) * parseInt(size as string),
            order: [['createdAt', 'DESC']],
        });

        const totalCount = await user.$count('shoppingLists', { where: whereCondition });

        res.status(200).json({
            status: 'success',
            message: 'User shopping lists retrieved successfully',
            data: {
                shoppingLists,
                pagination: {
                    page: parseInt(page as string),
                    size: parseInt(size as string),
                    total: totalCount,
                    totalPages: Math.ceil(totalCount / parseInt(size as string)),
                },
            },
        });
    }

    static async getUserLocations(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { page = 1, size = 10, startDate, endDate } = req.query;

        const user = await UserService.viewSingleUser(id);

        if (user.status.userType === 'agent') {
            // Get agent locations with pagination and date filtering
            const whereCondition: any = {};
            
            if (startDate || endDate) {
                whereCondition.createdAt = {};
                if (startDate) whereCondition.createdAt[require('sequelize').Op.gte] = new Date(startDate as string);
                if (endDate) whereCondition.createdAt[require('sequelize').Op.lte] = new Date(endDate as string);
            }

            const result = await AgentLocation.findAndCountAll({
                where: {
                    agentId: id,
                    ...whereCondition
                },
                limit: parseInt(size as string),
                offset: (parseInt(page as string) - 1) * parseInt(size as string),
                order: [['createdAt', 'DESC']],
            });

            const locations = result.rows.map(location => ({
                id: location.id,
                latitude: location.latitude,
                longitude: location.longitude,
                address: location.address || `${location.latitude}, ${location.longitude}`,
                name: location.name,
                locationType: location.locationType,
                accuracy: location.accuracy,
                timestamp: location.timestamp || location.createdAt,
                isActive: location.isActive,
                createdAt: location.createdAt,
                status: location.isActive ? 'active' : 'inactive'
            }));
            
            res.status(200).json({
                status: 'success',
                message: 'Agent locations retrieved successfully',
                data: {
                    locations,
                    currentLocation: user.location || null,
                    pagination: {
                        page: parseInt(page as string),
                        size: parseInt(size as string),
                        total: result.count,
                        totalPages: Math.ceil(result.count / parseInt(size as string)),
                    },
                },
            });
        } else {
            // Get customer addresses with pagination
            const result = await UserAddress.findAndCountAll({
                where: { userId: id },
                limit: parseInt(size as string),
                offset: (parseInt(page as string) - 1) * parseInt(size as string),
                order: [['lastUsedAt', 'DESC'], ['createdAt', 'DESC']],
            });

            const locations = result.rows.map(address => ({
                id: address.id,
                latitude: address.latitude,
                longitude: address.longitude,
                address: address.fullAddress || address.address,
                name: address.title,
                type: address.type,
                city: address.city,
                state: address.state,
                country: address.country,
                isDefault: address.isDefault,
                isActive: address.isActive,
                createdAt: address.createdAt,
                lastUsedAt: address.lastUsedAt,
                status: address.isActive ? 'active' : 'inactive'
            }));
            
            res.status(200).json({
                status: 'success',
                message: 'User addresses retrieved successfully',
                data: {
                    locations,
                    currentLocation: user.location || null,
                    pagination: {
                        page: parseInt(page as string),
                        size: parseInt(size as string),
                        total: result.count,
                        totalPages: Math.ceil(result.count / parseInt(size as string)),
                    },
                },
            });
        }
    }

    static async getAgentPerformanceMetrics(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { period = '30' } = req.query; // days

        const user = await UserService.viewSingleUser(id);

        if (user.status.userType !== 'agent') {
            throw new BadRequestError('User is not an agent');
        }

        const daysBack = parseInt(period as string);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);

        // Get performance metrics from database
        const metrics = await Database.query(`
            SELECT 
                COUNT(o.id) as total_orders,
                COUNT(CASE WHEN o.status = 'completed' THEN 1 END) as completed_orders,
                COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END) as cancelled_orders,
                AVG(EXTRACT(EPOCH FROM (o."completedAt" - o."acceptedAt"))/3600) as avg_completion_hours,
                COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o."deliveryFee" * 0.15 ELSE 0 END), 0) as total_earnings,
                AVG(CASE WHEN o.status = 'completed' THEN o."deliveryFee" * 0.15 ELSE NULL END) as avg_earning_per_order
            FROM "Orders" o
            WHERE o."agentId" = :agentId 
            AND o."createdAt" >= :startDate
        `, {
            replacements: { agentId: id, startDate },
            type: QueryTypes.SELECT,
        });

        const performanceData = metrics[0] as any;

        // Calculate performance rating
        const completionRate = performanceData.total_orders > 0 
            ? (performanceData.completed_orders / performanceData.total_orders) * 100 
            : 0;

        const rating = completionRate >= 95 ? 'Excellent' :
                      completionRate >= 85 ? 'Good' :
                      completionRate >= 70 ? 'Fair' : 'Needs Improvement';

        res.status(200).json({
            status: 'success',
            message: 'Agent performance metrics retrieved successfully',
            data: {
                agent: {
                    id: user.id,
                    name: user.fullName,
                    email: user.email,
                },
                period: `${daysBack} days`,
                metrics: {
                    totalOrders: parseInt(performanceData.total_orders || '0'),
                    completedOrders: parseInt(performanceData.completed_orders || '0'),
                    cancelledOrders: parseInt(performanceData.cancelled_orders || '0'),
                    completionRate: Math.round(completionRate),
                    avgCompletionTime: parseFloat(performanceData.avg_completion_hours || '0'),
                    totalEarnings: parseFloat(performanceData.total_earnings || '0'),
                    avgEarningPerOrder: parseFloat(performanceData.avg_earning_per_order || '0'),
                },
                rating,
            },
        });
    }

    static async getAgentLocationHistory(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { page = 1, size = 20 } = req.query;

        const user = await UserService.viewSingleUser(id);

        if (user.status.userType !== 'agent') {
            throw new BadRequestError('User is not an agent');
        }

        const locations = await user.$get('locations', {
            limit: parseInt(size as string),
            offset: (parseInt(page as string) - 1) * parseInt(size as string),
            order: [['updatedAt', 'DESC']],
        });

        const totalCount = await user.$count('locations');

        res.status(200).json({
            status: 'success',
            message: 'Agent location history retrieved successfully',
            data: {
                locations,
                pagination: {
                    page: parseInt(page as string),
                    size: parseInt(size as string),
                    total: totalCount,
                    totalPages: Math.ceil(totalCount / parseInt(size as string)),
                },
            },
        });
    }

    static async updateAgentStatus(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { status, reason } = req.body;

        const validStatuses = ['available', 'busy', 'away', 'offline'];
        if (!validStatuses.includes(status)) {
            throw new BadRequestError('Invalid status');
        }

        const user = await UserService.viewSingleUser(id);

        if (user.status.userType !== 'agent') {
            throw new BadRequestError('User is not an agent');
        }

        const currentMeta = user.settings.agentMetaData || {} as IAgentMeta;
        const updatedMeta = {
            ...currentMeta,
            currentStatus: status,
            lastStatusUpdate: new Date().toISOString(),
            isAcceptingOrders: status === 'available',
        };

        await UserService.updateUserSettings(id, {
            agentMetaData: updatedMeta,
        });

        res.status(200).json({
            status: 'success',
            message: 'Agent status updated successfully',
            data: {
                agentId: id,
                status,
                isAcceptingOrders: status === 'available',
                updatedAt: new Date().toISOString(),
                reason,
            },
        });
    }

    static async getAgentAnalytics(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        
        const user = await UserService.viewSingleUser(id);

        if (user.status.userType !== 'agent') {
            throw new BadRequestError('User is not an agent');
        }

        // Get comprehensive analytics
        const analytics = await Database.query(`
            SELECT 
                -- Order statistics
                COUNT(o.id) as total_orders,
                COUNT(CASE WHEN o.status = 'completed' THEN 1 END) as completed_orders,
                COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END) as cancelled_orders,
                COUNT(CASE WHEN o.status IN ('pending', 'accepted', 'in_progress', 'shopping') THEN 1 END) as active_orders,
                
                -- Financial statistics
                COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o."deliveryFee" * 0.15 ELSE 0 END), 0) as total_earnings,
                COALESCE(AVG(CASE WHEN o.status = 'completed' THEN o."deliveryFee" * 0.15 ELSE NULL END), 0) as avg_earning_per_order,
                COALESCE(MAX(CASE WHEN o.status = 'completed' THEN o."deliveryFee" * 0.15 ELSE NULL END), 0) as highest_earning,
                
                -- Time statistics  
                AVG(EXTRACT(EPOCH FROM (o."completedAt" - o."acceptedAt"))/3600) as avg_completion_hours,
                MIN(EXTRACT(EPOCH FROM (o."completedAt" - o."acceptedAt"))/3600) as fastest_completion_hours,
                MAX(EXTRACT(EPOCH FROM (o."completedAt" - o."acceptedAt"))/3600) as slowest_completion_hours,
                
                -- Date range
                MIN(o."createdAt") as first_order_date,
                MAX(o."createdAt") as last_order_date
                
            FROM "Orders" o
            WHERE o."agentId" = :agentId
        `, {
            replacements: { agentId: id },
            type: QueryTypes.SELECT,
        });

        // Get monthly performance
        const monthlyStats = await Database.query(`
            SELECT 
                DATE_TRUNC('month', o."createdAt") as month,
                COUNT(o.id) as orders_count,
                COUNT(CASE WHEN o.status = 'completed' THEN 1 END) as completed_count,
                COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o."deliveryFee" * 0.15 ELSE 0 END), 0) as earnings
            FROM "Orders" o
            WHERE o."agentId" = :agentId
            AND o."createdAt" >= NOW() - INTERVAL '12 months'
            GROUP BY DATE_TRUNC('month', o."createdAt")
            ORDER BY month ASC
        `, {
            replacements: { agentId: id },
            type: QueryTypes.SELECT,
        });

        const data = analytics[0] as any;
        const completionRate = data.total_orders > 0 ? (data.completed_orders / data.total_orders) * 100 : 0;

        res.status(200).json({
            status: 'success',
            message: 'Agent analytics retrieved successfully',
            data: {
                agent: {
                    id: user.id,
                    name: user.fullName,
                    email: user.email,
                    joinDate: user.settings.joinDate,
                    kycVerified: user.settings.isKycVerified,
                    currentStatus: user.settings.agentMetaData?.currentStatus || 'offline',
                },
                summary: {
                    totalOrders: parseInt(data.total_orders || '0'),
                    completedOrders: parseInt(data.completed_orders || '0'),
                    cancelledOrders: parseInt(data.cancelled_orders || '0'),
                    activeOrders: parseInt(data.active_orders || '0'),
                    completionRate: Math.round(completionRate),
                    totalEarnings: parseFloat(data.total_earnings || '0'),
                    avgEarningPerOrder: parseFloat(data.avg_earning_per_order || '0'),
                    highestEarning: parseFloat(data.highest_earning || '0'),
                    avgCompletionTime: parseFloat(data.avg_completion_hours || '0'),
                    fastestCompletion: parseFloat(data.fastest_completion_hours || '0'),
                    slowestCompletion: parseFloat(data.slowest_completion_hours || '0'),
                    firstOrderDate: data.first_order_date,
                    lastOrderDate: data.last_order_date,
                },
                monthlyPerformance: monthlyStats,
            },
        });
    }

    // Admin Order Management Methods
    static async getAllOrders(req: AdminAuthenticatedRequest, res: Response) {
        const { 
            page = 1, 
            size = 10, 
            status, 
            paymentStatus, 
            customerId, 
            agentId, 
            startDate, 
            endDate, 
            orderNumber, 
            q 
        } = req.query;

        try {
            const queryParams: any = {
                page: parseInt(page as string),
                size: parseInt(size as string),
            };

            // Build where conditions
            const whereConditions: any = {};
            if (status) whereConditions.status = status;
            if (paymentStatus) whereConditions.paymentStatus = paymentStatus;
            if (customerId) whereConditions.customerId = customerId;
            if (agentId) whereConditions.agentId = agentId;
            if (orderNumber) whereConditions.orderNumber = orderNumber;

            // Date range filter
            if (startDate || endDate) {
                const dateFilter: any = {};
                if (startDate) dateFilter[require('sequelize').Op.gte] = new Date(startDate as string);
                if (endDate) dateFilter[require('sequelize').Op.lte] = new Date(endDate as string);
                whereConditions.createdAt = dateFilter;
            }

            // Text search across multiple fields
            if (q) {
                const searchTerm = q as string;
                whereConditions[require('sequelize').Op.or] = [
                    { orderNumber: { [require('sequelize').Op.iLike]: `%${searchTerm}%` } },
                    { '$customer.firstName$': { [require('sequelize').Op.iLike]: `%${searchTerm}%` } },
                    { '$customer.lastName$': { [require('sequelize').Op.iLike]: `%${searchTerm}%` } },
                    { '$customer.email$': { [require('sequelize').Op.iLike]: `%${searchTerm}%` } },
                    { '$agent.firstName$': { [require('sequelize').Op.iLike]: `%${searchTerm}%` } },
                    { '$agent.lastName$': { [require('sequelize').Op.iLike]: `%${searchTerm}%` } },
                ];
            }

            const { count, rows: orders } = await Order.findAndCountAll({
                where: whereConditions,
                include: [
                    {
                        model: require('../../models/user.model').default,
                        as: 'customer',
                        attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'displayImage'],
                    },
                    {
                        model: require('../../models/user.model').default,
                        as: 'agent',
                        attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'displayImage'],
                    },
                    {
                        model: ShoppingList,
                        as: 'shoppingList',
                        attributes: ['id', 'name', 'notes', 'estimatedTotal'],
                        include: [
                            {
                                model: ShoppingListItem,
                                as: 'items',
                                attributes: ['id', 'name', 'quantity', 'unit', 'estimatedPrice', 'actualPrice', 'notes']
                            },
                            {
                                model: Market,
                                as: 'market',
                                attributes: ['id', 'name', 'address'],
                            }
                        ]
                    }
                ],
                limit: queryParams.size,
                offset: (queryParams.page - 1) * queryParams.size,
                order: [['createdAt', 'DESC']],
            });

            res.status(200).json({
                status: 'success',
                message: 'Orders retrieved successfully',
                data: {
                    orders,
                    pagination: {
                        page: queryParams.page,
                        size: queryParams.size,
                        total: count,
                        totalPages: Math.ceil(count / queryParams.size),
                    },
                },
            });
        } catch (error) {
            console.error('Error in getAllOrders:', error);
            throw error;
        }
    }

    static async getOrderStats(req: AdminAuthenticatedRequest, res: Response) {
        try {
            // Get comprehensive order statistics
            const stats = await Database.query(`
                SELECT 
                    COUNT(*) as total_orders,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
                    COUNT(CASE WHEN status IN ('accepted', 'in_progress', 'shopping', 'shopping_completed') THEN 1 END) as in_progress_orders,
                    COUNT(CASE WHEN status = 'disputed' THEN 1 END) as disputed_orders,
                    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
                    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
                    COALESCE(SUM(CASE WHEN status = 'completed' THEN "totalAmount" ELSE 0 END), 0) as total_revenue,
                    COALESCE(AVG(CASE WHEN status = 'completed' THEN "totalAmount" ELSE NULL END), 0) as avg_order_value
                FROM "Orders"
            `, {
                type: QueryTypes.SELECT,
            });

            const data = stats[0] as any;
            const totalOrders = parseInt(data.total_orders || '0');
            const completedOrders = parseInt(data.completed_orders || '0');
            
            const completionRate = totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0;

            res.status(200).json({
                status: 'success',
                message: 'Order statistics retrieved successfully',
                data: {
                    totalOrders,
                    completedOrders,
                    inProgressOrders: parseInt(data.in_progress_orders || '0'),
                    disputedOrders: parseInt(data.disputed_orders || '0'),
                    cancelledOrders: parseInt(data.cancelled_orders || '0'),
                    pendingOrders: parseInt(data.pending_orders || '0'),
                    totalRevenue: parseFloat(data.total_revenue || '0'),
                    avgOrderValue: parseFloat(data.avg_order_value || '0'),
                    completionRate: Math.round(completionRate * 100) / 100,
                },
            });
        } catch (error) {
            console.error('Error in getOrderStats:', error);
            throw error;
        }
    }

    static async getAdminOrder(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;

        try {
            // Check if the id is a UUID (old format) or orderNumber (new format)
            let order;
            const OrderController = require('../order.controller').default;
            if (OrderController.isOrderNumber(id)) {
                // New format: orderNumber (e.g., B2S-ABC123)
                const OrderService = require('../../services/order.service').default;
                order = await OrderService.getOrderByNumber(id);
            } else {
                // Old format: UUID
                order = await Order.findByPk(id, {
                    include: [
                        {
                            model: require('../../models/user.model').default,
                            as: 'customer',
                            attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'displayImage'],
                        },
                        {
                            model: require('../../models/user.model').default,
                            as: 'agent',
                            attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'displayImage'],
                        },
                        {
                            model: ShoppingList,
                            as: 'shoppingList',
                            attributes: ['id', 'name', 'notes', 'estimatedTotal'],
                            include: [
                                {
                                    model: ShoppingListItem,
                                    as: 'items',
                                    attributes: ['id', 'name', 'quantity', 'unit', 'estimatedPrice', 'actualPrice', 'notes']
                                },
                                {
                                    model: Market,
                                    as: 'market',
                                    attributes: ['id', 'name', 'address'],
                                }
                            ]
                        }
                    ]
                });
            }

            if (!order) {
                throw new BadRequestError('Order not found');
            }

            res.status(200).json({
                status: 'success',
                message: 'Order retrieved successfully',
                data: order,
            });
        } catch (error) {
            console.error('Error in getAdminOrder:', error);
            throw error;
        }
    }

    static async updateOrderStatusAdmin(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { status, notes } = req.body;

        if (!status) {
            throw new BadRequestError('Status is required');
        }

        try {
            const order = await Order.findByPk(id);
            if (!order) {
                throw new BadRequestError('Order not found');
            }

            // Update order status
            await order.update({ status });

            // Add to order trail if OrderTrailService exists
            try {
                const OrderTrailService = require('../../services/orderTrail.service').default;
                await OrderTrailService.addTrailEntry(id, {
                    action: 'status_updated',
                    description: `Order status updated to ${status} by admin`,
                    performedBy: 'admin',
                    performedByType: 'admin',
                    metadata: { 
                        previousStatus: order.status,
                        newStatus: status,
                        adminNotes: notes 
                    },
                });
            } catch (trailError) {
                console.warn('Could not add order trail entry:', trailError);
            }

            // Get updated order with relations
            const updatedOrder = await Order.findByPk(id, {
                include: [
                    {
                        model: require('../../models/user.model').default,
                        as: 'customer',
                        attributes: ['id', 'firstName', 'lastName', 'email'],
                    },
                    {
                        model: require('../../models/user.model').default,
                        as: 'agent',
                        attributes: ['id', 'firstName', 'lastName', 'email'],
                    }
                ]
            });

            res.status(200).json({
                status: 'success',
                message: 'Order status updated successfully',
                data: updatedOrder,
            });
        } catch (error) {
            console.error('Error in updateOrderStatusAdmin:', error);
            throw error;
        }
    }

    static async cancelOrderAdmin(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { reason } = req.body;

        if (!reason) {
            throw new BadRequestError('Cancellation reason is required');
        }

        try {
            const order = await Order.findByPk(id);
            if (!order) {
                throw new BadRequestError('Order not found');
            }

            if (order.status === 'completed' || order.status === 'cancelled') {
                throw new BadRequestError(`Cannot cancel order with status: ${order.status}`);
            }

            // Update order status to cancelled
            await order.update({ 
                status: 'cancelled',
                agentNotes: `Admin cancelled: ${reason}`,
            });

            // Add to order trail
            try {
                const OrderTrailService = require('../../services/orderTrail.service').default;
                await OrderTrailService.addTrailEntry(id, {
                    action: 'order_cancelled',
                    description: `Order cancelled by admin. Reason: ${reason}`,
                    performedBy: 'admin',
                    performedByType: 'admin',
                    metadata: { 
                        reason,
                        previousStatus: order.status,
                    },
                });
            } catch (trailError) {
                console.warn('Could not add order trail entry:', trailError);
            }

            const updatedOrder = await Order.findByPk(id, {
                include: [
                    {
                        model: require('../../models/user.model').default,
                        as: 'customer',
                        attributes: ['id', 'firstName', 'lastName', 'email'],
                    },
                    {
                        model: require('../../models/user.model').default,
                        as: 'agent',
                        attributes: ['id', 'firstName', 'lastName', 'email'],
                    }
                ]
            });

            res.status(200).json({
                status: 'success',
                message: 'Order cancelled successfully',
                data: updatedOrder,
            });
        } catch (error) {
            console.error('Error in cancelOrderAdmin:', error);
            throw error;
        }
    }

    static async reassignOrder(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;
        const { agentId } = req.body;

        if (!agentId) {
            throw new BadRequestError('Agent ID is required');
        }

        try {
            const order = await Order.findByPk(id);
            if (!order) {
                throw new BadRequestError('Order not found');
            }

            // Verify agent exists and is active
            const agent = await require('../../services/user.service').default.viewSingleUser(agentId);
            if (agent.status?.userType !== 'agent') {
                throw new BadRequestError('Invalid agent ID');
            }

            const previousAgentId = order.agentId;
            
            // Update order with new agent
            await order.update({ agentId });

            // Add to order trail
            try {
                const OrderTrailService = require('../../services/orderTrail.service').default;
                await OrderTrailService.addTrailEntry(id, {
                    action: 'order_reassigned',
                    description: `Order reassigned to agent ${agent.firstName} ${agent.lastName}`,
                    performedBy: 'admin',
                    performedByType: 'admin',
                    metadata: { 
                        previousAgentId,
                        newAgentId: agentId,
                    },
                });
            } catch (trailError) {
                console.warn('Could not add order trail entry:', trailError);
            }

            const updatedOrder = await Order.findByPk(id, {
                include: [
                    {
                        model: require('../../models/user.model').default,
                        as: 'customer',
                        attributes: ['id', 'firstName', 'lastName', 'email'],
                    },
                    {
                        model: require('../../models/user.model').default,
                        as: 'agent',
                        attributes: ['id', 'firstName', 'lastName', 'email'],
                    }
                ]
            });

            res.status(200).json({
                status: 'success',
                message: 'Order reassigned successfully',
                data: updatedOrder,
            });
        } catch (error) {
            console.error('Error in reassignOrder:', error);
            throw error;
        }
    }

    static async getOrderTrail(req: AdminAuthenticatedRequest, res: Response) {
        const { id } = req.params;

        if (!id) {
            throw new BadRequestError('Order ID is required');
        }

        try {
            // Check if order exists first
            const order = await Order.findByPk(id);
            if (!order) {
                throw new NotFoundError('Order not found');
            }

            // Get order trail using the OrderTrailService
            const OrderTrailService = require('../../services/orderTrail.service').default;
            const trail = await OrderTrailService.getOrderTrail(id);

            // Format the trail data for admin consumption
            const formattedTrail = trail.map((entry: any) => ({
                id: entry.id,
                orderId: entry.orderId,
                action: entry.action,
                description: entry.description,
                performedBy: entry.user 
                    ? `${entry.user.firstName} ${entry.user.lastName}` 
                    : entry.performedBy || 'System',
                performedByType: entry.performedByType || 'system',
                metadata: entry.metadata,
                createdAt: entry.timestamp || entry.createdAt,
                previousValue: entry.previousValue,
                newValue: entry.newValue,
            }));

            res.status(200).json({
                status: 'success',
                message: 'Order trail retrieved successfully',
                data: formattedTrail,
            });
        } catch (error) {
            console.error('Error in getOrderTrail:', error);
            throw error;
        }
    }

    static async createUser(req: AdminAuthenticatedRequest, res: Response) {
        const { 
            firstName, 
            lastName, 
            otherName,
            email, 
            userType, 
            gender,
            phone,
            location,
            dob,
            status,
            settings
        } = req.body;

        if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !userType) {
            throw new BadRequestError('First name, last name, email, and user type are required');
        }

        if (!['customer', 'agent'].includes(userType)) {
            throw new BadRequestError('User type must be either customer or agent');
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new BadRequestError('Invalid email format');
        }

        try {
            // Create user using the UserService
            const userData = {
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                otherName: otherName?.trim(),
                email: email.toLowerCase().trim(),
                gender,
                phone,
                location,
                dob: dob ? new Date(dob) : undefined,
                status: {
                    activated: status?.activated ?? true,
                    emailVerified: status?.emailVerified ?? true,
                    userType,
                },
                settings: settings || {},
            };

            const newUser = await UserService.addUser(userData as any);

            res.status(201).json({
                status: 'success',
                message: `${userType === 'agent' ? 'Agent' : 'Customer'} created successfully`,
                data: newUser,
            });
        } catch (error: any) {
            if (error.message?.includes('email')) {
                throw new BadRequestError('Email already exists');
            }
            throw error;
        }
    }
}
