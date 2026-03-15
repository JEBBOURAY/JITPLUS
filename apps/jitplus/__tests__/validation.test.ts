import { isValidEmail, isValidMoroccanPhone } from '@/utils/validation';

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

  describe('isValidMoroccanPhone', () => {
    it('accepts 9-digit number starting with 6', () => {
      expect(isValidMoroccanPhone('612345678')).toBe(true);
    });

    it('accepts 9-digit number starting with 7', () => {
      expect(isValidMoroccanPhone('712345678')).toBe(true);
    });

    it('accepts 9-digit number starting with 5', () => {
      expect(isValidMoroccanPhone('512345678')).toBe(true);
    });

    it('rejects 8-digit number', () => {
      expect(isValidMoroccanPhone('61234567')).toBe(false);
    });

    it('rejects number starting with 0 (raw format)', () => {
      expect(isValidMoroccanPhone('0612345678')).toBe(false);
    });

    it('rejects non-numeric string', () => {
      expect(isValidMoroccanPhone('abc')).toBe(false);
    });
  });
});
