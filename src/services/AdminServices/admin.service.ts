/* eslint-disable @typescript-eslint/no-explicit-any */
import Admin, { IAdmin } from '../../models/admin.model';
import { BadRequestError, NotFoundError } from '../../utils/customErrors';
import moment from 'moment';
import UserSettings, { IBlockMeta } from '../../models/userSettings.model';
import { FindAndCountOptions, Op } from 'sequelize';
import Pagination, { IPaging } from '../../utils/pagination';

// interface RevenueStatResult {
//     period: Date;
//     revenue: string;
//     enrollments: string;
//     currency: string;
// }

// interface InstructorStats {
//     totalInstructors: number;
//     instructorsWithCourses: number;
// }

// interface RevenueResult {
//     total: string;
// }

export interface IViewAdminsQuery {
    page?: number;
    size?: number;
    q?: string; // Search query
    isSuperAdmin?: boolean;
}

export default class AdminService {
    static async createAdmin(adminData: IAdmin): Promise<Admin> {
        const existingAdmin = await Admin.findOne({ where: { email: adminData.email } });
        if (existingAdmin) {
            throw new BadRequestError('Admin with this email already exists');
        }

        return await Admin.create(adminData);
    }

    static async getAllAdmins(
        queryData?: IViewAdminsQuery,
    ): Promise<{ admins: Admin[]; count: number; totalPages?: number }> {
        const { page, size, q: query, isSuperAdmin } = queryData || {};

        const where: Record<string | symbol, unknown> = {};

        // Handle the search query
        if (query) {
            where[Op.or] = [
                { name: { [Op.iLike]: `%${query}%` } },
                { email: { [Op.iLike]: `%${query}%` } },
            ];
        }

        // Filter by superadmin status if specified
        if (isSuperAdmin !== undefined) {
            where.isSuperAdmin = isSuperAdmin;
        }

        // Basic query options
        const queryOptions: FindAndCountOptions<Admin> = {
            where,
            order: [['createdAt', 'DESC']], // Sort by creation date, the newest first
        };

        // Handle pagination
        if (page && size && page > 0 && size > 0) {
            const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);
            queryOptions.limit = limit ?? 0;
            queryOptions.offset = offset ?? 0;
        }

        const { rows: admins, count } = await Admin.findAndCountAll(queryOptions);

        // Calculate pagination metadata if applicable
        if (page && size && admins.length > 0) {
            const totalPages = Pagination.estimateTotalPage({ count, limit: size } as IPaging);
            return { admins, count, ...totalPages };
        } else {
            return { admins, count };
        }
    }

    static async getAdminByEmail(email: string): Promise<Admin> {
        const admin: Admin | null = await Admin.findOne({ where: { email } });

        if (!admin) {
            throw new NotFoundError('Admin not found');
        }

        return admin;
    }

    static async deleteAdmin(adminId: string): Promise<void> {
        const admin = await Admin.findByPk(adminId);
        if (!admin) {
            throw new NotFoundError('Admin not found');
        }
        await admin.destroy();
    }

    static async updateAdminStatus(adminId: string, isActive: boolean): Promise<Admin> {
        const admin = await Admin.findByPk(adminId);
        if (!admin) {
            throw new NotFoundError('Admin not found');
        }

        await admin.update({ isActive });
        return admin;
    }

    static async blockUser(id: string, status: boolean, reason: string): Promise<UserSettings> {
        const userSettings = await UserSettings.findOne({ where: { userId: id } });

        if (!userSettings) {
            throw new NotFoundError('User settings not found');
        }

        const currentDate = moment().format('YYYY-MM-DD');
        const updatedMeta: IBlockMeta = userSettings.meta || {
            blockHistory: [],
            unblockHistory: [],
        };

        if (status) {
            // Blocking the user
            if (userSettings.isBlocked) {
                throw new BadRequestError('User is already blocked');
            }
            updatedMeta.blockHistory.push({ [currentDate]: reason });
        } else {
            // Unblocking the user
            if (!userSettings.isBlocked) {
                throw new BadRequestError('User is not blocked');
            }
            updatedMeta.unblockHistory.push({ [currentDate]: reason });
        }

        await userSettings.update({
            isBlocked: status,
            meta: updatedMeta,
        });

        return userSettings;
    }
}
