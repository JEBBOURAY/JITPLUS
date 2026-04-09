/**
 * Centralised dev-mode logger for jitplus.
 *
 * Every log is prefixed with a timestamp + coloured tag so errors, warnings
 * and info messages are easy to spot in the Metro console / Flipper / logcat.
 *
 * In production builds (__DEV__ === false) all calls are no-ops.
 */

type LogLevel = 'info' | 'warn' | 'error';

const TAG_STYLES: Record<LogLevel, string> = {
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
};

function timestamp(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`;
}

function formatPrefix(level: LogLevel, tag: string): string {
  return `${TAG_STYLES[level]} [${timestamp()}] [${tag}]`;
}

/**
 * Log an informational message (dev only).
 */
export function logInfo(tag: string, message: string, ...data: unknown[]): void {
  if (!__DEV__) return;
  console.log(formatPrefix('info', tag), message, ...data);
}

/**
 * Log a warning (dev only).
 */
export function logWarn(tag: string, message: string, ...data: unknown[]): void {
  if (!__DEV__) return;
  console.warn(formatPrefix('warn', tag), message, ...data);
}

/**
 * Log an error with optional context payload (dev only).
 */
export function logError(tag: string, message: string, error?: unknown, extra?: Record<string, unknown>): void {
  if (!__DEV__) return;

  const parts: unknown[] = [formatPrefix('error', tag), message];

  if (error instanceof Error) {
    parts.push(`\n  → ${error.name}: ${error.message}`);
    if (error.stack) {
      const frames = error.stack.split('\n').slice(0, 6).join('\n    ');
      parts.push(`\n    ${frames}`);
    }
  } else if (error !== undefined) {
    parts.push('\n  →', error);
  }

  if (extra && Object.keys(extra).length > 0) {
    parts.push('\n  context:', extra);
  }

  console.error(...parts);
}

/**
 * Log an Axios-style API error with request/response details (dev only).
 */
export function logApiError(tag: string, error: unknown): void {
  if (!__DEV__) return;

  const axiosErr = error as {
    config?: { method?: string; url?: string; baseURL?: string };
    response?: { status?: number; data?: unknown };
    message?: string;
  };

  const method = axiosErr?.config?.method?.toUpperCase() ?? '?';
  const url = axiosErr?.config?.url ?? '?';
  const status = axiosErr?.response?.status;
  const data = axiosErr?.response?.data;

  logError(tag, `${method} ${url} → ${status ?? 'NETWORK_ERROR'}`, error, {
    responseData: data,
  });
}
