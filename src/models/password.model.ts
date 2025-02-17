// Import necessary modules and dependencies
import { Table, Column, Model, DataType, IsUUID, PrimaryKey, Default, BeforeCreate, BeforeUpdate, BelongsTo, ForeignKey } from 'sequelize-typescript';
import User from './user.model';
import bcrypt from 'bcrypt';

// Define the "Password" table model
@Table
export default class Password extends Model<Password | IPassword> {
    // Define a primary key field with a UUID (Universally Unique Identifier) as its type
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column
        id: string;

    @Column({ type: DataType.STRING, allowNull: false })
        password: string;  
        
    @Column({ type: DataType.STRING, allowNull: true })
        transactionPin: string;
    
    // === ASSOCIATIONS, HOOKS, METHODS ===
        
    // Define an association between this model and the "User" model
    @BelongsTo(() => User)
        user: User;
    
    @IsUUID(4)
    @ForeignKey(() => User)
    @Column
        userId: string;
    
    @BeforeCreate
    static hashPasswordBeforeCreate(instance: Password) {
        if (instance.password) {
            instance.password = bcrypt.hashSync(instance.password, bcrypt.genSaltSync(10));
        }

        if (instance.transactionPin) {
            instance.transactionPin = bcrypt.hashSync(instance.transactionPin, bcrypt.genSaltSync(10));
        }
    }

    @BeforeUpdate
    static hashPasswordBeforeUpdate(instance: Password) {
        console.log('hashing password before update');
        if (instance.password) {
            instance.password = bcrypt.hashSync(instance.password, bcrypt.genSaltSync(10));
        }

        if (instance.transactionPin) {
            instance.transactionPin = bcrypt.hashSync(instance.transactionPin, bcrypt.genSaltSync(10));
        }
    }

    // Method to check if a provided password is valid
    isValidPassword(password: string): boolean {
        if (!this.password) return false;
        return bcrypt.compareSync(password, this.password);
    }

    // Method to check if a provided transaction pin is valid
    isValidTransactionPin(transactionPin: string): boolean {
        if (!this.transactionPin) return false;
        return bcrypt.compareSync(transactionPin, this.transactionPin);
    }

    // remove password from json response
    toJSON() {
        const values = Object.assign({}, this.get());
        delete values.password;
        return values;
    }

}


export interface IPassword {
    password?: string; 
    transactionPin?: string;
    userId: string;
}
