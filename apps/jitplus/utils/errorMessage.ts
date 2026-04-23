import { AxiosError } from 'axios';
import i18n from '@/i18n';

/* ── Fallback patterns for any English strings that slip through ── */
const EN_TO_I18N: [RegExp, string][] = [
  [/network\s*error/i, 'errors.networkError'],
  [/timeout/i, 'errors.timeout'],
  [/unauthorized/i, 'errors.unauthorized'],
  [/forbidden/i, 'errors.forbidden'],
  [/not found/i, 'errors.notFound'],
  [/internal server error/i, 'errors.serverError'],
  [/too many requests/i, 'errors.tooManyRequests'],
  [/bad request/i, 'errors.badRequest'],
  [/must be a string/i, 'errors.invalidFormat'],
  [/should not be empty/i, 'errors.fieldRequired'],
  [/must be an email/i, 'errors.invalidEmail'],
  [/must be a number/i, 'errors.mustBeNumber'],
  [/should not exist/i, 'errors.fieldNotAllowed'],
];

function translateIfEnglish(msg: string): string {
  // If it looks like a known language (contains accented chars), keep it
  if (/[àâéèêëïîôùûüç]/.test(msg)) return sanitizeInternalError(msg);
  for (const [re, key] of EN_TO_I18N) {
    if (re.test(msg)) return i18n.t(key);
  }
  return sanitizeInternalError(msg);
}

/**
 * Filter out internal server error details that should never be shown to users.
 * Uses an allowlist approach: only messages matching safe patterns are passed through.
 */
function sanitizeInternalError(msg: string): string {
  const internalPatterns = /Error:|Exception|at\s+\w|SELECT|INSERT|UPDATE|DELETE|prisma|TypeError|Cannot read|stack.*trace|ECONNREFUSED|\bport\b.*\d{4}/i;
  if (internalPatterns.test(msg)) return i18n.t('errors.generic');
  // Also block messages that look like file paths or stack traces
  if (/\/[\w-]+\/[\w-]+\.(js|ts)|\\[\w-]+\\[\w-]+\.(js|ts)/i.test(msg)) return i18n.t('errors.generic');
  return msg;
}

/**
 * Extract a user-friendly error message from an Axios error
 * or fall back to a generic French string.
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof AxiosError) {
    const data = error.response?.data as Record<string, unknown> | undefined;
    const serverMsg = data?.message;

    // class-validator returns an array of messages
    if (Array.isArray(serverMsg) && serverMsg.length > 0) {
      return translateIfEnglish(String(serverMsg[0]));
    }
    if (typeof serverMsg === 'string') {
      return translateIfEnglish(serverMsg);
    }

    if (error.message === 'Network Error') {
      return i18n.t('errors.networkError');
    }
    if (error.code === 'ECONNABORTED') {
      return i18n.t('errors.timeout');
    }
  }

  if (error instanceof Error) {
    if (error.message === 'Network Error') {
      return i18n.t('errors.networkError');
    }
    return translateIfEnglish(error.message);
  }

  return i18n.t('errors.generic');
}

/**
 * Check if an error is a network/connectivity error (language-independent).
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    return error.message === 'Network Error' || error.code === 'ECONNABORTED' || !error.response;
  }
  if (error instanceof Error) {
    return error.message === 'Network Error';
  }
  return false;
}

/**
 * Check if the error is a 429 Too Many Requests (Rate Limit).
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    return error.response?.status === 429;
  }
  return false;
}
