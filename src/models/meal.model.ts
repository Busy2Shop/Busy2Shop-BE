import {
    Table,
    Column,
    Model,
    DataType,
    IsUUID,
    PrimaryKey,
    Default,
    HasMany,
    BelongsToMany,
} from 'sequelize-typescript';
import MealIngredient from './mealIngredient.model';
import Product from './product.model';

@Table
export default class Meal extends Model<Meal> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column(DataType.UUID)
    id: string;

    @Column({
        type: DataType.STRING,
        allowNull: false,
    })
    name: string;

    @Column({
        type: DataType.TEXT,
        allowNull: true,
    })
    description: string;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    image: string;

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    category: string; // e.g., 'main_course', 'soup', 'side_dish'

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    cuisine: string; // e.g., 'nigerian', 'western', 'asian'

    @Column({
        type: DataType.INTEGER,
        defaultValue: 4,
    })
    servings: number; // Default servings

    @Column({
        type: DataType.INTEGER,
        allowNull: true,
    })
    prepTime: number; // in minutes

    @Column({
        type: DataType.INTEGER,
        allowNull: true,
    })
    cookTime: number; // in minutes

    @Column({
        type: DataType.ENUM('easy', 'medium', 'hard'),
        defaultValue: 'medium',
    })
    difficulty: 'easy' | 'medium' | 'hard';

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: true,
    })
    estimatedCost: number; // Estimated cost for base servings

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: true,
    })
    isActive: boolean;

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: false,
    })
    isPopular: boolean;

    @Column({
        type: DataType.INTEGER,
        defaultValue: 0,
    })
    sortOrder: number;

    @Column({
        type: DataType.ARRAY(DataType.STRING),
        allowNull: true,
    })
    tags: string[]; // e.g., ['spicy', 'vegetarian', 'quick']

    @Column({
        type: DataType.TEXT,
        allowNull: true,
    })
    instructions: string; // Cooking instructions

    @HasMany(() => MealIngredient)
    mealIngredients: MealIngredient[];

    @BelongsToMany(() => Product, () => MealIngredient)
    ingredients: Product[];
}

export interface IMeal {
    id?: string;
    name: string;
    description?: string;
    image?: string;
    category?: string;
    cuisine?: string;
    servings?: number;
    prepTime?: number;
    cookTime?: number;
    difficulty?: 'easy' | 'medium' | 'hard';
    estimatedCost?: number;
    isActive?: boolean;
    isPopular?: boolean;
    sortOrder?: number;
    tags?: string[];
    instructions?: string;
}
