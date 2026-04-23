export type PasswordStrength = 'weak' | 'medium' | 'strong';

export interface PasswordStrengthResult {
  level: PasswordStrength;
  label: string;
  color: string;
  /** 0 – 1 fill ratio for progress bars */
  pct: number;
}

const RE_UPPER = /[A-Z]/;
const RE_DIGIT = /[0-9]/;
const RE_SPECIAL = /[^A-Za-z0-9\s]/;
const RE_WHITESPACE = /\s/;

/** Maximum password length to prevent ReDoS / excessive hashing cost */
export const MAX_PASSWORD_LENGTH = 128;

/** Check if a password meets the backend requirements (8–128 chars, uppercase, digit, special). */
export function isValidPassword(pw: string): boolean {
  return (
    pw.length >= 8 &&
    pw.length <= MAX_PASSWORD_LENGTH &&
    !RE_WHITESPACE.test(pw) &&
    RE_UPPER.test(pw) &&
    RE_DIGIT.test(pw) &&
    RE_SPECIAL.test(pw)
  );
}

/**
 * Evaluate password strength. Returns a level, localised label, a colour and
 * a 0-1 percentage suitable for progress-bar width.
 *
 * @param weakKey   i18n key for "weak" label
 * @param mediumKey i18n key for "medium" label
 * @param strongKey i18n key for "strong" label
 */
export function getPasswordStrength(
  pw: string,
  t: (key: string) => string,
  weakKey = 'setPassword.strengthWeak',
  mediumKey = 'setPassword.strengthMedium',
  strongKey = 'setPassword.strengthStrong',
): PasswordStrengthResult {
  if (pw.length === 0) return { level: 'weak', label: '', color: '#D1D5DB', pct: 0 };
  if (RE_WHITESPACE.test(pw)) {
    return { level: 'weak', label: t(weakKey), color: '#EF4444', pct: 0.2 };
  }

  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 10) score++;
  if (RE_UPPER.test(pw)) score++;
  if (RE_DIGIT.test(pw)) score++;
  if (RE_SPECIAL.test(pw)) score++;

  if (score <= 2)
    return { level: 'weak', label: t(weakKey), color: '#EF4444', pct: 0.33 };
  if (score <= 3)
    return { level: 'medium', label: t(mediumKey), color: '#F59E0B', pct: 0.66 };
  return { level: 'strong', label: t(strongKey), color: '#10B981', pct: 1 };
}
