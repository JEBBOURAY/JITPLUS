import { CanActivate, ExecutionContext, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { Request } from 'express';
import { cronMode } from './cron-tick.service';

/**
 * Only Cloud Scheduler may call the cron tick. It sends a Google-signed OIDC
 * token for the invoker service account; the service is public
 * (--allow-unauthenticated), so the app checks the token itself: signature,
 * audience (CRON_TICK_AUDIENCE) and the account (CRON_TICK_INVOKER).
 *
 * Outside CRON_MODE=http the route does not exist (404): the timers run the
 * jobs and a tick would only add load.
 */
@Injectable()
export class CronTickAuthGuard implements CanActivate {
  private readonly logger = new Logger(CronTickAuthGuard.name);
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (cronMode() !== 'http') throw new NotFoundException();
    const audience = this.config.get<string>('CRON_TICK_AUDIENCE');
    const invoker = this.config.get<string>('CRON_TICK_INVOKER');
    if (!audience || !invoker) {
      this.logger.error('CRON_MODE=http without CRON_TICK_AUDIENCE / CRON_TICK_INVOKER: tick refused');
      throw new UnauthorizedException();
    }

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization ?? '';
    const idToken = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!idToken) throw new UnauthorizedException();

    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience });
      const payload = ticket.getPayload();
      if (payload?.email === invoker && payload.email_verified === true) return true;
      this.logger.warn('Cron tick refused: token is not from the invoker account');
    } catch (err) {
      this.logger.warn(`Cron tick refused: ${err instanceof Error ? err.message : 'invalid token'}`);
    }
    throw new UnauthorizedException();
  }
}
