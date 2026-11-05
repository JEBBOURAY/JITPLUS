import type { Cache } from 'cache-manager';
import type { Prisma } from '@prisma/client';
import type { IDeviceSessionRepository } from '../repositories';

/** Cache key of a validated merchant/team session (see JwtStrategy.validate). */
export const sessionCacheKey = (tokenId: string): string => `session:${tokenId}`;

/**
 * Forget the cached validation of these sessions so their access tokens are
 * refused on the next request instead of up to SESSION_CACHE_TTL later.
 */
export async function evictSessionCache(cache: Cache, tokenIds: Array<string | null | undefined>): Promise<void> {
  await Promise.all(
    tokenIds
      .filter((t): t is string => !!t)
      .map((t) => cache.del(sessionCacheKey(t)).catch(() => undefined)),
  );
}

/** Delete the device sessions matching `where` and evict their cached validation. */
export async function revokeDeviceSessions(
  repo: Pick<IDeviceSessionRepository, 'findMany' | 'deleteMany'>,
  cache: Cache,
  where: Prisma.DeviceSessionWhereInput,
): Promise<number> {
  const rows = await repo.findMany({ where, select: { tokenId: true } });
  const { count } = await repo.deleteMany({ where });
  await evictSessionCache(cache, rows.map((r) => r.tokenId));
  return count;
}
