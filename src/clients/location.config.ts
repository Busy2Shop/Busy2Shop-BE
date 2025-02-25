export interface AddressDetails {
    city?: string;
    state: string;
    country: string;
    countryCode: string;
}

export class LocationClientConfig {
    static async getAddressFromCoordinates(lat: number, lon: number): Promise<AddressDetails | null> {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&addressdetails=1`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                // If response is not okay, return null
                return null;
            }

            const data = await response.json();
            console.log('Address details:', data);
            // Check if city is not equal to state before including it in the response
            let city: string | undefined;
            if (data.address.city && data.address.city !== data.address.state) {
                city = data.address.city;
            }

            // Extract relevant information and create an instance of AddressDetails
            const addressDetails: AddressDetails = {
                city: city,
                state: data.address.state ?? '',
                country: data.address.country ?? '',
                countryCode: data.address.country_code ? data.address.country_code.toUpperCase() : '',
            };
            
            return addressDetails;
        } catch (error) {
            console.error('Failed to fetch address details:', error);
            return null;
        }
    }
}