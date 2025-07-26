import { Response, Request } from 'express';
import { AdminAuthenticatedRequest } from '../middlewares/authMiddleware';
import SystemSettingsService from '../services/systemSettings.service';
import { SYSTEM_SETTING_KEYS, SystemSettingValueMap } from '../models/systemSettings.model';
import { BadRequestError } from '../utils/customErrors';

export default class SystemSettingsController {
    /**
     * Get public system settings (no authentication required)
     */
    static async getPublicSettings(req: Request, res: Response) {
        try {
            const publicSettings = await SystemSettingsService.getPublicSettings();
            
            res.status(200).json({
                status: 'success',
                message: 'Public settings retrieved successfully',
                data: publicSettings,
            });
        } catch (error) {
            console.error('Error getting public settings:', error);
            res.status(500).json({
                status: 'error',
                message: 'Failed to retrieve settings',
                data: null,
            });
        }
    }

    /**
     * Get all settings (admin only)
     */
    static async getAllSettings(req: AdminAuthenticatedRequest, res: Response) {
        const settings = await SystemSettingsService.getAllSettings();

        res.status(200).json({
            status: 'success',
            message: 'All settings retrieved successfully',
            data: settings,
        });
    }

    /**
     * Get settings by category (admin only)
     */
    static async getSettingsByCategory(req: AdminAuthenticatedRequest, res: Response) {
        const { category } = req.params;
        const settings = await SystemSettingsService.getSettingsByCategory(category);

        res.status(200).json({
            status: 'success',
            message: `Settings for category '${category}' retrieved successfully`,
            data: settings,
        });
    }

    /**
     * Update a setting (admin only)
     */
    static async updateSetting(req: AdminAuthenticatedRequest, res: Response) {
        const { key } = req.params;
        const { value, description, category, isPublic } = req.body;

        if (value === undefined) {
            throw new BadRequestError('Setting value is required');
        }

        // Validate that the key is a known setting key
        const validKeys = Object.values(SYSTEM_SETTING_KEYS) as string[];
        if (!validKeys.includes(key)) {
            throw new BadRequestError('Invalid setting key');
        }

        const updatedSetting = await SystemSettingsService.setSetting(
            key as any,
            value,
            {
                description,
                category,
                isPublic,
            }
        );

        res.status(200).json({
            status: 'success',
            message: `Setting '${key}' updated successfully`,
            data: updatedSetting,
        });
    }

    /**
     * Initialize default settings (admin only)
     */
    static async initializeDefaultSettings(req: AdminAuthenticatedRequest, res: Response) {
        await SystemSettingsService.initializeDefaultSettings();

        res.status(200).json({
            status: 'success',
            message: 'Default settings initialized successfully',
            data: null,
        });
    }

    /**
     * Clear settings cache (admin only)
     */
    static async clearCache(req: AdminAuthenticatedRequest, res: Response) {
        SystemSettingsService.clearCache();

        res.status(200).json({
            status: 'success',
            message: 'Settings cache cleared successfully',
            data: null,
        });
    }
}