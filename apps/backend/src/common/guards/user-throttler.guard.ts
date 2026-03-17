import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Custom ThrottlerGuard that combines userId + IP as the tracking key.
 * This prevents:
 *  - Authenticated users bypassing rate limits by rotating IPs (VPN/proxy)
 *  - Legitimate users behind the same NAT/IP blocking each other
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const userId = req.user?.sub || req.user?.userId;

    // Authenticated requests: track by userId+IP; anonymous: track by IP only
    return userId ? `${userId}:${ip}` : ip;
  }
}
