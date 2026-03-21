import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const logger = new Logger('RetryTransaction');

/**
 * Retry helper for Prisma Serializable transactions.
 *
 * When two concurrent requests modify the same data under
 * `isolationLevel: 'Serializable'`, PostgreSQL raises a
 * serialization failure (Prisma error P2034 or Postgres 40001).
 * This helper automatically retries the transaction up to `maxRetries` times.
 *
 * @param fn       The async function wrapping `prisma.$transaction(...)`
 * @param maxRetries  Maximum number of retry attempts (default: 3)
 * @param delayMs  Base delay between retries in ms (doubles each retry)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 100,
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isSerializationFailure =
        // Prisma wraps serialization errors as P2034
        (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') ||
        // Fallback: raw Postgres serialization failure code
        (error instanceof Error && error.message?.includes('could not serialize access'));

      if (isSerializationFailure && attempt <= maxRetries) {
        const wait = delayMs * Math.pow(2, attempt - 1); // exponential backoff
        logger.warn(
          `Serialization conflict (attempt ${attempt}/${maxRetries}). Retrying in ${wait}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }

      // Not a serialization error or max retries exceeded → re-throw
      throw error;
    }
  }

  // TypeScript safety — should never reach here
  throw new Error('withRetry: unreachable');
}
