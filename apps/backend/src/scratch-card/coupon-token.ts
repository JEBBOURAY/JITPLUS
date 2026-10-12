import { createHmac, randomInt, timingSafeEqual } from 'crypto';

/** Content of the QR shown on a coupon: jitplus://coupon/<token> */
export const COUPON_QR_PREFIX = 'jitplus://coupon/';
export const COUPON_CODE_LENGTH = 6;

/** "c1." + base64url(couponId) + "." + HMAC-SHA256(secret, "c1:" + couponId) */
export function signCouponToken(couponId: string, secret: string): string {
  const idPart = Buffer.from(couponId).toString('base64url');
  const sig = createHmac('sha256', secret).update(`c1:${couponId}`).digest('base64url');
  return `c1.${idPart}.${sig}`;
}

/**
 * Returns the coupon id of a valid token, or null. Accepts the raw token or the
 * full deep link, and strips invisible characters some scanners inject.
 */
export function verifyCouponToken(input: string, secret: string): string | null {
  let token = (input || '').replace(/[\x00-\x1f\x7f-\x9f\uFEFF]/g, '').trim();
  if (token.startsWith(COUPON_QR_PREFIX)) token = token.slice(COUPON_QR_PREFIX.length);
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'c1' || !parts[1] || !parts[2]) return null;

  let couponId: string;
  try {
    couponId = Buffer.from(parts[1], 'base64url').toString();
  } catch {
    return null;
  }
  if (!/^[0-9a-f-]{36}$/i.test(couponId)) return null;

  const expected = createHmac('sha256', secret).update(`c1:${couponId}`).digest('base64url');
  const sig = Buffer.from(parts[2]);
  const want = Buffer.from(expected);
  // Byte lengths, not string lengths: timingSafeEqual throws on multi-byte input of the same char count.
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null;
  return couponId;
}

export function isCouponToken(input: string): boolean {
  const token = (input || '').trim();
  return token.startsWith(COUPON_QR_PREFIX) || token.startsWith('c1.');
}

/** Random 6-digit code, zero-padded. */
export function generateCouponCode(rng: (max: number) => number = (max) => randomInt(0, max)): string {
  return String(rng(10 ** COUPON_CODE_LENGTH)).padStart(COUPON_CODE_LENGTH, '0');
}

export function normalizeCouponCode(input: string): string | null {
  const digits = (input || '').replace(/\D/g, '');
  return digits.length === COUPON_CODE_LENGTH ? digits : null;
}
