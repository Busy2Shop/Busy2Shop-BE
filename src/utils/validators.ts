import z from 'zod';
import { version as uuidVersion } from 'uuid';
import { validate as uuidValidate } from 'uuid';

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

    static isValidPhoneNumber(phoneNumber: string): boolean {
        const phoneRegex = /^\+?[0-9]{10,14}$/;
        const phoneSchema = z.string().refine(phone => phoneRegex.test(phone));
        return phoneSchema.safeParse(phoneNumber).success;
    }

    static isValidPassword(password: string): boolean {
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@#$&*-^!])[a-zA-Z\d@#$&*-^!]{6,}$/;
        return passwordRegex.test(password);
    }

    static isValidMimeType(mimeType: string): boolean {
        const imageTypes = [
            'image/jpeg', 'image/jpg',
            'image/png', 'image/gif', 'image/webp', 'image/tiff',
            'image/bmp', 'image/vnd.microsoft.icon', 'image/svg+xml',
        ];
        const videoTypes = [
            'video/mp4', 'video/mpeg', 'video/ogg', 'video/webm', 'video/avi',
            'video/mov', 'video/flv', 'video/quicktime', 'video/x-ms-wmv', 'video/x-flv',
            'video/3gpp', 'video/3gpp2',
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

    static isValidFilename(filename: string): { isValid: boolean, extension: string | null } {
        const parts = filename.split('.');
        const extension = parts.length > 1 ? `.${parts[parts.length - 1]}` : null;
        const isValid = extension !== null;
        return { isValid, extension };
    }

}

export default Validator;