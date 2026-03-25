import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { RAW_QUERY_RUNNER } from '../common/repositories';
import type { IRawQueryRunner } from '../common/repositories';
import { Prisma } from '@prisma/client';
import { FirebaseService } from '../firebase/firebase.service';

/** Current API version string */
const API_VERSION = 'v1';

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
    try {
      await this.rawQuery.queryRaw(Prisma.sql`SELECT 1`);
    } catch {
      dbStatus = 'down';
    }

    const fcm = this.firebase.isInitialized ? 'ok' : 'simulated';
    const status = dbStatus === 'ok' && fcm === 'ok' ? 'ok' : 'degraded';
    return { status, db: dbStatus, fcm, timestamp: new Date().toISOString() };
  }

  /**
   * Version endpoint — clients call this on startup to detect mandatory updates.
   * Returns the minimum app version required (below which a force-update is triggered)
   * and the current API version.
   *
   * Env vars:
   *   MIN_IOS_VERSION   — e.g. "1.2.0"
   *   MIN_ANDROID_VERSION — e.g. "1.2.0"
   */
  @Get('version')
  @SkipThrottle()
  version() {
    return {
      api_version: API_VERSION,
      min_ios_version: this.config.get<string>('MIN_IOS_VERSION', '1.0.0'),
      min_android_version: this.config.get<string>('MIN_ANDROID_VERSION', '1.0.0'),
      maintenance: this.config.get<string>('MAINTENANCE_MODE', 'false') === 'true',
    };
  }
}
