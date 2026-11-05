/**
 * Masking helpers for logs: Cloud Logging is not a place for personal data
 * (Loi 09-08). Enough is kept to correlate a support request, not to
 * reconstruct the address or number.
 */

/** `ayoub.je@gmail.com` → `a***@gmail.com` */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '<none>';
  const at = email.indexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

/** `+212612345678` → `+21********78` */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '<none>';
  if (phone.length <= 5) return '***';
  return `${phone.slice(0, 3)}${'*'.repeat(phone.length - 5)}${phone.slice(-2)}`;
}
