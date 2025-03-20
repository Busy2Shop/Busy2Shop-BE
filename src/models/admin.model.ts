
import { Table, Column, Model, DataType, IsUUID, PrimaryKey, Default, IsEmail, Unique } from 'sequelize-typescript';

export enum AdminType {
    SUPER_ADMIN = 'superAdmin',
    ADMIN = 'admin',
    VENDOR = 'vendor'
}

@Table
export default class Admin extends Model<Admin | IAdmin> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
        id: string;

    @Column({ type: DataType.STRING, allowNull: false })
        name: string;

    @IsEmail
    @Unique
    @Column({ type: DataType.STRING, allowNull: false })
        email: string;

    @Column({
        type: DataType.ENUM(...Object.values(AdminType)),
        defaultValue: AdminType.ADMIN,
    })
        adminType: AdminType;

    @Column({ type: DataType.STRING, allowNull: true })
        supermarketId: string;
}

export interface IAdmin {
    name: string;
    email: string;
    adminType?: AdminType;
    supermarketId?: string;
}