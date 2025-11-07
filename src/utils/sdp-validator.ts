import { logger } from './logger';

/**
 * SDP Validation Error Types
 */
export enum SDPValidationError {
    MISSING = 'SDP_MISSING',
    INVALID_TYPE = 'SDP_INVALID_TYPE',
    MISSING_REQUIRED_FIELDS = 'SDP_MISSING_REQUIRED_FIELDS',
    OVERSIZED = 'SDP_OVERSIZED',
    MALFORMED = 'SDP_MALFORMED',
    INVALID_MEDIA_TYPE = 'SDP_INVALID_MEDIA_TYPE',
}

/**
 * SDP Validation Result
 */
interface SDPValidationResult {
    valid: boolean;
    error?: SDPValidationError;
    message?: string;
}

/**
 * Maximum allowed SDP size (10KB)
 * SDP should typically be 1-3KB. 10KB allows headroom but prevents abuse.
 */
const MAX_SDP_SIZE = 10 * 1024; // 10KB

/**
 * Validate WebRTC Session Description Protocol (SDP) payload
 *
 * @param sdp - The SDP object to validate
 * @returns Validation result with error details if invalid
 */
export function validateSDP(sdp: any): SDPValidationResult {
    // Check if SDP exists
    if (!sdp) {
        logger.warn('📞 [SDP] Validation failed: Missing SDP');
        return {
            valid: false,
            error: SDPValidationError.MISSING,
            message: 'SDP is required',
        };
    }

    // Check if SDP is an object
    if (typeof sdp !== 'object') {
        logger.warn('📞 [SDP] Validation failed: Invalid type', { type: typeof sdp });
        return {
            valid: false,
            error: SDPValidationError.INVALID_TYPE,
            message: 'SDP must be an object',
        };
    }

    // Check for required fields: type and sdp
    if (!sdp.type || !sdp.sdp) {
        logger.warn('📞 [SDP] Validation failed: Missing required fields', {
            hasType: !!sdp.type,
            hasSdp: !!sdp.sdp,
        });
        return {
            valid: false,
            error: SDPValidationError.MISSING_REQUIRED_FIELDS,
            message: 'SDP must contain "type" and "sdp" fields',
        };
    }

    // Validate SDP type (must be 'offer', 'answer', 'pranswer', or 'rollback')
    const validTypes = ['offer', 'answer', 'pranswer', 'rollback'];
    if (!validTypes.includes(sdp.type)) {
        logger.warn('📞 [SDP] Validation failed: Invalid SDP type', { type: sdp.type });
        return {
            valid: false,
            error: SDPValidationError.INVALID_TYPE,
            message: `SDP type must be one of: ${validTypes.join(', ')}`,
        };
    }

    // Check SDP size (prevent oversized payloads)
    const sdpString = sdp.sdp;
    if (typeof sdpString !== 'string') {
        logger.warn('📞 [SDP] Validation failed: SDP content is not a string');
        return {
            valid: false,
            error: SDPValidationError.INVALID_TYPE,
            message: 'SDP content must be a string',
        };
    }

    const sdpSize = Buffer.byteLength(sdpString, 'utf8');
    if (sdpSize > MAX_SDP_SIZE) {
        logger.warn('📞 [SDP] Validation failed: SDP too large', {
            size: sdpSize,
            maxSize: MAX_SDP_SIZE,
        });
        return {
            valid: false,
            error: SDPValidationError.OVERSIZED,
            message: `SDP size (${sdpSize} bytes) exceeds maximum allowed size (${MAX_SDP_SIZE} bytes)`,
        };
    }

    // Validate basic SDP format (must contain v= line and m= line)
    if (!sdpString.includes('v=') || !sdpString.includes('m=')) {
        logger.warn('📞 [SDP] Validation failed: Malformed SDP (missing v= or m= lines)');
        return {
            valid: false,
            error: SDPValidationError.MALFORMED,
            message: 'SDP is malformed (missing required v= or m= lines)',
        };
    }

    // Validate media type (for audio calling, we only allow audio)
    // This prevents video SDP from being sent when we only support audio
    const mediaLines = sdpString.match(/m=(\w+)/g) || [];
    const hasVideo = mediaLines.some((line: string) => line.includes('m=video'));

    if (hasVideo) {
        logger.warn('📞 [SDP] Validation warning: SDP contains video media', {
            mediaLines: mediaLines.map((line: string) => line.replace('m=', '')),
        });
        // Allow it but log warning - some browsers may include video line even if not used
    }

    // Additional validation: Check for audio media
    const hasAudio = mediaLines.some((line: string) => line.includes('m=audio'));
    if (!hasAudio) {
        logger.warn('📞 [SDP] Validation failed: No audio media in SDP');
        return {
            valid: false,
            error: SDPValidationError.INVALID_MEDIA_TYPE,
            message: 'SDP must contain at least one audio media line',
        };
    }

    // Validation passed
    logger.info('📞 [SDP] Validation passed', {
        type: sdp.type,
        size: sdpSize,
        mediaLines: mediaLines.map((line: string) => line.replace('m=', '')),
    });

    return { valid: true };
}

/**
 * Sanitize SDP by removing potentially dangerous content
 * Currently a placeholder - can be extended for additional security
 *
 * @param sdp - The SDP object to sanitize
 * @returns Sanitized SDP object
 */
export function sanitizeSDP(sdp: any): any {
    // Create a shallow copy to avoid modifying original
    const sanitized = { ...sdp };

    // Remove any unexpected fields (only keep type and sdp)
    const allowedFields = ['type', 'sdp'];
    Object.keys(sanitized).forEach((key) => {
        if (!allowedFields.includes(key)) {
            delete sanitized[key];
            logger.info('📞 [SDP] Removed unexpected field from SDP:', key);
        }
    });

    return sanitized;
}
