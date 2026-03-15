/**
 * Re-exports from the shared workspace package.
 * @see packages/shared/src/validation.ts
 */
export { isValidEmail } from '@jitplus/shared';

/** Moroccan mobile phone regex — must start with 5, 6, or 7 + 8 digits */
const MOROCCAN_PHONE_REGEX = /^[567]\d{8}$/;

/** Validate a Moroccan phone number (digits only, no prefix) */
export function isValidMoroccanPhone(digits: string): boolean {
  return MOROCCAN_PHONE_REGEX.test(digits);
}
