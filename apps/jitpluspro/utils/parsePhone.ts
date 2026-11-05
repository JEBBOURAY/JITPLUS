import { COUNTRIES, DEFAULT_COUNTRY } from '@/constants/Countries';
import type { CountryCode } from '@jitplus/shared';

interface ParsedPhone {
  dialCode: string;
  localPart: string;
  country: CountryCode;
}

// Longest dial code first (+212 before +2), sorted once rather than on every parse.
const COUNTRIES_BY_DIAL = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

/**
 * Parse stored value "+212612..." or local "0612..." into dialCode + localPart + country.
 * `preferredCode` picks among countries sharing the same dial code (+1 → US or CA).
 */
export function parsePhone(value: string | undefined | null, preferredCode?: string): ParsedPhone {
  const safeVal = value || '';
  if (safeVal.startsWith('+')) {
    const match = COUNTRIES_BY_DIAL.find((c) => safeVal.startsWith(c.dial));
    if (match) {
      const preferred = preferredCode
        ? COUNTRIES_BY_DIAL.find((c) => c.code === preferredCode && c.dial === match.dial)
        : undefined;
      const country = preferred ?? match;
      return { dialCode: country.dial, localPart: safeVal.slice(country.dial.length), country };
    }
  }
  // Default to Morocco, clean leading 0
  const localPart = safeVal.replace(/^0+/, '');
  return { dialCode: DEFAULT_COUNTRY.dial, localPart, country: DEFAULT_COUNTRY };
}

/** The number to send, or '' when only a dial code is there (nothing typed yet). */
export function phoneToSubmit(value: string): string {
  return parsePhone(value).localPart ? value : '';
}
