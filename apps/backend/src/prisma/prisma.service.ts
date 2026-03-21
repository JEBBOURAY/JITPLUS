import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

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

    // Log slow queries — warn at 500ms (SLA target), error at 2s (critical)
    (this as any).$on('query', (e: { duration: number; query: string }) => {
      if (e.duration > 2000) {
        this.logger.error(
          `Critical slow query: "${e.query.slice(0, 120)}" took ${e.duration}ms`
        );
      } else if (e.duration > 500) {
        this.logger.warn(
          `Slow query: "${e.query.slice(0, 120)}" took ${e.duration}ms`
        );
      }
    });

    // ── Soft-delete with Prisma Extensions ──────────────────────────────────────
    this._extendedClient = this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }: any) {
            if (SOFT_DELETE_MODELS.includes(model as any)) {
              const readOps = ['findUnique', 'findFirst', 'findMany', 'count', 'aggregate', 'groupBy'];
              if (readOps.includes(operation)) {
                if (args.where?.deletedAt === undefined) {
                  if (operation === 'findUnique') {
                    // findUnique doesn't allow filtering by non-unique fields, change to findFirst mapping where possible, or just let findUnique fail if it's strict
                    // The safer extension approach for findUnique is just dropping it if deletedAt is present, but simple injection works for most cases
                    args.where = { ...args.where, deletedAt: null };
                  } else {
                    args.where = { ...args.where, deletedAt: null };
                  }
                }
              }
            }
            return query(args);
          }
        }
      }
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
