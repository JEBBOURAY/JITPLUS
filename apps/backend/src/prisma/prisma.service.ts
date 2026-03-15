import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '../generated/client';

// Cloud Run: each container gets a limited pool.
// Default Prisma uses num_cpus * 2 + 1 connections — on a 1-vCPU Cloud Run
// instance that's only 3 connections. We set 10 to handle concurrent requests
// while staying well under Cloud SQL's max_connections (usually 100-400).
const CONNECTION_LIMIT = parseInt(process.env.DATABASE_POOL_SIZE || '10', 10);
const POOL_TIMEOUT_SECS = 20; // seconds to wait for a free connection

// Models with soft-delete (deletedAt column)
const SOFT_DELETE_MODELS = ['Merchant', 'Client'] as const;

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

    // Log slow queries — warn at 500ms (SLA target), error at 2s (critical)
    this.$on('query' as never, (e: { duration: number; query: string }) => {
      if (e.duration > 2000) {
        this.logger.error(
          `Critical slow query: "${e.query.slice(0, 120)}" took ${e.duration}ms`,
        );
      } else if (e.duration > 500) {
        this.logger.warn(
          `Slow query: "${e.query.slice(0, 120)}" took ${e.duration}ms`,
        );
      }
    });

    // ── Soft-delete middleware ──────────────────────────────────────
    // Automatically injects `deletedAt: null` into read queries for
    // soft-deletable models so deleted records are invisible by default.
    // To query deleted records explicitly, pass `deletedAt: { not: null }`.
    this.$use(async (params: Prisma.MiddlewareParams, next) => {
      if (!params.model || !SOFT_DELETE_MODELS.includes(params.model as any)) {
        return next(params);
      }

      const readActions = [
        'findUnique', 'findFirst', 'findMany', 'count', 'aggregate', 'groupBy',
      ];

      if (readActions.includes(params.action)) {
        // Skip if caller explicitly queried on deletedAt (e.g. admin viewing deleted)
        const where = params.args?.where;
        if (where && 'deletedAt' in where) {
          return next(params);
        }

        // Inject deletedAt: null filter
        if (!params.args) params.args = {};
        if (!params.args.where) params.args.where = {};

        if (params.action === 'findUnique' || params.action === 'findFirst') {
          // findUnique with deletedAt filter needs to become findFirst
          // because findUnique only accepts unique fields in where
          if (params.action === 'findUnique') {
            params.action = 'findFirst';
          }
          params.args.where = { ...params.args.where, deletedAt: null };
        } else {
          params.args.where.deletedAt = null;
        }
      }

      return next(params);
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
