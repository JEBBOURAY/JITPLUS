import { getPasswordStrength, isValidPassword, type PasswordStrength } from '@/utils/passwordStrength';

const mockT = (key: string) => key;

describe('isValidPassword', () => {
  it('rejects short password', () => {
    expect(isValidPassword('Aa1!')).toBe(false);
  });

  it('rejects password without uppercase', () => {
    expect(isValidPassword('abcdefg1!')).toBe(false);
  });

  it('rejects password without digit', () => {
    expect(isValidPassword('Abcdefgh!')).toBe(false);
  });

  it('rejects password without special char', () => {
    expect(isValidPassword('Abcdefg1')).toBe(false);
  });

  it('accepts valid password', () => {
    expect(isValidPassword('Abcdefg1!')).toBe(true);
  });

  it('accepts long complex password', () => {
    expect(isValidPassword('MyStr0ng!Pass')).toBe(true);
  });
});

describe('getPasswordStrength', () => {
  it('returns weak with empty label for empty input', () => {
    const result = getPasswordStrength('', mockT);
    expect(result.level).toBe('weak');
    expect(result.label).toBe('');
    expect(result.pct).toBe(0);
  });

  it('returns weak for very short password', () => {
    const result = getPasswordStrength('ab', mockT);
    expect(result.level).toBe('weak');
    expect(result.pct).toBe(0.33);
  });

  it('returns medium for moderate password', () => {
    const result = getPasswordStrength('Abcdef1h', mockT);
    expect(result.level).toBe('medium');
    expect(result.pct).toBe(0.66);
  });

  it('returns strong for complex password', () => {
    const result = getPasswordStrength('MyP@ssw0rd', mockT);
    expect(result.level).toBe('strong');
    expect(result.pct).toBe(1);
  });

  it('returns color codes for each level', () => {
    expect(getPasswordStrength('ab', mockT).color).toBe('#EF4444');
    expect(getPasswordStrength('Abcdef1h', mockT).color).toBe('#F59E0B');
    expect(getPasswordStrength('MyP@ssw0rd', mockT).color).toBe('#10B981');
  });
});
