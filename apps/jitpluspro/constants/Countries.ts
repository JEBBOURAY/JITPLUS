/**
 * Re-exports from the shared workspace package.
 * The shared package uses CountryCode (with maxDigits) instead of Country.
 * @see packages/shared/src/countryCodes.ts
 */
export type { CountryCode as Country } from '@jitplus/shared';
export { COUNTRY_CODES as COUNTRIES, DEFAULT_COUNTRY, isValidPhoneForCountry, formatPhoneLocal } from '@jitplus/shared';
