/* eslint-disable no-unused-vars */
import {
    Table,
    Column,
    Model,
    DataType,
    IsUUID,
    PrimaryKey,
    BelongsTo, Default,
    ForeignKey,
} from 'sequelize-typescript';
import User from './user.model';
import { NotificationTypes } from '../utils/interface';

@Table
export default class Notification extends Model<INotification | Notification> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
        id: string;

    @Column({ type: DataType.STRING, values: Object.values(NotificationTypes), allowNull: false })
        title: NotificationTypes;

    @Column({ type: DataType.TEXT, allowNull: false })
        message: string;

    @Column({ type: DataType.STRING, allowNull: false })
        heading: string;

    @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
        read: boolean;

    @Column({ type: DataType.STRING, allowNull: true })
        resource: string;

    // @Column({ type: DataType.STRING, allowNull: true })
    //     pointer: string;
    
    @Column({ type: DataType.STRING, allowNull: true })
        icon: string;
    
    @ForeignKey(() => User)
    @IsUUID(4)
    @Column({ type: DataType.STRING, allowNull: false })
        userId: string;

    @BelongsTo(() => User, 'userId')
        user: User;

    @ForeignKey(() => User)
    @IsUUID(4)
    @Column({ type: DataType.STRING, allowNull: true })
        actorId: string;

    @BelongsTo(() => User, 'actorId')
        actor: User;

}


export interface INotification {
    id: string;
    title: string;
    message: string;
    heading: string;
    read: boolean;
    icon?: string;
    resource?: string;
    // pointer?: string;
    userId: string;
    actorId?: string; 
}
