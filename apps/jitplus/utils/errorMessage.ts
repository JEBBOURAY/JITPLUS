import { AxiosError } from 'axios';
import { getErrorStatus, isInternalErrorMessage } from '@jitplus/shared';
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

/** Internal server details (stack, SQL, paths) are never shown to users. */
function sanitizeInternalError(msg: string): string {
  return isInternalErrorMessage(msg) ? i18n.t('errors.generic') : msg;
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

/** Stable key sent by the server next to the translated message (e.g. error.auth.otpWait). */
export function extractErrorCode(error: unknown): string | undefined {
  if (!(error instanceof AxiosError)) return undefined;
  const code = (error.response?.data as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}

/** The server answered 404: the item does not exist (or no longer does). */
export function isNotFoundError(error: unknown): boolean {
  return getErrorStatus(error) === 404;
}

/** No answer from the server (offline, timeout, DNS…): the shared check. */
export { isNetworkError } from '@jitplus/shared';

