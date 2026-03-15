import { useCallback, useRef } from 'react';

/**
 * Wraps an async callback so that overlapping invocations are silently ignored.
 * If the previous call is still in flight, subsequent calls are no-ops.
 *
 * Usage:
 *   const guardedRefresh = useGuardedCallback(async () => { await refetch(); });
 */
export function useGuardedCallback<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _deps: React.DependencyList = [],
): T {
  const runningRef = useRef(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  // Stable callback — never changes identity, always calls latest fn
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(
    (async (...args: unknown[]) => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        return await fnRef.current(...args);
      } finally {
        runningRef.current = false;
      }
    }) as unknown as T,
    [],
  );
}
