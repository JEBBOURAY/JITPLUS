// ── Raw query runner abstraction ─────────────────────────────────────────────
// Wraps Prisma's $queryRaw and $executeRaw behind an injectable interface.

import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Runtime check — Prisma.Sql is only a TS type, not a class at runtime. */
function isSqlObject(query: unknown): query is Prisma.Sql {
  return (
    typeof query === 'object' &&
    query !== null &&
    'sql' in query &&
    'values' in query
  );
}

export interface IRawQueryRunner {
  queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<T[]>;
  executeRaw(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<number>;
}

@Injectable()
export class PrismaRawQueryRunner implements IRawQueryRunner {
  constructor(private readonly prisma: PrismaService) {}

  queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<T[]> {
    if (isSqlObject(query)) {
      return this.prisma.$queryRaw<T[]>(query);
    }
    return this.prisma.$queryRaw<T[]>(query, ...values);
  }

  executeRaw(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]): Promise<number> {
    if (isSqlObject(query)) {
      return this.prisma.$executeRaw(query);
    }
    return this.prisma.$executeRaw(query, ...values);
  }
}
