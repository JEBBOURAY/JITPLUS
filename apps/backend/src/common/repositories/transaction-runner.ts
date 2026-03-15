// ── Transaction runner abstraction ───────────────────────────────────────────
// Wraps Prisma's $transaction so services don't depend on PrismaService.

import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Prisma transaction client type — available inside interactive callbacks. */
export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export interface ITransactionRunner {
  /** Interactive transaction with a callback that receives a transaction client. */
  run<T>(
    fn: (tx: TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T>;

  /** Batched transaction — pass an array of PrismaPromises. */
  batch<T extends Prisma.PrismaPromise<unknown>[]>(operations: [...T]): Promise<{ [K in keyof T]: Awaited<T[K]> }>;
}

@Injectable()
export class PrismaTransactionRunner implements ITransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(
    fn: (tx: TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T> {
    // Cast required: Prisma's interactive $transaction callback type is narrower than our TransactionClient
    return this.prisma.$transaction(fn as any, options) as Promise<T>;
  }

  batch<T extends Prisma.PrismaPromise<unknown>[]>(operations: [...T]) {
    return this.prisma.$transaction(operations) as Promise<{ [K in keyof T]: Awaited<T[K]> }>;
  }
}
