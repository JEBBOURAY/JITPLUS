import { Inject, Injectable, Logger } from '@nestjs/common';
import { RAW_QUERY_RUNNER, type IRawQueryRunner } from '../common/repositories';

/**
 * Steps of the JitPlus sign-up, in order, then the failure signals.
 * `screen_opened`, `code_resent` and `name_done` come from the app
 * (APP_SIGNUP_STEPS); the server records the others where they happen.
 */
export type SignupStep =
  | 'screen_opened' | 'code_requested' | 'account_started' | 'name_done'
  | 'password_set' | 'password_skipped' | 'completed'
  | 'code_resent' | 'code_wrong' | 'code_expired';

export const APP_SIGNUP_STEPS = ['screen_opened', 'code_resent', 'name_done'] as const satisfies readonly SignupStep[];

/** `all`: before a method is chosen. `social`: Google or Apple, when the app cannot tell which. */
export type SignupMethod = 'all' | 'email' | 'google' | 'apple' | 'social';
export const APP_SIGNUP_METHODS = ['all', 'email', 'social'] as const satisfies readonly SignupMethod[];

export type SignupPlatform = 'android' | 'ios' | 'other';

/** The apps send no platform header: React Native calls go out as okhttp (Android) or CFNetwork (iOS). */
export function signupPlatform(userAgent: string | undefined): SignupPlatform {
  if (!userAgent) return 'other';
  if (/okhttp|android/i.test(userAgent)) return 'android';
  if (/cfnetwork|darwin|iphone|ipad/i.test(userAgent)) return 'ios';
  return 'other';
}

/** Failed code check → funnel step, or null for errors that are not about the code. */
export function failedCodeStep(errorKey: string | undefined): SignupStep | null {
  if (errorKey === 'error.auth.otpInvalid' || errorKey === 'error.auth.otpInvalidLastTry' || errorKey === 'error.auth.otpTooManyAttempts') {
    return 'code_wrong';
  }
  return errorKey === 'error.auth.otpExpired' ? 'code_expired' : null;
}

export interface SignupFunnelRow { step: string; method: string; platform: string; count: number }

@Injectable()
export class SignupFunnelService {
  private readonly logger = new Logger(SignupFunnelService.name);

  constructor(@Inject(RAW_QUERY_RUNNER) private readonly rawQuery: IRawQueryRunner) {}

  /**
   * Adds one to today's counter. Never awaited and never throws: a statistic
   * must not slow down or break a sign-up.
   */
  record(step: SignupStep, method: SignupMethod, platform: SignupPlatform): void {
    this.rawQuery.executeRaw`
      INSERT INTO signup_funnel_daily (day, step, method, platform, count)
      VALUES ((now() AT TIME ZONE 'Africa/Casablanca')::date, ${step}, ${method}, ${platform}, 1)
      ON CONFLICT (day, step, method, platform)
      DO UPDATE SET count = signup_funnel_daily.count + 1
    `.catch((error: unknown) => this.logger.warn(`Sign-up funnel counter failed (${step}): ${String(error)}`));
  }

  /** Totals of the last `days` days (Morocco time), today included. */
  async totals(days: number): Promise<SignupFunnelRow[]> {
    return this.rawQuery.queryRaw<SignupFunnelRow>`
      SELECT step, method, platform, SUM(count)::int AS count
      FROM signup_funnel_daily
      WHERE day > (now() AT TIME ZONE 'Africa/Casablanca')::date - ${days}::int
      GROUP BY step, method, platform
    `;
  }
}
