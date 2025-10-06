import { IShoppingListItem } from '../models/shoppingListItem.model';

export default class PriceCalculatorService {
    /**
     * Get the effective price for an item following standardized precedence:
     * 1. actualPrice (only for completed orders)
     * 2. userSetPrice (user manually entered)
     * 3. discountedPrice (system-calculated with applied discounts)
     * 4. userProvidedPrice (user provided for items without estimated price)
     * 5. estimatedPrice (product default)
     *
     * @param item Shopping list item
     * @param includeActualPrice Whether to include actualPrice in precedence (for completed orders)
     * @returns Effective price following precedence rules
     */
    static getEffectivePrice(item: Partial<IShoppingListItem>, includeActualPrice: boolean = false): number {
        // Follow standardized precedence
        if (includeActualPrice && item.actualPrice !== null && item.actualPrice !== undefined) {
            return this.roundPrice(item.actualPrice);
        }

        if (item.userSetPrice !== null && item.userSetPrice !== undefined) {
            return this.roundPrice(item.userSetPrice);
        }

        if (item.discountedPrice !== null && item.discountedPrice !== undefined) {
            return this.roundPrice(item.discountedPrice);
        }

        if (item.userProvidedPrice !== null && item.userProvidedPrice !== undefined) {
            return this.roundPrice(item.userProvidedPrice);
        }

        if (item.estimatedPrice !== null && item.estimatedPrice !== undefined) {
            return this.roundPrice(item.estimatedPrice);
        }

        return 0;
    }

    /**
     * Calculate total price for an item considering quantity
     * @param item Shopping list item
     * @param quantity Item quantity (defaults to item.quantity or 1)
     * @returns Total price for the item
     */
    static calculateItemTotal(
        item: Partial<IShoppingListItem>,
        quantity?: number,
        includeActualPrice: boolean = false
    ): number {
        const effectivePrice = this.getEffectivePrice(item, includeActualPrice);
        const itemQuantity = quantity ?? item.quantity ?? 1;
        return this.roundPrice(effectivePrice * itemQuantity);
    }

    /**
     * Validate if a price is within acceptable range
     * @param price Price to validate
     * @returns Validation result with error message if invalid
     */
    static validatePrice(price: number | null | undefined): { valid: boolean; error?: string } {
        if (price === null || price === undefined) {
            return { valid: true }; // Null/undefined prices are allowed
        }

        if (price < 0) {
            return { valid: false, error: 'Price cannot be negative' };
        }

        if (price < 10 && price > 0) {
            return { valid: false, error: 'Minimum price is ₦10' };
        }

        if (price > 100000) {
            return { valid: false, error: 'Maximum price is ₦100,000' };
        }

        return { valid: true };
    }

    /**
     * Round price to 2 decimal places consistently
     * @param value Price value to round
     * @returns Rounded price
     */
    static roundPrice(value: number): number {
        return Math.round(value * 100) / 100;
    }

    /**
     * Calculate subtotal for a list of items
     * @param items List of shopping list items
     * @param includeActualPrice Whether to use actual prices (for completed orders)
     * @returns Rounded subtotal
     */
    static calculateSubtotal(
        items: Partial<IShoppingListItem>[],
        includeActualPrice: boolean = false
    ): number {
        const total = items.reduce((sum, item) => {
            return sum + this.calculateItemTotal(item, item.quantity, includeActualPrice);
        }, 0);

        return this.roundPrice(total);
    }

    /**
     * Apply markup percentage to a price
     * @param price Original price
     * @param markupPercentage Markup percentage (default 10%)
     * @returns Price with markup applied
     */
    static applyMarkup(price: number, markupPercentage: number = 10): number {
        if (price <= 0) {
            return 0;
        }

        const markup = (price * markupPercentage) / 100;
        return this.roundPrice(price + markup);
    }

    /**
     * Apply discount to a price with validation
     * @param price Original price
     * @param discountType Type of discount (percentage or fixed_amount)
     * @param discountValue Discount value
     * @param maxDiscount Maximum discount amount allowed
     * @returns Discounted price
     */
    static applyDiscount(
        price: number,
        discountType: 'percentage' | 'fixed_amount',
        discountValue: number,
        maxDiscount?: number
    ): number {
        let discountAmount = 0;

        if (discountType === 'percentage') {
            discountAmount = (price * discountValue) / 100;
        } else if (discountType === 'fixed_amount') {
            discountAmount = discountValue;
        }

        // Apply maximum discount cap if specified
        if (maxDiscount && discountAmount > maxDiscount) {
            discountAmount = maxDiscount;
        }

        // Ensure price doesn't go below 0
        const discountedPrice = Math.max(0, price - discountAmount);

        return this.roundPrice(discountedPrice);
    }

    /**
     * Validate discount constraints
     * @param subtotal Order subtotal
     * @param discountAmount Proposed discount amount
     * @param maxDiscountPercentage Maximum discount percentage allowed (default 30%)
     * @param maxSingleDiscountAmount Maximum single discount amount (default ₦2000)
     * @returns Validation result
     */
    static validateDiscountConstraints(
        subtotal: number,
        discountAmount: number,
        maxDiscountPercentage: number = 30,
        maxSingleDiscountAmount: number = 2000
    ): { valid: boolean; error?: string; cappedAmount?: number } {
        if (discountAmount < 0) {
            return { valid: false, error: 'Discount amount cannot be negative' };
        }

        const discountPercentage = (discountAmount / subtotal) * 100;

        if (discountPercentage > maxDiscountPercentage) {
            const cappedAmount = this.roundPrice(subtotal * (maxDiscountPercentage / 100));
            return {
                valid: false,
                error: `Discount exceeds maximum ${maxDiscountPercentage}% of subtotal`,
                cappedAmount,
            };
        }

        if (discountAmount > maxSingleDiscountAmount) {
            return {
                valid: false,
                error: `Discount exceeds maximum single discount amount of ₦${maxSingleDiscountAmount}`,
                cappedAmount: maxSingleDiscountAmount,
            };
        }

        if (discountAmount >= subtotal * 0.7) {
            const cappedAmount = this.roundPrice(subtotal * 0.7);
            return {
                valid: false,
                error: 'Discount cannot exceed 70% of order value',
                cappedAmount,
            };
        }

        return { valid: true };
    }

    /**
     * Get price source indicator for an item
     * @param item Shopping list item
     * @param includeActualPrice Whether actual price is being considered
     * @returns Price source indicator string
     */
    static getPriceSource(item: Partial<IShoppingListItem>, includeActualPrice: boolean = false): string {
        if (includeActualPrice && item.actualPrice !== null && item.actualPrice !== undefined) {
            return 'actualPrice';
        }

        if (item.userSetPrice !== null && item.userSetPrice !== undefined) {
            return 'userSetPrice';
        }

        if (item.discountedPrice !== null && item.discountedPrice !== undefined) {
            return 'discountedPrice';
        }

        if (item.userProvidedPrice !== null && item.userProvidedPrice !== undefined) {
            return 'userProvidedPrice';
        }

        if (item.estimatedPrice !== null && item.estimatedPrice !== undefined) {
            return 'estimatedPrice';
        }

        return 'none';
    }
}