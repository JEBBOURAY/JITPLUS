import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

/** Public auth controllers whose routes take the account identifier in the body. */
const IDENTIFIER_THROTTLED_CONTROLLERS = new Set(['AuthController', 'ClientAuthController']);
const IDENTIFIER_FIELDS = ['email', 'telephone', 'phoneNumber'] as const;
const MAX_IDENTIFIER_LENGTH = 255;

/**
 * Rate limiting keyed by client IP (req.ip, see `trust proxy` in main.ts).
 *
 * This guard is global and runs before JwtAuthGuard, so req.user is never set
 * here: authenticated and anonymous requests are both tracked by IP.
 *
 * On the public auth routes (login, OTP, password reset, uniqueness checks…)
 * the email/phone from the body gets a second counter with the same limit, so
 * rotating IPs does not give an attacker a fresh budget against one account.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    await super.handleRequest(requestProps);

    const identifier = this.getBodyIdentifier(requestProps);
    if (identifier) {
      await super.handleRequest({ ...requestProps, getTracker: async () => `id:${identifier}` });
    }
    return true;
  }

  private getBodyIdentifier({ context }: ThrottlerRequest): string | null {
    if (!IDENTIFIER_THROTTLED_CONTROLLERS.has(context.getClass().name)) return null;
    const { req } = this.getRequestResponse(context);
    if (req.method !== 'POST' || !req.body || typeof req.body !== 'object') return null;

    for (const field of IDENTIFIER_FIELDS) {
      const value: unknown = req.body[field];
      if (typeof value !== 'string' || !value.trim() || value.length > MAX_IDENTIFIER_LENGTH) continue;
      // Body validation has not run yet (guards run before pipes): normalize loosely
      // so trivial variants share one counter ("A@x.com " / "a@x.com", and
      // "0612345678" / "+212 612 345 678" via their last 9 digits).
      if (field === 'email') return `email:${value.trim().toLowerCase()}`;
      const digits = value.replace(/\D/g, '');
      if (digits) return `phone:${digits.slice(-9)}`;
    }
    return null;
  }
}
