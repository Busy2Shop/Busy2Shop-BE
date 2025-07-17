import { Op } from 'sequelize';
import UserAddress, { IUserAddress, AddressType } from '../models/userAddress.model';
import User from '../models/user.model';
import { NotFoundError, BadRequestError } from '../utils/customErrors';

export default class UserAddressService {
    // Get all addresses for a user (sorted by recently used, then default, then created)
    static async getUserAddresses(userId: string): Promise<UserAddress[]> {
        const addresses = await UserAddress.findAll({
            where: { 
                userId,
                isActive: true 
            },
            order: [
                ['isDefault', 'DESC'],
                ['lastUsedAt', 'DESC NULLS LAST'],
                ['createdAt', 'DESC']
            ]
        });

        return addresses;
    }

    // Get address by ID (with user ownership validation)
    static async getAddressById(addressId: string, userId: string): Promise<UserAddress> {
        const address = await UserAddress.findOne({
            where: { 
                id: addressId,
                userId,
                isActive: true 
            }
        });

        if (!address) {
            throw new NotFoundError('Address not found or access denied');
        }

        return address;
    }

    // Create new address
    static async createAddress(addressData: IUserAddress): Promise<UserAddress> {
        // Validate user exists
        const user = await User.findByPk(addressData.userId);
        if (!user) {
            throw new NotFoundError('User not found');
        }

        // Check if address already exists (by Google Place ID or full address)
        let existingAddress = null;
        if (addressData.googlePlaceId) {
            existingAddress = await UserAddress.findOne({
                where: {
                    userId: addressData.userId,
                    googlePlaceId: addressData.googlePlaceId,
                    isActive: true
                }
            });
        } else {
            existingAddress = await UserAddress.findOne({
                where: {
                    userId: addressData.userId,
                    fullAddress: addressData.fullAddress,
                    isActive: true
                }
            });
        }

        if (existingAddress) {
            // Update last used and return existing address
            await existingAddress.markAsUsed();
            return existingAddress;
        }

        // If this is the first address or explicitly set as default, make it default
        const existingAddressCount = await UserAddress.count({
            where: { 
                userId: addressData.userId,
                isActive: true 
            }
        });

        if (existingAddressCount === 0) {
            addressData.isDefault = true;
        }

        // Create the address
        const address = await UserAddress.create(addressData);

        return address;
    }

    // Update existing address
    static async updateAddress(addressId: string, userId: string, updateData: Partial<IUserAddress>): Promise<UserAddress> {
        const address = await this.getAddressById(addressId, userId);

        // Update the address
        await address.update(updateData);

        return address;
    }

    // Delete address (soft delete by setting isActive to false)
    static async deleteAddress(addressId: string, userId: string): Promise<void> {
        const address = await this.getAddressById(addressId, userId);

        // If this is the default address, we need to set another as default
        if (address.isDefault) {
            const otherAddresses = await UserAddress.findAll({
                where: { 
                    userId,
                    id: { [Op.ne]: addressId },
                    isActive: true 
                },
                order: [['createdAt', 'DESC']],
                limit: 1
            });

            if (otherAddresses.length > 0) {
                await otherAddresses[0].update({ isDefault: true });
            }
        }

        // Soft delete the address
        await address.update({ isActive: false });
    }

    // Set address as default
    static async setDefaultAddress(addressId: string, userId: string): Promise<UserAddress> {
        const address = await this.getAddressById(addressId, userId);

        // The model's beforeUpdate hook will handle setting other addresses to non-default
        await address.update({ isDefault: true });

        return address;
    }

    // Get default address for user
    static async getDefaultAddress(userId: string): Promise<UserAddress | null> {
        const address = await UserAddress.findOne({
            where: { 
                userId,
                isDefault: true,
                isActive: true 
            }
        });

        return address;
    }

    // Validate address using geocoding (placeholder for future implementation)
    static async validateAddress(addressData: {
        address: string;
        city: string;
        state: string;
        country: string;
    }): Promise<{
        isValid: boolean;
        formatted?: string;
        latitude?: number;
        longitude?: number;
        suggestions?: string[];
        errors?: string[];
    }> {
        // Placeholder implementation
        // In a real application, you would integrate with a geocoding service
        // like Google Maps API, HERE API, or similar

        const { address, city, state, country } = addressData;
        const errors: string[] = [];

        // Basic validation
        if (!address.trim()) {
            errors.push('Street address is required');
        }

        if (!city.trim()) {
            errors.push('City is required');
        }

        if (!state.trim()) {
            errors.push('State is required');
        }

        // Simple Nigeria state validation
        const nigerianStates = [
            'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
            'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
            'FCT', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi',
            'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun',
            'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara'
        ];

        if (country.toLowerCase() === 'nigeria' && 
            !nigerianStates.some(s => s.toLowerCase() === state.toLowerCase())) {
            errors.push('Invalid Nigerian state');
        }

        const isValid = errors.length === 0;
        const formatted = isValid ? `${address}, ${city}, ${state}, ${country}` : undefined;

        return {
            isValid,
            formatted,
            errors: errors.length > 0 ? errors : undefined,
            // Mock coordinates for now
            ...(isValid && {
                latitude: 6.5244 + (Math.random() - 0.5) * 0.1, // Lagos area with some variation
                longitude: 3.3792 + (Math.random() - 0.5) * 0.1
            })
        };
    }

    // Get addresses by type
    static async getAddressesByType(userId: string, type: AddressType): Promise<UserAddress[]> {
        const addresses = await UserAddress.findAll({
            where: { 
                userId,
                type,
                isActive: true 
            },
            order: [
                ['isDefault', 'DESC'],
                ['createdAt', 'DESC']
            ]
        });

        return addresses;
    }

    // Get address statistics for user
    static async getAddressStatistics(userId: string): Promise<{
        total: number;
        byType: Record<string, number>;
        hasDefault: boolean;
    }> {
        const addresses = await UserAddress.findAll({
            where: { 
                userId,
                isActive: true 
            }
        });

        const byType = addresses.reduce((acc, address) => {
            const type = address.type || 'other';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const hasDefault = addresses.some(addr => addr.isDefault);

        return {
            total: addresses.length,
            byType,
            hasDefault
        };
    }

    // Bulk create addresses (useful for migration or import)
    static async bulkCreateAddresses(addressesData: IUserAddress[]): Promise<UserAddress[]> {
        // Group by userId to handle default address logic
        const addressesByUser = addressesData.reduce((acc, addr) => {
            if (!acc[addr.userId]) {
                acc[addr.userId] = [];
            }
            acc[addr.userId].push(addr);
            return acc;
        }, {} as Record<string, IUserAddress[]>);

        const createdAddresses: UserAddress[] = [];

        for (const [userId, userAddresses] of Object.entries(addressesByUser)) {
            // Check if user has existing addresses
            const existingCount = await UserAddress.count({
                where: { userId, isActive: true }
            });

            // If no existing addresses, make the first one default
            if (existingCount === 0 && userAddresses.length > 0) {
                userAddresses[0].isDefault = true;
            }

            // Create addresses for this user
            const addresses = await UserAddress.bulkCreate(userAddresses);
            createdAddresses.push(...addresses);
        }

        return createdAddresses;
    }

    // Mark address as used (call this when address is selected for delivery)
    static async markAddressAsUsed(addressId: string, userId: string): Promise<UserAddress> {
        const address = await this.getAddressById(addressId, userId);
        await address.markAsUsed();
        return address;
    }

    // Create address from Google Places data
    static async createAddressFromGooglePlace(
        userId: string, 
        googlePlaceData: any,
        title?: string
    ): Promise<UserAddress> {
        // Extract address components from Google Places data
        const addressData: IUserAddress = {
            userId,
            title: title || '',
            fullAddress: googlePlaceData.formatted_address || googlePlaceData.name,
            googlePlaceId: googlePlaceData.place_id,
            googlePlaceData: googlePlaceData,
            latitude: googlePlaceData.geometry?.location?.lat,
            longitude: googlePlaceData.geometry?.location?.lng,
        };

        // Extract detailed address components
        if (googlePlaceData.address_components) {
            for (const component of googlePlaceData.address_components) {
                const types = component.types;
                
                if (types.includes('street_number') || types.includes('route')) {
                    addressData.address = addressData.address 
                        ? `${addressData.address} ${component.long_name}`
                        : component.long_name;
                }
                
                if (types.includes('locality') || types.includes('administrative_area_level_2')) {
                    addressData.city = component.long_name;
                }
                
                if (types.includes('administrative_area_level_1')) {
                    addressData.state = component.long_name;
                }
                
                if (types.includes('country')) {
                    addressData.country = component.long_name;
                }
                
                if (types.includes('postal_code')) {
                    addressData.postalCode = component.long_name;
                }
            }
        }

        return this.createAddress(addressData);
    }
}