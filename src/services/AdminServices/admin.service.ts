// /* eslint-disable @typescript-eslint/no-explicit-any */
// import { Op, Sequelize } from 'sequelize';
// import Course from '../../models/course.model';
// import User from '../../models/user.model';
// import Instructor from '../../models/instructor.model';
// import CourseStats from '../../models/courseStats.model';
// import UserCourse from '../../models/userCourse.model';
// import { CourseStatus } from '../../models/course.model';
// import { UserCourseStatus } from '../../models/userCourse.model';
// import Admin, { IAdmin } from '../../models/admin.model';
// import { BadRequestError, NotFoundError } from '../../utils/customErrors';
// import moment from 'moment';
// import UserSettings, { IBlockMeta } from '../../models/userSettings.model';

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

// export default class AdminService {

//     static async createAdmin(adminData: IAdmin): Promise<Admin> {
//         const existingAdmin = await Admin.findOne({ where: { email: adminData.email } });
//         if (existingAdmin) {
//             throw new BadRequestError('Admin with this email already exists');
//         }

//         const newAdmin = await Admin.create(adminData);
//         return newAdmin;
//     }

//     static async getAllAdmins(): Promise<Admin[]> {
//         return Admin.findAll();
//     }

//     static async getAdminByEmail(email: string): Promise<Admin> {   

//         const admin: Admin | null = await Admin.findOne({ where: { email } });
    
//         if (!admin) {
//             throw new NotFoundError('Admin not found');
//         }
    
//         return admin;
//     }

//     static async deleteAdmin(adminId: string): Promise<void> {
//         const admin = await Admin.findByPk(adminId);
//         if (!admin) {
//             throw new NotFoundError('Admin not found');
//         }
//         await admin.destroy();
//     }
    
//     static async getCourseStats(): Promise<any> {
//         console.log('retrieving course stats');
//         const totalCourses = await Course.count();
//         const publishedCourses = await Course.count({ where: { status: CourseStatus.Published } });
//         const totalEnrollments = await UserCourse.count();
//         const completedCourses = await UserCourse.count({
//             where: { status: UserCourseStatus.Completed },
//         });
//         const coursesByLevel = await Course.findAll({
//             attributes: ['level', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
//             group: ['level'],
//             raw: true,
//         });

//         return {
//             totalCourses,
//             publishedCourses,
//             totalEnrollments,
//             completedCourses,
//             completionRate: totalEnrollments > 0 ? (completedCourses / totalEnrollments) * 100 : 0,
//             coursesByLevel,
//         };
//     }

//     static async getInstructorStats(): Promise<any> {
//         console.log('retrieving instructor stats');
//         const stats = await Instructor.findAll({
//             attributes: [
//                 [Sequelize.fn('COUNT', Sequelize.col('Instructor.id')), 'totalInstructors'],
//                 [Sequelize.fn('SUM', Sequelize.literal('CASE WHEN "courses"."id" IS NOT NULL THEN 1 ELSE 0 END')), 'instructorsWithCourses'],
//             ],
//             include: [{
//                 model: Course,
//                 as: 'courses',
//                 attributes: [],
//             }],
//             raw: true,
//         }) as unknown as InstructorStats[];

//         const totalInstructors = parseInt(stats[0].totalInstructors.toString(), 10);
//         const instructorsWithCourses = parseInt(stats[0].instructorsWithCourses.toString(), 10);

//         console.log({ totalInstructors, instructorsWithCourses });

//         const topInstructors = await Instructor.findAll({
//             attributes: [
//                 'id',
//                 'name',
//                 [Sequelize.fn('COUNT', Sequelize.col('courses.id')), 'courseCount'],
//                 [Sequelize.literal('"Instructor"."info"->>\'profilePictureUrl\''), 'instructorImage'],
//                 [Sequelize.fn('COUNT', Sequelize.col('courses.id')), 'courseCount'],
//                 [Sequelize.fn('AVG', Sequelize.col('courses.stats.overallRating')), 'averageRating'],
//             ],
//             include: [{
//                 model: Course,
//                 as: 'courses',
//                 attributes: [],
//                 required: false,
//                 include: [{
//                     model: CourseStats,
//                     as: 'stats',
//                     attributes: [],
//                     required: false,
//                 }],
//             }],
//             group: ['Instructor.id', 'Instructor.name'],
//             order: [[Sequelize.literal('"courseCount"'), 'DESC']],
//             limit: 10,
//             subQuery: false,
//         });

//         return {
//             totalInstructors,
//             instructorsWithCourses,
//             topInstructors,
//         };
//     }

//     static async getUserStats(): Promise<any> {
//         const now = moment();
//         const startOfThisMonth = now.clone().startOf('month');
//         const startOfLastMonth = now.clone().subtract(1, 'month').startOf('month');

//         const totalUsers = await User.count();
//         const enrolledUsers = await UserCourse.count({
//             distinct: true,
//             col: 'userId',
//         });

//         const usersByStatus = await UserCourse.findAll({
//             attributes: ['status', [Sequelize.fn('COUNT', Sequelize.col('userId')), 'count']],
//             group: ['status'],
//             raw: true,
//         });

//         const newUsersThisMonth = await User.count({
//             where: {
//                 createdAt: {
//                     [Op.gte]: startOfThisMonth.toDate(),
//                 },
//             },
//         });

//         const newUsersLastMonth = await User.count({
//             where: {
//                 createdAt: {
//                     [Op.gte]: startOfLastMonth.toDate(),
//                     [Op.lt]: startOfThisMonth.toDate(),
//                 },
//             },
//         });

//         const totalCourses = await Course.count();
//         const newCoursesThisMonth = await Course.count({
//             where: {
//                 createdAt: {
//                     [Op.gte]: startOfThisMonth.toDate(),
//                 },
//             },
//         });

//         const newCoursesLastMonth = await Course.count({
//             where: {
//                 createdAt: {
//                     [Op.gte]: startOfLastMonth.toDate(),
//                     [Op.lt]: startOfThisMonth.toDate(),
//                 },
//             },
//         });

//         const revenueQuery = (whereClause: any) => UserCourse.findOne({
//             attributes: [
//                 [Sequelize.literal('SUM(CAST(COALESCE(CAST(NULLIF("paymentDetails"->>\'price\', \'\') AS FLOAT), 0) AS FLOAT))'), 'total'],
//             ],
//             where: {
//                 paid: true,
//                 ...whereClause,
//             },
//             raw: true,
//         }) as unknown as RevenueResult;

//         const totalRevenue = await revenueQuery({});
//         const revenueThisMonth = await revenueQuery({
//             createdAt: {
//                 [Op.gte]: startOfThisMonth.toDate(),
//             },
//         });
//         const revenueLastMonth = await revenueQuery({
//             createdAt: {
//                 [Op.gte]: startOfLastMonth.toDate(),
//                 [Op.lt]: startOfThisMonth.toDate(),
//             },
//         });

//         const totalRevenueValue = totalRevenue ? parseFloat(totalRevenue.total) : 0;
//         const revenueThisMonthValue = revenueThisMonth ? parseFloat(revenueThisMonth.total) : 0;
//         const revenueLastMonthValue = revenueLastMonth ? parseFloat(revenueLastMonth.total) : 0;

//         const calculateIncrease = (current: number, previous: number): number => {
//             if (previous === 0) {
//                 return current > 0 ? 100 : 0;
//             }
//             return Math.max(((current - previous) / previous) * 100, 0);
//         };

//         const userIncrease = calculateIncrease(newUsersThisMonth, newUsersLastMonth);
//         const revenueIncrease = calculateIncrease(revenueThisMonthValue, revenueLastMonthValue);
//         const courseIncrease = calculateIncrease(newCoursesThisMonth, newCoursesLastMonth);

//         return {
//             totalUsers,
//             enrolledUsers,
//             newUsersThisMonth,
//             totalCourses,
//             newCoursesThisMonth,
//             totalRevenue: totalRevenueValue,
//             revenueThisMonth: revenueThisMonthValue,
//             userIncrease,
//             revenueIncrease,
//             courseIncrease,
//             usersByStatus,
//         };
//     }

//     static async getTopCourses(limit: number = 10): Promise<any> {
//         return Course.findAll({
//             attributes: [
//                 'id',
//                 'title',
//                 'level',
//                 'price',
//                 [Sequelize.col('stats.numberOfPaidStudents'), 'enrollments'],
//                 [Sequelize.col('stats.overallRating'), 'rating'],
//                 [Sequelize.col('instructor.name'), 'instructorName'],
//                 [Sequelize.literal('"instructor"."info"->>\'profilePictureUrl\''), 'instructorImage'],
//                 [Sequelize.literal('"Course"."media"->>\'videoThumbnail\''), 'previewImage'],
//                 [Sequelize.col('instructor.id'), 'instructorId'],
//             ],
//             include: [
//                 {
//                     model: CourseStats,
//                     as: 'stats',  // Add this line to define an alias
//                     attributes: [],
//                 },
//                 {
//                     model: Instructor,
//                     as: 'instructor',
//                     attributes: [],
//                 },            
//             ],
//             order: [
//                 [Sequelize.col('stats.numberOfPaidStudents'), 'DESC'],
//                 [Sequelize.col('stats.overallRating'), 'DESC'],
//             ],
//             limit: limit,
//             raw: true,
//         });
//     }

//     static async getRevenueStats(timeFrame?: string, courseId?: string): Promise<any> {
//         console.log({ timeFrame, courseId });
//         const validPeriods = ['month', 'week', 'day'];
//         const dateTruncValue = validPeriods.includes(timeFrame as string) ? (timeFrame as string) : 'month';
//         console.log(`Fetching all-time revenue stats grouped by ${dateTruncValue}`);
//         const whereClause: any = {
//             paid: true,
//         };
//         if (courseId) {
//             whereClause.courseId = courseId;
//         }

//         console.log('Where clause:', JSON.stringify(whereClause));

//         const revenueStats = await UserCourse.findAll({
//             attributes: [
//                 [Sequelize.fn('to_char', Sequelize.fn('date_trunc', dateTruncValue, Sequelize.col('createdAt')), 'YYYY-MM-DD'), 'period'],
//                 [Sequelize.fn('SUM', Sequelize.cast(Sequelize.literal('COALESCE(CAST(NULLIF("paymentDetails"->>\'price\', \'\') AS FLOAT), 0)'), 'float')), 'revenue'],
//                 [Sequelize.fn('COUNT', Sequelize.col('id')), 'enrollments'],
//                 [Sequelize.fn('MAX', Sequelize.literal('"paymentDetails"->>\'currency\'')), 'currency'],
//             ],
//             where: whereClause,
//             group: [Sequelize.fn('to_char', Sequelize.fn('date_trunc', dateTruncValue, Sequelize.col('createdAt')), 'YYYY-MM-DD')],
//             order: [[Sequelize.fn('to_char', Sequelize.fn('date_trunc', dateTruncValue, Sequelize.col('createdAt')), 'YYYY-MM-DD'), 'ASC']],
//             raw: true,
//         }) as unknown as RevenueStatResult[];

//         console.log(`Query returned ${revenueStats.length} results`);
//         if (revenueStats.length > 0) {
//             console.log('First result:', revenueStats[0]);
//         }

//         if (revenueStats.length === 0) {
//             console.log('No revenue stats found. Returning empty array.');
//             return { totalRevenue: 0, stats: [] };
//         }

//         let totalRevenue = 0;

//         const formattedStats = revenueStats.map(stat => {
//             const revenue = parseFloat(stat.revenue) || 0;
//             totalRevenue += revenue;
//             return {
//                 period: moment(stat.period).format('YYYY-MM-DD'),
//                 revenue,
//                 enrollments: parseInt(stat.enrollments),
//                 currency: stat.currency || 'Unknown',
//             };
//         });

//         console.log(`Returning ${formattedStats.length} formatted stats`);
//         return {
//             totalRevenue,
//             stats: formattedStats,
//         };
//     }

//     static async blockUser(id: string, status: boolean, reason: string): Promise<UserSettings> {
//         const userSettings = await UserSettings.findOne({ where: { userId: id } });

//         if (!userSettings) {
//             throw new NotFoundError('User settings not found');
//         }

//         const currentDate = moment().format('YYYY-MM-DD');
//         const updatedMeta: IBlockMeta = userSettings.meta || { blockHistory: [], unblockHistory: [] };

//         if (status) {
//             // Blocking the user
//             if (userSettings.isBlocked) {
//                 throw new BadRequestError('User is already blocked');
//             }
//             updatedMeta.blockHistory.push({ [currentDate]: reason });
//         } else {
//             // Unblocking the user
//             if (!userSettings.isBlocked) {
//                 throw new BadRequestError('User is not blocked');
//             }
//             updatedMeta.unblockHistory.push({ [currentDate]: reason });
//         }

//         await userSettings.update({
//             isBlocked: status,
//             meta: updatedMeta,
//         });

//         return userSettings;
//     }
// }