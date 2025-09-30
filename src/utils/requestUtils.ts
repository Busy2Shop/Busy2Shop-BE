import { Request } from 'express';

/**
 * Get the client's IP address from the request
 * Handles various proxy scenarios and header configurations
 */
export const getClientIp = (req: Request): string => {
    // Check for IP in various headers (from most trusted to least trusted)
    const possibleHeaders = [
        'x-forwarded-for',
        'x-real-ip',
        'x-client-ip',
        'x-forwarded',
        'x-cluster-client-ip',
        'forwarded-for',
        'forwarded',
        'cf-connecting-ip', // Cloudflare
        'true-client-ip',   // Cloudflare Enterprise
    ];

    for (const header of possibleHeaders) {
        const value = req.get(header);
        if (value) {
            // x-forwarded-for can contain multiple IPs, take the first one
            const ip = value.split(',')[0].trim();
            if (ip && isValidIp(ip)) {
                return ip;
            }
        }
    }

    // Fallback to connection remote address
    const connectionIp = req.connection?.remoteAddress ||
                        req.socket?.remoteAddress ||
                        req.ip;

    return connectionIp || 'unknown';
};

/**
 * Basic IP address validation
 */
const isValidIp = (ip: string): boolean => {
    // IPv4 regex
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

    // IPv6 regex (simplified)
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;

    // IPv6 compressed format regex
    const ipv6CompressedRegex = /^(([0-9a-fA-F]{1,4}:)*)?::((:[0-9a-fA-F]{1,4})*)?$/;

    return ipv4Regex.test(ip) || ipv6Regex.test(ip) || ipv6CompressedRegex.test(ip);
};

/**
 * Get user agent from request
 */
export const getUserAgent = (req: Request): string => {
    return req.get('User-Agent') || 'unknown';
};

/**
 * Check if request is from mobile device
 */
export const isMobileRequest = (req: Request): boolean => {
    const userAgent = getUserAgent(req).toLowerCase();
    const mobileKeywords = [
        'mobile', 'android', 'iphone', 'ipad', 'ipod',
        'blackberry', 'windows phone', 'opera mini'
    ];

    return mobileKeywords.some(keyword => userAgent.includes(keyword));
};

/**
 * Get browser info from user agent
 */
export const getBrowserInfo = (req: Request): {
    browser: string;
    version: string;
    os: string;
} => {
    const userAgent = getUserAgent(req);

    // Simple browser detection
    let browser = 'unknown';
    let version = 'unknown';
    let os = 'unknown';

    // Browser detection
    if (userAgent.includes('Chrome')) {
        browser = 'Chrome';
        const match = userAgent.match(/Chrome\/([0-9.]+)/);
        version = match ? match[1] : 'unknown';
    } else if (userAgent.includes('Firefox')) {
        browser = 'Firefox';
        const match = userAgent.match(/Firefox\/([0-9.]+)/);
        version = match ? match[1] : 'unknown';
    } else if (userAgent.includes('Safari')) {
        browser = 'Safari';
        const match = userAgent.match(/Version\/([0-9.]+)/);
        version = match ? match[1] : 'unknown';
    } else if (userAgent.includes('Edge')) {
        browser = 'Edge';
        const match = userAgent.match(/Edge\/([0-9.]+)/);
        version = match ? match[1] : 'unknown';
    }

    // OS detection
    if (userAgent.includes('Windows')) {
        os = 'Windows';
    } else if (userAgent.includes('Mac')) {
        os = 'macOS';
    } else if (userAgent.includes('Linux')) {
        os = 'Linux';
    } else if (userAgent.includes('Android')) {
        os = 'Android';
    } else if (userAgent.includes('iOS')) {
        os = 'iOS';
    }

    return { browser, version, os };
};