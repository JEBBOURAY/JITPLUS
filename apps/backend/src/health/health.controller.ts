import { Controller, Get, Header, Inject, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { RAW_QUERY_RUNNER } from '../common/repositories';
import type { IRawQueryRunner } from '../common/repositories';
import { Prisma } from '@prisma/client';
import { FirebaseService } from '../firebase/firebase.service';

/** Current API version string */
const API_VERSION = 'v1';

const APP_ENV_SUFFIX: Record<string, string> = {
  jitplus: 'JITPLUS',
  jitpluspro: 'JITPLUSPRO',
};

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    @Inject(RAW_QUERY_RUNNER) private readonly rawQuery: IRawQueryRunner,
    private readonly config: ConfigService,
    private readonly firebase: FirebaseService,
  ) {}

  @Get()
  @SkipThrottle()
  async check() {
    let dbStatus = 'ok';
    let dbLatencyMs: number | null = null;
    try {
      const start = Date.now();
      await this.rawQuery.queryRaw(Prisma.sql`SELECT 1`);
      dbLatencyMs = Date.now() - start;
    } catch {
      dbStatus = 'down';
    }

    const fcm = this.firebase.isInitialized ? 'ok' : 'simulated';

    // Check critical env vars presence (without exposing values)
    const envCheck = {
      smtp: !!this.config.get('SMTP_HOST'),
      storage: !!this.config.get('GCP_STORAGE_BUCKET_NAME'),
    };

    const status = dbStatus === 'ok' && fcm === 'ok' ? 'ok' : 'degraded';
    return {
      status,
      db: dbStatus,
      dbLatencyMs,
      fcm,
      services: envCheck,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Version endpoint — clients call this on startup to detect mandatory updates.
   * Returns the minimum app version required (below which a force-update is triggered)
   * and the current API version.
   *
   * Each app sends `?app=jitplus` or `?app=jitpluspro` so both apps can be gated
   * independently. Builds that predate the parameter (or send an unknown value)
   * read the legacy pair.
   *
   * Env vars (each per-app variable falls back to the legacy one when unset):
   *   MIN_IOS_VERSION_JITPLUS / MIN_ANDROID_VERSION_JITPLUS       — e.g. "1.4.0"
   *   MIN_IOS_VERSION_JITPLUSPRO / MIN_ANDROID_VERSION_JITPLUSPRO — e.g. "1.6.0"
   *   MIN_IOS_VERSION / MIN_ANDROID_VERSION (legacy)              — e.g. "1.2.0"
   */
  @Get('version')
  @SkipThrottle()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiQuery({ name: 'app', required: false, enum: ['jitplus', 'jitpluspro'] })
  version(@Query('app') app?: string) {
    return {
      api_version: API_VERSION,
      min_ios_version: this.minVersion('MIN_IOS_VERSION', app),
      min_android_version: this.minVersion('MIN_ANDROID_VERSION', app),
      maintenance: this.config.get<string>('MAINTENANCE_MODE', 'false') === 'true',
    };
  }

  private minVersion(baseKey: string, app?: string): string {
    // Repeated query params arrive as arrays; treat anything but a string as absent.
    const suffix = typeof app === 'string' ? APP_ENV_SUFFIX[app.toLowerCase()] : undefined;
    const perApp = suffix ? this.config.get<string>(`${baseKey}_${suffix}`) : undefined;
    return perApp || this.config.get<string>(baseKey) || '1.0.0';
  }
}
