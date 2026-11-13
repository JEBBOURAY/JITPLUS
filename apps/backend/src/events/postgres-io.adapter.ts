import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/postgres-adapter';
import { Pool } from 'pg';
import type { Server, ServerOptions } from 'socket.io';

/** Prisma-only query parameters that `pg` must not receive. */
const PRISMA_ONLY_PARAMS = ['connection_limit', 'pool_timeout', 'connect_timeout', 'schema', 'pgbouncer', 'statement_cache_size', 'socket_timeout'];

/** DATABASE_URL (Prisma flavour) → connection string usable by `pg`. */
function toPgConnectionString(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  for (const p of PRISMA_ONLY_PARAMS) url.searchParams.delete(p);
  return url.toString();
}

/**
 * Socket.IO adapter that relays emits between Cloud Run instances through
 * Postgres LISTEN/NOTIFY (@socket.io/postgres-adapter).
 *
 * Without it, an event emitted by instance A (e.g. stamps updated after a
 * REST scan) never reaches a client whose socket lives on instance B.
 * Payloads above 8 kB go through the `socket_io_attachments` table
 * (Prisma model SocketIoAttachment), purged by the adapter itself.
 */
export class PostgresIoAdapter extends IoAdapter {
  private readonly relayLogger = new Logger(PostgresIoAdapter.name);
  private pool: Pool | null = null;
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  /**
   * Connects the relay. On failure the app keeps the default in-memory
   * adapter (single-instance behaviour) instead of refusing to boot.
   */
  async connect(databaseUrl: string): Promise<void> {
    const pool = new Pool({
      connectionString: toPgConnectionString(databaseUrl),
      // One LISTEN client + occasional NOTIFY / attachment queries.
      max: 2,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err) => this.relayLogger.warn(`Socket.IO relay pool error: ${err.message}`));
    try {
      await pool.query('SELECT 1');
      this.pool = pool;
      this.adapterConstructor = createAdapter(pool);
      this.relayLogger.log('Socket.IO cross-instance relay enabled (Postgres LISTEN/NOTIFY)');
    } catch (err) {
      await pool.end().catch(() => undefined);
      this.relayLogger.error(
        `Socket.IO relay disabled — events will only reach sockets on this instance: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  override async close(server: Server): Promise<void> {
    await super.close(server);
    await this.pool?.end().catch(() => undefined);
  }
}
