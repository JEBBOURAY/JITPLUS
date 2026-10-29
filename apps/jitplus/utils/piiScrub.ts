/**
 * PII scrubbing for crash reports (CNDP Loi 09-08 + App Store 5.1.1). Sentry
 * is declared as anonymous crash diagnostics in the privacy manifest, so any
 * leaked email, phone number or token would invalidate that claim.
 */

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const MA_PHONE_RE = /(\+?212|0)[\s-]?[5-7](?:[\s-]?\d){8}/g;
const JWT_RE = /(?:Bearer\s+)?[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

/** Auth failures already handled by the app (logout / refresh flow). */
export const EXPECTED_AUTH_ERROR_RE = /No refresh token|Session expired/i;

export function scrubPii(value: string): string {
  return value
    .replace(EMAIL_RE, '[email]')
    .replace(MA_PHONE_RE, '[phone]')
    .replace(JWT_RE, '[token]');
}

export interface ScrubbableEvent {
  message?: string;
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: { message?: string; data?: Record<string, unknown> }[];
  user?: { email?: string; username?: string; ip_address?: string | null };
}

/** Sentry `beforeSend`: drops expected auth errors and strips PII in place. */
export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T | null {
  const msg = event.exception?.values?.[0]?.value ?? '';
  if (EXPECTED_AUTH_ERROR_RE.test(msg)) return null;

  for (const v of event.exception?.values ?? []) {
    if (v.value) v.value = scrubPii(v.value);
  }
  if (event.message) event.message = scrubPii(event.message);
  for (const b of event.breadcrumbs ?? []) {
    if (typeof b.message === 'string') b.message = scrubPii(b.message);
    if (b.data) {
      for (const k of Object.keys(b.data)) {
        const val = b.data[k];
        if (typeof val === 'string') b.data[k] = scrubPii(val);
      }
    }
  }
  if (event.user) {
    delete event.user.email;
    delete event.user.username;
    delete event.user.ip_address;
  }
  return event;
}
