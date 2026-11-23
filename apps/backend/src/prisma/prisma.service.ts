import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Cloud Run: each container gets a limited pool.
// Default Prisma uses num_cpus * 2 + 1 connections — on a 1-vCPU Cloud Run
// instance that's only 3 connections. We set 10 to handle concurrent requests
// while staying well under Cloud SQL's max_connections (usually 100-400).
const CONNECTION_LIMIT = parseInt(process.env.DATABASE_POOL_SIZE || '10', 10);
const POOL_TIMEOUT_SECS = 5; // fail-fast: avoid queueing on 512Mi Cloud Run
const CONNECT_ATTEMPTS = 4; // boot only
const CONNECT_RETRY_DELAY_MS = 2000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Append pool params to DATABASE_URL if not already present
    let dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl.includes('connection_limit=')) {
      const separator = dbUrl.includes('?') ? '&' : '?';
      dbUrl += `${separator}connection_limit=${CONNECTION_LIMIT}&pool_timeout=${POOL_TIMEOUT_SECS}`;
    }

    super({
      datasources: {
        db: { url: dbUrl },
      },
      log:
        process.env.NODE_ENV === 'production'
          ? [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }]
          : [{ emit: 'event', level: 'query' }],
    });

    // Log slow queries in non-production; in production only critical slow queries (>2s)
    // to reduce Cloud Logging ingestion costs.
    const isProd = process.env.NODE_ENV === 'production';
    (this as any).$on('query', (e: { duration: number; query: string }) => {
      if (e.duration > 2000) {
        this.logger.error(
          `Critical slow query: "${e.query.slice(0, 120)}" took ${e.duration}ms`
        );
      } else if (!isProd && e.duration > 500) {
        this.logger.warn(
          `Slow query: "${e.query.slice(0, 120)}" took ${e.duration}ms`
        );
      }
    });

    // Production subscribes to warn/error as events (above): without listeners
    // Prisma drops them, so pool timeouts and engine warnings never reached the logs.
    (this as any).$on('warn', (e: { message: string }) => this.logger.warn(`Prisma: ${e.message}`));
    (this as any).$on('error', (e: { message: string }) => this.logger.error(`Prisma: ${e.message}`));
  }

  async onModuleInit() {
    // The first connection can exceed the 5s pool timeout (cold Cloud SQL, WSL
    // port relay, busy machine right after a build). Retry instead of killing
    // the boot on a single slow attempt.
    for (let attempt = 1; ; attempt++) {
      try {
        await this.$connect();
        break;
      } catch (err) {
        if (attempt >= CONNECT_ATTEMPTS) throw err;
        this.logger.warn(
          `Database connection attempt ${attempt}/${CONNECT_ATTEMPTS} failed (${(err as Error).message.split('\n').pop()}), retrying in ${CONNECT_RETRY_DELAY_MS}ms`
        );
        await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_DELAY_MS));
      }
    }
    this.logger.log(`Prisma connected (pool: ${CONNECTION_LIMIT} connections, timeout: ${POOL_TIMEOUT_SECS}s)`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
