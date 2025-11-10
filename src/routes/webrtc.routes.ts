import { Router, Request, Response } from 'express';
import axios from 'axios';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Get TURN server credentials from Cloudflare
 * GET /api/v0/webrtc/turn-credentials
 *
 * Returns ICE server configuration for WebRTC audio calling
 * Uses Cloudflare's free TURN service (1,000 GB/month)
 * No authentication required - public endpoint
 */
router.get('/turn-credentials', async (req: Request, res: Response) => {
    try {
        logger.info('📞 [TURN] Fetching Cloudflare TURN credentials');

        // Fetch ephemeral credentials from Cloudflare
        const response = await axios.post('https://speed.cloudflare.com/turn-creds', {
            timeout: 5000, // 5 second timeout
        });

        if (!response.data || !response.data.username || !response.data.credential) {
            throw new Error('Invalid response from Cloudflare TURN service');
        }

        const { username, credential } = response.data;

        logger.info('📞 [TURN] Successfully fetched credentials', {
            username: username.substring(0, 10) + '...',
            expiresIn: '24 hours (estimated)',
        });

        // Return ICE servers configuration
        const iceServers = [
            // STUN servers (free, for NAT discovery)
            {
                urls: 'stun:stun.cloudflare.com:3478',
            },
            {
                urls: 'stun:stun.l.google.com:19302',
            },

            // TURN servers (Cloudflare relay servers)
            {
                urls: [
                    'turn:turn.cloudflare.com:3478?transport=udp',
                    'turn:turn.cloudflare.com:3478?transport=tcp',
                    'turns:turn.cloudflare.com:5349?transport=tcp',
                ],
                username: username,
                credential: credential,
            },
        ];

        res.json({
            status: 'success',
            message: 'TURN credentials fetched successfully',
            data: {
                iceServers,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h from now
                provider: 'Cloudflare',
                freeQuota: '1,000 GB/month',
            },
        });
    } catch (error: any) {
        logger.error('📞 [TURN] Error fetching Cloudflare credentials:', {
            message: error.message,
            response: error.response?.data,
        });

        // Return error - let client use STUN-only configuration
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch TURN credentials from Cloudflare',
            error: error.message,
            fallback: 'Client will use STUN-only configuration',
        });
    }
});

/**
 * Health check for WebRTC service (Cloudflare TURN)
 * GET /api/v0/webrtc/health
 */
router.get('/health', async (req: Request, res: Response) => {
    try {
        // Test Cloudflare TURN endpoint
        const response = await axios.post('https://speed.cloudflare.com/turn-creds', {
            timeout: 3000,
        });

        const isCloudflareAvailable = response.data && response.data.username;

        res.json({
            status: 'success',
            message: 'WebRTC Cloudflare TURN service health check',
            data: {
                cloudflare: isCloudflareAvailable ? 'available' : 'unavailable',
                timestamp: new Date().toISOString(),
            },
        });
    } catch (error: any) {
        res.status(503).json({
            status: 'error',
            message: 'Cloudflare TURN service unavailable',
            data: {
                cloudflare: 'unavailable',
                timestamp: new Date().toISOString(),
                error: error.message,
            },
        });
    }
});

export default router;
