// src/utils/googleMaps.ts
import { GOOGLE_MAPS_API_KEY } from './constants';
import { logger } from './logger';

interface Location {
    latitude: number;
    longitude: number;
}

interface DistanceMatrixResult {
    distance: number; // in kilometers
    duration: number; // in seconds
    status: 'OK' | 'NOT_FOUND' | 'ZERO_RESULTS' | 'MAX_ROUTE_LENGTH_EXCEEDED' | 'INVALID_REQUEST' | 'OVER_DAILY_LIMIT' | 'OVER_QUERY_LIMIT' | 'REQUEST_DENIED' | 'UNKNOWN_ERROR';
}

export class GoogleMapsService {
    /**
     * Calculate distance between two locations using Google Maps Distance Matrix API
     */
    static async calculateDistance(
        origin: Location,
        destination: Location
    ): Promise<DistanceMatrixResult> {
        if (!GOOGLE_MAPS_API_KEY) {
            logger.warn('Google Maps API key not configured, falling back to Haversine formula');
            return {
                distance: this.calculateHaversineDistance(origin, destination),
                duration: 0,
                status: 'OK'
            };
        }

        try {
            const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin.latitude},${origin.longitude}&destinations=${destination.latitude},${destination.longitude}&units=metric&key=${GOOGLE_MAPS_API_KEY}`;
            
            const response = await fetch(url);
            const data = await response.json();

            if (data.status !== 'OK') {
                logger.error('Google Maps API error:', data.status);
                // Fallback to Haversine calculation
                return {
                    distance: this.calculateHaversineDistance(origin, destination),
                    duration: 0,
                    status: 'OK'
                };
            }

            const element = data.rows[0]?.elements[0];
            if (!element || element.status !== 'OK') {
                logger.warn('Google Maps API: No route found, using Haversine distance');
                return {
                    distance: this.calculateHaversineDistance(origin, destination),
                    duration: 0,
                    status: 'OK'
                };
            }

            return {
                distance: element.distance.value / 1000, // Convert meters to kilometers
                duration: element.duration.value, // seconds
                status: 'OK'
            };
        } catch (error) {
            logger.error('Error calling Google Maps API:', error);
            // Fallback to Haversine calculation
            return {
                distance: this.calculateHaversineDistance(origin, destination),
                duration: 0,
                status: 'OK'
            };
        }
    }

    /**
     * Calculate distance between multiple origins and destinations
     */
    static async calculateDistanceMatrix(
        origins: Location[],
        destinations: Location[]
    ): Promise<DistanceMatrixResult[][]> {
        if (!GOOGLE_MAPS_API_KEY) {
            logger.warn('Google Maps API key not configured, falling back to Haversine formula');
            return origins.map(origin =>
                destinations.map(destination => ({
                    distance: this.calculateHaversineDistance(origin, destination),
                    duration: 0,
                    status: 'OK' as const
                }))
            );
        }

        try {
            // Format origins and destinations for the API
            const originsStr = origins.map(loc => `${loc.latitude},${loc.longitude}`).join('|');
            const destinationsStr = destinations.map(loc => `${loc.latitude},${loc.longitude}`).join('|');
            
            const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originsStr}&destinations=${destinationsStr}&units=metric&key=${GOOGLE_MAPS_API_KEY}`;
            
            const response = await fetch(url);
            const data = await response.json();

            if (data.status !== 'OK') {
                logger.error('Google Maps API error:', data.status);
                // Fallback to Haversine calculation
                return origins.map(origin =>
                    destinations.map(destination => ({
                        distance: this.calculateHaversineDistance(origin, destination),
                        duration: 0,
                        status: 'OK' as const
                    }))
                );
            }

            return data.rows.map((row: any, originIndex: number) =>
                row.elements.map((element: any, destIndex: number) => {
                    if (element.status !== 'OK') {
                        return {
                            distance: this.calculateHaversineDistance(origins[originIndex], destinations[destIndex]),
                            duration: 0,
                            status: 'OK' as const
                        };
                    }

                    return {
                        distance: element.distance.value / 1000, // Convert meters to kilometers
                        duration: element.duration.value, // seconds
                        status: 'OK' as const
                    };
                })
            );
        } catch (error) {
            logger.error('Error calling Google Maps Distance Matrix API:', error);
            // Fallback to Haversine calculation
            return origins.map(origin =>
                destinations.map(destination => ({
                    distance: this.calculateHaversineDistance(origin, destination),
                    duration: 0,
                    status: 'OK' as const
                }))
            );
        }
    }

    /**
     * Calculate distance between two points using the Haversine formula (fallback method)
     */
    private static calculateHaversineDistance(origin: Location, destination: Location): number {
        const R = 6371; // Radius of the earth in km
        const dLat = this.deg2rad(destination.latitude - origin.latitude);
        const dLon = this.deg2rad(destination.longitude - origin.longitude);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.deg2rad(origin.latitude)) *
                Math.cos(this.deg2rad(destination.latitude)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in km
    }

    /**
     * Convert degrees to radians
     */
    private static deg2rad(deg: number): number {
        return deg * (Math.PI / 180);
    }

    /**
     * Find the nearest location from a list of candidates
     */
    static async findNearestLocation(
        targetLocation: Location,
        candidateLocations: (Location & { id: string })[]
    ): Promise<{ location: Location & { id: string }; distance: number } | null> {
        if (candidateLocations.length === 0) {
            return null;
        }

        const distances = await Promise.all(
            candidateLocations.map(async candidate => {
                const result = await this.calculateDistance(targetLocation, candidate);
                return {
                    location: candidate,
                    distance: result.distance
                };
            })
        );

        // Sort by distance and return the nearest
        distances.sort((a, b) => a.distance - b.distance);
        return distances[0];
    }

    /**
     * Find locations within a specified radius
     */
    static async findLocationsWithinRadius(
        centerLocation: Location,
        candidateLocations: (Location & { id: string })[],
        radiusKm: number
    ): Promise<Array<{ location: Location & { id: string }; distance: number }>> {
        const locationsWithDistance = await Promise.all(
            candidateLocations.map(async candidate => {
                const result = await this.calculateDistance(centerLocation, candidate);
                return {
                    location: candidate,
                    distance: result.distance
                };
            })
        );

        // Filter by radius and sort by distance
        return locationsWithDistance
            .filter(item => item.distance <= radiusKm)
            .sort((a, b) => a.distance - b.distance);
    }
}