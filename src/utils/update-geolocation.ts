import { literal } from 'sequelize';
import { Database } from '../models';
import { LOCATIONIQ_API_KEY, LOCATIONIQ_API_BASE_URL } from './constants';
import { UnprocessableEntityError } from './customErrors';
import Market from '../models/market.model';
import User from '../models/user.model';
import axios from 'axios';



const BATCH_SIZE = 10; // Process in smaller batches to avoid rate limits

interface GeocodingResponse {
    lat: string;
    lon: string;
}

async function geocodeAddress(address: string): Promise<[number, number]> {
    try {
        const response = await axios.get<GeocodingResponse>(`${LOCATIONIQ_API_BASE_URL}/search`, {
            params: {
                key: LOCATIONIQ_API_KEY,
                q: address,
                format: 'json',
                limit: 1,
            },
        });

        if (!Array.isArray(response.data) || response.data.length === 0) {
            throw new UnprocessableEntityError(`Unexpected API response format: ${JSON.stringify(response.data)}`);
        }
        const [result] = response.data;
        return [parseFloat(result.lon), parseFloat(result.lat)];
    } catch (error) {
        console.error(`Error geocoding address: ${address}`, error);
        throw error;
    }
}

async function updateMarketLocations(markets: Market[]): Promise<void> {
    for (let i = 0; i < markets.length; i += BATCH_SIZE) {
        const batch = markets.slice(i, i + BATCH_SIZE);
        await Promise.all(
            batch.map(async (market) => {
                if (market.address) {
                    try {
                        const coordinates = await geocodeAddress(market.address);
                        await market.update({
                            geoLocation: {
                                type: 'Point',
                                coordinates,
                            },
                        });
                        console.log(`Updated market ${market.id} location`);
                    } catch (error) {
                        console.error(`Failed to update market ${market.id}:`, error);
                    }
                }
            })
        );
        // Rate limiting delay
        if (i + BATCH_SIZE < markets.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

async function updateAgentLocations(agents: User[]): Promise<void> {
    for (let i = 0; i < agents.length; i += BATCH_SIZE) {
        const batch = agents.slice(i, i + BATCH_SIZE);
        await Promise.all(
            batch.map(async (agent) => {
                if (agent.location?.address) {
                    try {
                        const coordinates = await geocodeAddress(agent.location.address);
                        await agent.update({
                            locationTrackingEnabled: true,
                            currentLocation: {
                                type: 'Point',
                                coordinates,
                            },
                        });
                        console.log(`Updated agent ${agent.id} location`);
                    } catch (error) {
                        console.error(`Failed to update agent ${agent.id}:`, error);
                    }
                }
            })
        );
        // Rate limiting delay
        if (i + BATCH_SIZE < agents.length) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
}

async function updateGeoLocations() {
    try {
        // Find markets that need updating
        const markets = await Market.findAll({
            where: literal('"geoLocation" IS NULL AND "location" IS NOT NULL'),
        });
        console.log(`Found ${markets.length} markets to update`);
        await updateMarketLocations(markets);

        // Find agents that need updating
        const agents = await User.findAll({
            where: literal('"currentLocation" IS NULL AND "location" IS NOT NULL AND "status"->\'userType\' = \'agent\''),
        });
        console.log(`Found ${agents.length} agents to update`);
        await updateAgentLocations(agents);

        console.log('Successfully completed location updates');
    } catch (error) {
        console.error('Error updating geoLocations:', error);
    } finally {
        await Database.close();
    }
}

// Add error handling for the main execution
(async () => {
    try {
        await updateGeoLocations();
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
})();