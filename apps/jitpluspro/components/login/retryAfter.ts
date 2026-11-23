/** First field among `keys` holding a positive number (or numeric string). */
function readPositiveField(data: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const raw = data[key];
    if (typeof raw === 'number' && raw > 0) return raw;
    if (typeof raw === 'string') {
      const val = Number(raw);
      if (Number.isFinite(val) && val > 0) return val;
    }
  }
  return null;
}

/**
 * How long a 429 asks the client to wait, in ms: the Retry-After header
 * (seconds or HTTP date), then the common body fields, then "N min / N s" in
 * the message. Null when the response gives no usable hint.
 */
export function parseRetryAfterMs(error: unknown): number | null {
  const err = error as {
    response?: {
      headers?: Record<string, unknown>;
      data?: Record<string, unknown>;
      status?: number;
    };
  };

  const headers = err?.response?.headers ?? {};
  const retryAfterRaw = headers['retry-after'] ?? headers['Retry-After'];

  if (typeof retryAfterRaw === 'string') {
    const seconds = Number(retryAfterRaw);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;

    const retryDate = Date.parse(retryAfterRaw);
    if (!Number.isNaN(retryDate)) {
      const ms = retryDate - Date.now();
      return ms > 0 ? ms : null;
    }
  }

  if (typeof retryAfterRaw === 'number' && retryAfterRaw > 0) {
    return retryAfterRaw * 1000;
  }

  const data = err?.response?.data ?? {};

  const retryMs = readPositiveField(data, ['retryAfterMs', 'retry_after_ms']);
  if (retryMs !== null) return retryMs;

  const retrySec = readPositiveField(data, ['retryAfter', 'retry_after', 'retryAfterSeconds', 'retry_after_seconds', 'waitSeconds']);
  if (retrySec !== null) return retrySec * 1000;

  const retryMin = readPositiveField(data, ['waitMinutes', 'wait_minutes']);
  if (retryMin !== null) return retryMin * 60 * 1000;

  const message = typeof data.message === 'string' ? data.message : '';
  const minMatch = message.match(/(\d+)\s*(min|minute|minutes)/i);
  if (minMatch) return Number(minMatch[1]) * 60 * 1000;
  const secMatch = message.match(/(\d+)\s*(s|sec|second|seconds)/i);
  if (secMatch) return Number(secMatch[1]) * 1000;

  return null;
}
