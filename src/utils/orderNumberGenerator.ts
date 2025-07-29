// src/utils/orderNumberGenerator.ts
import { Op } from 'sequelize';
import Order from '../models/order.model';

/**
 * Generates a short, random, and unique order number
 * Format: B2S-XXXXX
 * Where:
 * - B2S: Busy2Shop prefix
 * - XXXXX: 5-character alphanumeric code (excluding confusing chars like 0, O, I, 1)
 */
export class OrderNumberGenerator {
    // Character set excluding confusing characters (0, O, I, 1, L)
    private static readonly CHAR_SET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    
    /**
     * Generate a unique order number
     */
    static async generateOrderNumber(): Promise<string> {
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
            // Generate a 5-character random code
            let randomCode = '';
            for (let i = 0; i < 5; i++) {
                const randomIndex = Math.floor(Math.random() * this.CHAR_SET.length);
                randomCode += this.CHAR_SET[randomIndex];
            }
            
            // Combine parts: B2S-XXXXX
            const orderNumber = `B2S-${randomCode}`;
            
            // Check if this order number already exists
            const existingOrder = await Order.findOne({
                where: { orderNumber }
            });
            
            if (!existingOrder) {
                return orderNumber;
            }
            
            attempts++;
        }
        
        // Fallback: if we can't generate unique after 10 attempts, add timestamp
        const timestamp = Date.now().toString().slice(-4);
        const randomCode = this.generateRandomCode(3);
        return `B2S-${randomCode}${timestamp}`;
    }
    
    /**
     * Generate a random code of specified length
     */
    private static generateRandomCode(length: number): string {
        let code = '';
        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * this.CHAR_SET.length);
            code += this.CHAR_SET[randomIndex];
        }
        return code;
    }
    
    /**
     * Validate order number format
     */
    static validateOrderNumber(orderNumber: string): boolean {
        // Updated regex for new format: B2S-XXXXX or B2S-XXXXXXX (with timestamp fallback)
        const orderNumberRegex = /^B2S-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5,7}$/;
        return orderNumberRegex.test(orderNumber);
    }
    
    /**
     * Extract the code part from order number
     */
    static extractCodeFromOrderNumber(orderNumber: string): string | null {
        if (!this.validateOrderNumber(orderNumber)) {
            return null;
        }
        
        const parts = orderNumber.split('-');
        return parts[1] || null;
    }
    
    /**
     * Check if order number uses timestamp fallback format
     */
    static isTimestampFallback(orderNumber: string): boolean {
        const code = this.extractCodeFromOrderNumber(orderNumber);
        return code ? code.length > 5 : false;
    }
}

export default OrderNumberGenerator;