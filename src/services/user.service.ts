import { Transaction, Op, FindAndCountOptions } from 'sequelize';
import User, { IUser } from '../models/user.model';
import { NotFoundError, BadRequestError } from '../utils/customErrors';
import Validator from '../utils/validators';
import Pagination, { IPaging } from '../utils/pagination';
import { Database, Sequelize } from '../models';
import UserSettings, { IUserSettings } from '../models/userSettings.model';

export interface IViewUsersQuery {
    page?: number;
    size?: number;
    q?: string;
    isBlocked?: boolean;
    isDeactivated?: boolean;
    userType?: string;
}

export interface IDynamicQueryOptions {
    query: Record<string, string>;
    includes?: 'profile' | 'all';
    attributes?: string[];
}

export default class UserService {
    static async isEmailAvailable(email: string, userType?: string): Promise<{ isAvailable: boolean, isActivated: boolean }> {
        const validEmail = Validator.isValidEmail(email);
        if (!validEmail) throw new BadRequestError('Invalid email');

        // Find user with the same email and user type
        const existingUser = await User.findOne({
            where: {
                email,
                'status.userType': userType,
            },
            attributes: ['email', 'status'],
        });

        // If user exists with same email and user type, email is not available
        if (existingUser) {
            const isActivated = existingUser.status.activated;
            return { isAvailable: false, isActivated };
        }

        return { isAvailable: true, isActivated: false };
    }

    static async isEmailExisting(email: string): Promise<User | null> {
        const validEmail = Validator.isValidEmail(email);
        if (!validEmail) throw new BadRequestError('Invalid email');

        // Find a user with the constructed where condition
        const existingUser: User | null = await User.findOne({
            where: { email },
            attributes: ['email', 'id'],
        });

        return existingUser;
    }

    static async addUser(userData: IUser): Promise<User> {
        const _transaction = await User.create({ ...userData });

        await UserSettings.create({
            userId: _transaction.id,
            joinDate: new Date().toISOString().split('T')[0], // yyyy-mm-dd format
        } as IUserSettings);

        return _transaction;
    }

    static async viewUsers(
        queryData?: IViewUsersQuery,
    ): Promise<{ users: User[]; count: number; totalPages?: number }> {
        const { page, size, q: query, isBlocked, isDeactivated, userType } = queryData || {};

        const where: Record<string | symbol, unknown> = {};
        const settingsWhere: Record<string, unknown> = {};

        if (query) {
            where[Op.or] = [
                { firstName: { [Op.iLike]: `%${query}%` } },
                { lastName: { [Op.iLike]: `%${query}%` } },
                { email: { [Op.iLike]: `%${query}%` } },
                Sequelize.where(
                    Sequelize.fn(
                        'concat',
                        Sequelize.col('User.firstName'),
                        ' ',
                        Sequelize.col('User.lastName'),
                    ),
                    { [Op.iLike]: `%${query}%` },
                ),
            ];
        }

        if (isBlocked !== undefined) {
            settingsWhere.isBlocked = isBlocked;
        }

        if (isDeactivated !== undefined) {
            settingsWhere.isDeactivated = isDeactivated;
        }

        // Add filter for the user type
        if (userType) {
            where['status'] = { [Op.contains]: { userType } };
        }

        // Use the model with the appropriate scope
        const UserSettingsModel =
            userType === 'agent' ? UserSettings.scope('withAgentMeta') : UserSettings;

        const queryOptions: FindAndCountOptions<User> = {
            where,
            include: [
                {
                    model: UserSettingsModel,
                    as: 'settings',
                    where: settingsWhere,
                    // No need to specify attributes - let the scope handle it
                },
            ],
        };

        if (page && size && page > 0 && size > 0) {
            const { limit, offset } = Pagination.getPagination({ page, size } as IPaging);
            queryOptions.limit = limit ?? 0;
            queryOptions.offset = offset ?? 0;
        }

        const { rows: users, count } = await User.findAndCountAll(queryOptions);

        // Calculate the total count
        const totalCount = (count as unknown as []).length;

        if (page && size && users.length > 0) {
            const totalPages = Pagination.estimateTotalPage({
                count: totalCount,
                limit: size,
            } as IPaging);
            return { users, count: totalCount, ...totalPages };
        } else {
            return { users, count: totalCount };
        }
    }

    static async viewSingleUser(id: string): Promise<User> {
        const user: User | null = await User.scope('withSettings').findByPk(id);

        if (!user) {
            throw new NotFoundError('Oops User not found');
        }

        return user;
    }

    static async viewSingleUserByEmail(email: string, transaction?: Transaction): Promise<User> {
        const user: User | null = await User.findOne({
            where: { email },
            attributes: ['id', 'firstName', 'status', 'email'],
            transaction,
        });

        if (!user) {
            throw new NotFoundError('Oops User not found');
        }

        return user;
    }

    static async viewSingleUserDynamic(queryOptions: IDynamicQueryOptions): Promise<User> {
        const { query, attributes } = queryOptions;

        const user: User | null = await User.scope('withSettings').findOne({
            where: query,
            ...(attributes ? { attributes } : {}),
        });

        if (!user) {
            throw new NotFoundError('Oops User not found');
        }

        return user;
    }

    static async updateUser(user: User, dataToUpdate: Partial<IUser>): Promise<User> {
        await user.update(dataToUpdate);

        const updatedUser = await this.viewSingleUser(user.id);

        return updatedUser;
    }

    static async updateUserSettings(
        userId: string,
        settingsData: Partial<IUserSettings>,
    ): Promise<UserSettings> {
        const userSettings = await UserSettings.findOne({ where: { userId } });

        if (!userSettings) {
            throw new NotFoundError('User settings not found');
        }

        await userSettings.update(settingsData);
        return userSettings;
    }

    static async deleteUser(user: User, transaction?: Transaction): Promise<void> {
        transaction ? await user.destroy({ transaction }) : await user.destroy();
    }

    static async findOrCreateUserByGoogleProfile({
        email,
        firstName,
        lastName,
        googleId,
        displayImage,
        status,
    }: {
        email: string;
        firstName: string;
        lastName: string;
        googleId: string;
        displayImage?: string;
        status: {
            activated: boolean;
            emailVerified: boolean;
            userType: 'customer' | 'agent';
        };
    }) {
        return await Database.transaction(async (t: Transaction) => {
            // Try to find existing user
            let user = await User.findOne({
                where: { email },
                transaction: t,
            });

            if (!user) {
                // Create new user if not found
                user = await User.create(
                    {
                        email,
                        firstName,
                        lastName,
                        googleId,
                        displayImage,
                        status,
                    },
                    { transaction: t },
                );
            } else {
                // Update existing user's Google info
                await user.update(
                    {
                        googleId,
                        displayImage: displayImage || user.displayImage,
                        status: {
                            ...user.status,
                            emailVerified: true,
                        },
                    },
                    { transaction: t },
                );
            }

            return user;
        });
    }
}
