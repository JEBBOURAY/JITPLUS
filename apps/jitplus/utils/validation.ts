/**
 * Re-exports from the shared workspace package.
 * @see packages/shared/src/validation.ts
 */
export { isValidEmail } from '@jitplus/shared';

/** Moroccan mobile phone regex — must start with 5, 6, or 7 + 8 digits */
const MOROCCAN_PHONE_REGEX = /^[567]\d{8}$/;

/** Strong password validation: 8+ chars, 1 uppercase, 1 lowercase, 1 number, 1 special char */
export function isStrongPassword(password: string): boolean {
  const minLength = 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  return password.length >= minLength && hasUpper && hasLower && hasNumber && hasSpecial;
}

/** Validate a Moroccan phone number (digits only, no prefix) */
export function isValidMoroccanPhone(digits: string): boolean {
  return MOROCCAN_PHONE_REGEX.test(digits);
}
