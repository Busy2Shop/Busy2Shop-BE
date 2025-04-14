/* eslint-disable @typescript-eslint/no-explicit-any */
import Admin, { IAdmin } from '../../models/admin.model';
import { BadRequestError, NotFoundError } from '../../utils/customErrors';
import moment from 'moment';
import UserSettings, { IBlockMeta } from '../../models/userSettings.model';

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

export default class AdminService {

    static async createAdmin(adminData: IAdmin): Promise<Admin> {
        const existingAdmin = await Admin.findOne({ where: { email: adminData.email } });
        if (existingAdmin) {
            throw new BadRequestError('Admin with this email already exists');
        }

        const newAdmin = await Admin.create(adminData);
        return newAdmin;
    }

    static async getAllAdmins(): Promise<Admin[]> {
        return Admin.findAll();
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

    static async blockUser(id: string, status: boolean, reason: string): Promise<UserSettings> {
        const userSettings = await UserSettings.findOne({ where: { userId: id } });

        if (!userSettings) {
            throw new NotFoundError('User settings not found');
        }

        const currentDate = moment().format('YYYY-MM-DD');
        const updatedMeta: IBlockMeta = userSettings.meta || { blockHistory: [], unblockHistory: [] };

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