import { isValidEmail, isValidUUID } from '@/utils/validation';
import { normalizePhone } from '@/utils/normalizePhone';

describe('validation utils', () => {
  describe('isValidEmail', () => {
    it('accepts a standard email', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
    });

    it('accepts email with subdomain', () => {
      expect(isValidEmail('user@sub.domain.co')).toBe(true);
    });

    it('rejects missing @', () => {
      expect(isValidEmail('userexample.com')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidEmail('')).toBe(false);
    });

    it('rejects whitespace only', () => {
      expect(isValidEmail('   ')).toBe(false);
    });
  });

  describe('isValidUUID', () => {
    it('accepts valid UUID v4', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('accepts uppercase UUID', () => {
      expect(isValidUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
    });

    it('rejects invalid UUID format', () => {
      expect(isValidUUID('not-a-uuid')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(isValidUUID('')).toBe(false);
    });
  });
});

describe('normalizePhone', () => {
  it('prepends +212 by default', () => {
    expect(normalizePhone('612345678')).toBe('+212612345678');
  });

  it('removes leading 0', () => {
    expect(normalizePhone('0612345678')).toBe('+212612345678');
  });

  it('uses custom dial code', () => {
    expect(normalizePhone('612345678', '+33')).toBe('+33612345678');
  });

  it('returns as-is if already has +', () => {
    expect(normalizePhone('+212612345678')).toBe('+212612345678');
  });

  it('strips non-digit characters', () => {
    expect(normalizePhone('06 12 34 56 78')).toBe('+212612345678');
  });
});
