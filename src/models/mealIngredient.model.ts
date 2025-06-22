import {
    Table,
    Column,
    Model,
    DataType,
    ForeignKey,
    BelongsTo,
    IsUUID,
    PrimaryKey,
    Default,
} from 'sequelize-typescript';
import Meal from './meal.model';
import Product from './product.model';

@Table
export default class MealIngredient extends Model<MealIngredient> {
    @IsUUID(4)
    @PrimaryKey
    @Default(DataType.UUIDV4)
    @Column(DataType.UUID)
    id: string;

    @IsUUID(4)
    @ForeignKey(() => Meal)
    @Column({
        type: DataType.UUID,
        allowNull: false,
    })
    mealId: string;

    @BelongsTo(() => Meal)
    meal: Meal;

    @IsUUID(4)
    @ForeignKey(() => Product)
    @Column({
        type: DataType.UUID,
        allowNull: true, // Can be null if it's a generic ingredient not linked to a specific product
    })
    productId: string | null;

    @BelongsTo(() => Product)
    product: Product;

    @Column({
        type: DataType.STRING,
        allowNull: false,
    })
    ingredientName: string; // e.g., "Rice", "Tomatoes"

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: false,
    })
    quantity: number; // Base quantity for default servings

    @Column({
        type: DataType.STRING,
        allowNull: true,
    })
    unit: string; // e.g., "cups", "pieces", "kg", "tbsp"

    @Column({
        type: DataType.TEXT,
        allowNull: true,
    })
    notes: string; // e.g., "or to taste", "chopped", "fresh"

    @Column({
        type: DataType.BOOLEAN,
        defaultValue: false,
    })
    isOptional: boolean; // Whether this ingredient is optional

    @Column({
        type: DataType.DECIMAL(10, 2),
        allowNull: true,
    })
    estimatedPrice: number; // Estimated price for this ingredient

    @Column({
        type: DataType.INTEGER,
        defaultValue: 0,
    })
    sortOrder: number; // Order in which ingredients should be displayed
}

export interface IMealIngredient {
    id?: string;
    mealId: string;
    productId?: string | null;
    ingredientName: string;
    quantity: number;
    unit?: string;
    notes?: string;
    isOptional?: boolean;
    estimatedPrice?: number;
    sortOrder?: number;
} 