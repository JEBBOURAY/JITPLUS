import { isValidEmail } from '@/utils/validation';

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
});
