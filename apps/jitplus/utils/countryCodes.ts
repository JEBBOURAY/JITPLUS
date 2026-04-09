/**
 * Re-exports from the shared workspace package.
 * @see packages/shared/src/countryCodes.ts
 */
export type { CountryCode } from '@jitplus/shared';
export {
  COUNTRY_CODES,
  DEFAULT_COUNTRY,
  isValidPhoneForCountry,
  formatPhoneLocal,
} from '@jitplus/shared';
