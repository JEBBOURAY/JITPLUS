/**
 * Re-exports from the shared workspace package.
 * @see packages/shared/src/error.ts
 */
export { getErrorMessage } from '@jitplus/shared';

/** `code` and `meta` of a backend error body ({ statusCode, message, code?, meta? }), when present. */
export function getErrorDetails(error: unknown): { code?: string; meta?: Record<string, unknown> } {
  const data = (error as { response?: { data?: unknown } } | null | undefined)?.response?.data;
  if (!data || typeof data !== 'object') return {};
  const { code, meta } = data as { code?: unknown; meta?: unknown };
  return {
    code: typeof code === 'string' ? code : undefined,
    meta: meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : undefined,
  };
}
