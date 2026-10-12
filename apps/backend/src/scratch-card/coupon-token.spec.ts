import {
  COUPON_QR_PREFIX,
  generateCouponCode,
  isCouponToken,
  normalizeCouponCode,
  signCouponToken,
  verifyCouponToken,
} from './coupon-token';

const SECRET = 'x'.repeat(40);
const ID = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';

describe('coupon token', () => {
  it('round-trips, with or without the deep-link prefix', () => {
    const token = signCouponToken(ID, SECRET);
    expect(token.startsWith('c1.')).toBe(true);
    expect(verifyCouponToken(token, SECRET)).toBe(ID);
    expect(verifyCouponToken(`${COUPON_QR_PREFIX}${token}`, SECRET)).toBe(ID);
    expect(verifyCouponToken(`\uFEFF${token}\n`, SECRET)).toBe(ID);
  });

  it('rejects tampered tokens, other secrets and other formats', () => {
    const token = signCouponToken(ID, SECRET);
    expect(verifyCouponToken(token.slice(0, -2) + 'aa', SECRET)).toBeNull();
    expect(verifyCouponToken(token, 'y'.repeat(40))).toBeNull();
    // Same id signed as a client QR (v1) must not be accepted as a coupon
    expect(verifyCouponToken(token.replace(/^c1\./, 'v1.'), SECRET)).toBeNull();
    expect(verifyCouponToken('garbage', SECRET)).toBeNull();
  });

  it('rejects a signature with multi-byte characters instead of throwing', () => {
    const token = signCouponToken(ID, SECRET);
    const forged = token.slice(0, -1) + 'é';
    expect(() => verifyCouponToken(forged, SECRET)).not.toThrow();
    expect(verifyCouponToken(forged, SECRET)).toBeNull();
  });

  it('detects coupon tokens', () => {
    expect(isCouponToken(signCouponToken(ID, SECRET))).toBe(true);
    expect(isCouponToken('v1.abc.def')).toBe(false);
  });
});

describe('coupon code', () => {
  it('is 6 zero-padded digits', () => {
    expect(generateCouponCode(() => 42)).toBe('000042');
    expect(generateCouponCode(() => 999_999)).toBe('999999');
    expect(generateCouponCode()).toMatch(/^\d{6}$/);
  });

  it('normalises cashier input', () => {
    expect(normalizeCouponCode('042 913')).toBe('042913');
    expect(normalizeCouponCode('04291')).toBeNull();
  });
});
