/** Prisma ids are `@default(uuid())`; old share links may still carry legacy CUIDs. */
const ENTITY_ID_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|c[a-z0-9]{24})$/i;

/** Quick-Add claim tokens (WhatsApp magic links). */
const CLAIM_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function isEntityId(value: unknown): value is string {
  return typeof value === 'string' && ENTITY_ID_RE.test(value);
}

export function isClaimToken(value: unknown): value is string {
  return typeof value === 'string' && CLAIM_TOKEN_RE.test(value);
}
