import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

// Cloud Run: each container gets a limited pool.
// Default Prisma uses num_cpus * 2 + 1 connections — on a 1-vCPU Cloud Run
// instance that's only 3 connections. We set 10 to handle concurrent requests
// while staying well under Cloud SQL's max_connections (usually 100-400).
const CONNECTION_LIMIT = parseInt(process.env.DATABASE_POOL_SIZE || '10', 10);
const POOL_TIMEOUT_SECS = 5; // fail-fast: avoid queueing on 512Mi Cloud Run

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  private _extendedClient: any;

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

    // ── Soft-delete with Prisma Extensions ──────────────────────────────────────
    // Per-model interceptors — only Merchant and Client get the deletedAt filter,
    // all other models bypass the extension entirely (zero overhead).
    const softDeleteReadOps = ['findUnique', 'findFirst', 'findMany', 'count', 'aggregate', 'groupBy'] as const;

    const injectDeletedAtFilter = async ({ operation, args, query }: any) => {
      if (softDeleteReadOps.includes(operation)) {
        if (args.where?.deletedAt === undefined) {
          args.where = { ...args.where, deletedAt: null };
        }
      }
      return query(args);
    };

    this._extendedClient = this.$extends({
      query: {
        merchant: { $allOperations: injectDeletedAtFilter },
        client: { $allOperations: injectDeletedAtFilter },
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log(`Prisma connected (pool: ${CONNECTION_LIMIT} connections, timeout: ${POOL_TIMEOUT_SECS}s)`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
