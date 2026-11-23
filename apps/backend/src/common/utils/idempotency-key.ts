import { BadRequestException } from '@nestjs/common';

/**
 * Normalises the `Idempotency-Key` header of a till request: trimmed,
 * 1..64 chars of [A-Za-z0-9_-]. Returns undefined when the header is absent.
 */
export function parseIdempotencyKey(header?: string): string | undefined {
  const key = header?.trim();
  if (!key) return undefined;
  if (key.length > 64 || !/^[A-Za-z0-9_-]+$/.test(key)) {
    throw new BadRequestException('Idempotency-Key invalide (max 64 chars, [A-Za-z0-9_-]).');
  }
  return key;
}
