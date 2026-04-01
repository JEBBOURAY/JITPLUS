/**
 * Shared auth error detection — used by Google and Apple login hooks.
 */
import { isAxiosError } from 'axios';
import { getErrorStatus } from '@/utils/error';

/** Returns true if the backend returned 401 with "no account" message. */
export function isNoAccountError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status === 401) {
    const msg = isAxiosError(error)
      ? ((error.response?.data as { message?: string })?.message ?? '')
      : '';
    return /aucun compte|no account|compte.*trouvé/i.test(msg);
  }
  return false;
}
