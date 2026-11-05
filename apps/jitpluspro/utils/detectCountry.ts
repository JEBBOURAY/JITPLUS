import { COUNTRIES, DEFAULT_COUNTRY } from '@/constants/Countries';
import type { CountryCode } from '@jitplus/shared';

/**
 * Time zone → country, for the countries the phone picker offers.
 * The phone sets its time zone from the mobile network, so it follows where
 * the merchant actually is (unlike the language region, which is a setting).
 */
const TIMEZONE_COUNTRY: Record<string, string> = {
  'Africa/Casablanca': 'MA', 'Africa/El_Aaiun': 'MA',
  'Africa/Algiers': 'DZ', 'Africa/Tunis': 'TN', 'Africa/Tripoli': 'LY',
  'Africa/Cairo': 'EG', 'Africa/Nouakchott': 'MR', 'Africa/Dakar': 'SN',
  'Africa/Abidjan': 'CI', 'Africa/Bamako': 'ML', 'Africa/Ouagadougou': 'BF',
  'Africa/Conakry': 'GN', 'Africa/Niamey': 'NE', 'Africa/Lome': 'TG',
  'Africa/Porto-Novo': 'BJ', 'Africa/Accra': 'GH', 'Africa/Lagos': 'NG',
  'Africa/Douala': 'CM', 'Africa/Kinshasa': 'CD', 'Africa/Lubumbashi': 'CD',
  'Africa/Brazzaville': 'CG', 'Africa/Libreville': 'GA',
  'Africa/Johannesburg': 'ZA', 'Indian/Antananarivo': 'MG',
  'Europe/Paris': 'FR', 'Europe/Brussels': 'BE', 'Europe/Zurich': 'CH',
  'Europe/Luxembourg': 'LU', 'Europe/Berlin': 'DE', 'Europe/Amsterdam': 'NL',
  'Europe/Vienna': 'AT', 'Europe/London': 'GB', 'Europe/Dublin': 'IE',
  'Europe/Madrid': 'ES', 'Atlantic/Canary': 'ES', 'Africa/Ceuta': 'ES',
  'Europe/Lisbon': 'PT', 'Europe/Rome': 'IT', 'Europe/Athens': 'GR',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI', 'Europe/Warsaw': 'PL', 'Europe/Bucharest': 'RO',
  'Europe/Prague': 'CZ', 'Europe/Moscow': 'RU', 'Europe/Kyiv': 'UA',
  'Europe/Kiev': 'UA', 'Europe/Istanbul': 'TR',
  'Asia/Riyadh': 'SA', 'Asia/Dubai': 'AE', 'Asia/Qatar': 'QA',
  'Asia/Kuwait': 'KW', 'Asia/Bahrain': 'BH', 'Asia/Muscat': 'OM',
  'Asia/Amman': 'JO', 'Asia/Beirut': 'LB', 'Asia/Baghdad': 'IQ',
  'Asia/Jerusalem': 'IL', 'Asia/Shanghai': 'CN', 'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
  'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Jakarta': 'ID',
  'Asia/Kuala_Lumpur': 'MY', 'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN',
  'Asia/Manila': 'PH', 'Asia/Singapore': 'SG',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Phoenix': 'US',
  'America/Toronto': 'CA', 'America/Montreal': 'CA', 'America/Vancouver': 'CA',
  'America/Mexico_City': 'MX', 'America/Sao_Paulo': 'BR',
  'America/Argentina/Buenos_Aires': 'AR', 'America/Bogota': 'CO',
  'America/Santiago': 'CL', 'America/Lima': 'PE',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Pacific/Auckland': 'NZ',
};

function byCode(code: string | undefined): CountryCode | undefined {
  return code ? COUNTRIES.find((c) => c.code === code) : undefined;
}

/**
 * Best guess of the merchant's country, without any permission or network call:
 * the phone's time zone first, then the region of its language (e.g. "fr-MA"),
 * then Morocco. The merchant can always pick another country.
 */
export function detectCountry(): CountryCode {
  try {
    const { timeZone, locale } = Intl.DateTimeFormat().resolvedOptions();
    const fromZone = byCode(TIMEZONE_COUNTRY[timeZone]);
    if (fromZone) return fromZone;
    const region = /[-_]([A-Z]{2})(?:[-_]|$)/.exec(locale ?? '')?.[1];
    const fromLocale = byCode(region);
    if (fromLocale) return fromLocale;
  } catch {
    // Intl unavailable: fall through to the default.
  }
  return DEFAULT_COUNTRY;
}
