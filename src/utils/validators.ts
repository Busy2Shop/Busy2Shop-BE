import z from 'zod';
import { version as uuidVersion, validate as uuidValidate } from 'uuid';
import phone from 'phone';

export interface IFileDataType {
    mimeType: string;
    fileName: string;
    fileSizeInBytes: number;
    durationInSeconds?: number;
}

class Validator {
    static isValidEmail(email: string): boolean {
        const emailSchema = z.string().email();
        return emailSchema.safeParse(email).success;
    }

    static isValidPhone(phoneNumber: string): boolean {
        const result = phone(phoneNumber);
        return result.isValid;
    }

    static isValidCountryCode(countryCode: string): boolean {
        // Country code validation rules:
        // 1. Must start with + or 00
        // 2. Followed by 1-4 digits
        // 3. Common country codes are 1-3 digits
        return /^(\+|00)[1-9]\d{0,3}$/.test(countryCode);
    }

    static formatPhoneNumber(countryCode: string, number: string): string {
        // Remove any non-digit characters from both inputs
        const cleanCountryCode = countryCode.replace(/\D/g, '');
        const cleanNumber = number.replace(/\D/g, '');

        // Combine and format as E.164
        return `+${cleanCountryCode}${cleanNumber}`;
    }

    static parsePhoneNumber(phoneNumber: string): { countryCode: string; number: string } {
        const result = phone(phoneNumber);
        if (!result.isValid) {
            throw new Error('Invalid phone number format');
        }
        return {
            countryCode: result.countryCode,
            number: result.phoneNumber.replace(result.countryCode, ''),
        };
    }

    static isValidPassword(password: string): boolean {
        //validate password - minimum 6 characters, at least one letter
        const passwordRegex = /^(?=.*[A-Za-z])[A-Za-z\d\W]{6,}$/;
        return passwordRegex.test(password);
    }

    static isValidName(name: string): boolean {
        const nameRegex = /^[a-zA-Z\s'-]+$/;
        return nameRegex.test(name);
    }

    static isValidAddress(address: string): boolean {
        return address.length >= 5 && address.length <= 200;
    }

    static isValidDescription(description: string): boolean {
        return description.length >= 10 && description.length <= 1000;
    }

    static isValidUrl(url: string): boolean {
        const urlSchema = z.string().url();
        return urlSchema.safeParse(url).success;
    }

    static isValidDate(date: string): boolean {
        const dateSchema = z.string().datetime();
        return dateSchema.safeParse(date).success;
    }

    static isValidPrice(price: number): boolean {
        return price >= 0 && price <= 1000000;
    }

    static isValidQuantity(quantity: number): boolean {
        return Number.isInteger(quantity) && quantity >= 1 && quantity <= 1000;
    }

    static isValidMimeType(mimeType: string): boolean {
        const imageTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/tiff',
            'image/bmp',
            'image/vnd.microsoft.icon',
            'image/svg+xml',
        ];
        const videoTypes = [
            'video/mp4',
            'video/mpeg',
            'video/ogg',
            'video/webm',
            'video/avi',
            'video/mov',
            'video/flv',
            'video/quicktime',
            'video/x-ms-wmv',
            'video/x-flv',
            'video/3gpp',
            'video/3gpp2',
            'video/x-matroska',
        ];
        // Combining all MIME types into a single pattern
        const allTypes = [...imageTypes, ...videoTypes];
        const mimeTypeSchema = z.enum(allTypes as [string, ...string[]]);

        return mimeTypeSchema.safeParse(mimeType).success;
    }

    static isUUID(uuid: string): boolean {
        return uuidValidate(uuid) && uuidVersion(uuid) === 4;
    }

    static isValidFilename(filename: string): { isValid: boolean; extension: string | null } {
        const parts = filename.split('.');
        const extension = parts.length > 1 ? `.${parts[parts.length - 1]}` : null;
        const isValid = extension !== null;
        return { isValid, extension };
    }
}

export default Validator;
