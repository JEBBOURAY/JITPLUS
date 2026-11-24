// ── Work that outlives its HTTP request ──────────────────────────────────
// Pushes, e-mails and audit rows are often started without awaiting them so
// the response is not slowed down. With request-based billing on Cloud Run
// (CRON_MODE=http) the CPU is throttled to almost nothing once no request is
// open, so such work stalls until the next request. The cron tick (one
// request per minute) waits for the tracked work, which bounds the delay to
// about a minute instead of "whenever someone next opens the app".
//
// trackBackground never changes the promise: it only remembers it until it
// settles. Callers keep their own .catch.

const pending = new Set<Promise<unknown>>();

export function trackBackground<T>(work: Promise<T>): Promise<T> {
  pending.add(work);
  const forget = () => pending.delete(work);
  work.then(forget, forget);
  return work;
}

export function pendingBackgroundCount(): number {
  return pending.size;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Waits until no tracked work is left, or `maxMs` has passed. Work started by
 * the work being drained (a push sent after a lookup) is picked up too: the
 * set is re-read until it stays empty. Never throws. Returns how many tracked
 * promises were still pending when it gave up (0 = drained).
 */
export async function drainBackground(maxMs: number, pollMs = 100): Promise<number> {
  const deadline = Date.now() + maxMs;
  while (pending.size > 0) {
    const left = deadline - Date.now();
    if (left <= 0) break;
    await Promise.race([Promise.allSettled([...pending]), sleep(Math.min(pollMs, left))]);
  }
  return pending.size;
}
