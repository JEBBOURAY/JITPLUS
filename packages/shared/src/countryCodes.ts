// ── Shared country codes & phone utilities ──────────────────────────────────
// Single source of truth for both JitPlus (client) and JitPlus Pro (merchant) apps.

export interface CountryCode {
  code: string;       // ISO 3166-1 alpha-2
  dial: string;       // e.g. "+212"
  flag: string;       // emoji flag
  name: string;       // e.g. "Maroc"
  maxDigits: number;  // maximum local digit count (without dial code)
}

export const COUNTRY_CODES: CountryCode[] = [
  // ── Afrique du Nord & Maghreb ──
  { code: 'MA', dial: '+212', flag: '🇲🇦', name: 'Maroc',               maxDigits: 9  },
  { code: 'DZ', dial: '+213', flag: '🇩🇿', name: 'Algérie',             maxDigits: 9  },
  { code: 'TN', dial: '+216', flag: '🇹🇳', name: 'Tunisie',             maxDigits: 8  },
  { code: 'LY', dial: '+218', flag: '🇱🇾', name: 'Libye',               maxDigits: 9  },
  { code: 'EG', dial: '+20',  flag: '🇪🇬', name: 'Égypte',              maxDigits: 10 },
  { code: 'MR', dial: '+222', flag: '🇲🇷', name: 'Mauritanie',          maxDigits: 8  },

  // ── Afrique de l'Ouest ──
  { code: 'SN', dial: '+221', flag: '🇸🇳', name: 'Sénégal',             maxDigits: 9  },
  { code: 'CI', dial: '+225', flag: '🇨🇮', name: "Côte d'Ivoire",       maxDigits: 10 },
  { code: 'ML', dial: '+223', flag: '🇲🇱', name: 'Mali',                maxDigits: 8  },
  { code: 'BF', dial: '+226', flag: '🇧🇫', name: 'Burkina Faso',        maxDigits: 8  },
  { code: 'GN', dial: '+224', flag: '🇬🇳', name: 'Guinée',              maxDigits: 9  },
  { code: 'NE', dial: '+227', flag: '🇳🇪', name: 'Niger',               maxDigits: 8  },
  { code: 'TG', dial: '+228', flag: '🇹🇬', name: 'Togo',                maxDigits: 8  },
  { code: 'BJ', dial: '+229', flag: '🇧🇯', name: 'Bénin',               maxDigits: 8  },
  { code: 'GH', dial: '+233', flag: '🇬🇭', name: 'Ghana',               maxDigits: 9  },
  { code: 'NG', dial: '+234', flag: '🇳🇬', name: 'Nigeria',             maxDigits: 10 },
  { code: 'CM', dial: '+237', flag: '🇨🇲', name: 'Cameroun',            maxDigits: 9  },

  // ── Afrique centrale & australe ──
  { code: 'CD', dial: '+243', flag: '🇨🇩', name: 'RD Congo',            maxDigits: 9  },
  { code: 'CG', dial: '+242', flag: '🇨🇬', name: 'Congo',               maxDigits: 9  },
  { code: 'GA', dial: '+241', flag: '🇬🇦', name: 'Gabon',               maxDigits: 7  },
  { code: 'ZA', dial: '+27',  flag: '🇿🇦', name: 'Afrique du Sud',      maxDigits: 9  },
  { code: 'MG', dial: '+261', flag: '🇲🇬', name: 'Madagascar',          maxDigits: 9  },

  // ── Europe de l'Ouest ──
  { code: 'FR', dial: '+33',  flag: '🇫🇷', name: 'France',              maxDigits: 9  },
  { code: 'BE', dial: '+32',  flag: '🇧🇪', name: 'Belgique',            maxDigits: 9  },
  { code: 'CH', dial: '+41',  flag: '🇨🇭', name: 'Suisse',              maxDigits: 9  },
  { code: 'LU', dial: '+352', flag: '🇱🇺', name: 'Luxembourg',          maxDigits: 9  },
  { code: 'DE', dial: '+49',  flag: '🇩🇪', name: 'Allemagne',           maxDigits: 11 },
  { code: 'NL', dial: '+31',  flag: '🇳🇱', name: 'Pays-Bas',            maxDigits: 9  },
  { code: 'AT', dial: '+43',  flag: '🇦🇹', name: 'Autriche',            maxDigits: 10 },
  { code: 'GB', dial: '+44',  flag: '🇬🇧', name: 'Royaume-Uni',         maxDigits: 10 },
  { code: 'IE', dial: '+353', flag: '🇮🇪', name: 'Irlande',             maxDigits: 9  },

  // ── Europe du Sud ──
  { code: 'ES', dial: '+34',  flag: '🇪🇸', name: 'Espagne',             maxDigits: 9  },
  { code: 'PT', dial: '+351', flag: '🇵🇹', name: 'Portugal',            maxDigits: 9  },
  { code: 'IT', dial: '+39',  flag: '🇮🇹', name: 'Italie',              maxDigits: 10 },
  { code: 'GR', dial: '+30',  flag: '🇬🇷', name: 'Grèce',               maxDigits: 10 },

  // ── Europe du Nord ──
  { code: 'SE', dial: '+46',  flag: '🇸🇪', name: 'Suède',               maxDigits: 9  },
  { code: 'NO', dial: '+47',  flag: '🇳🇴', name: 'Norvège',             maxDigits: 8  },
  { code: 'DK', dial: '+45',  flag: '🇩🇰', name: 'Danemark',            maxDigits: 8  },
  { code: 'FI', dial: '+358', flag: '🇫🇮', name: 'Finlande',            maxDigits: 10 },

  // ── Europe de l'Est ──
  { code: 'PL', dial: '+48',  flag: '🇵🇱', name: 'Pologne',             maxDigits: 9  },
  { code: 'RO', dial: '+40',  flag: '🇷🇴', name: 'Roumanie',            maxDigits: 9  },
  { code: 'CZ', dial: '+420', flag: '🇨🇿', name: 'Tchéquie',            maxDigits: 9  },
  { code: 'RU', dial: '+7',   flag: '🇷🇺', name: 'Russie',              maxDigits: 10 },
  { code: 'UA', dial: '+380', flag: '🇺🇦', name: 'Ukraine',             maxDigits: 9  },

  // ── Moyen-Orient ──
  { code: 'TR', dial: '+90',  flag: '🇹🇷', name: 'Turquie',             maxDigits: 10 },
  { code: 'SA', dial: '+966', flag: '🇸🇦', name: 'Arabie Saoudite',     maxDigits: 9  },
  { code: 'AE', dial: '+971', flag: '🇦🇪', name: 'Émirats Arabes Unis', maxDigits: 9  },
  { code: 'QA', dial: '+974', flag: '🇶🇦', name: 'Qatar',               maxDigits: 8  },
  { code: 'KW', dial: '+965', flag: '🇰🇼', name: 'Koweït',              maxDigits: 8  },
  { code: 'BH', dial: '+973', flag: '🇧🇭', name: 'Bahreïn',             maxDigits: 8  },
  { code: 'OM', dial: '+968', flag: '🇴🇲', name: 'Oman',                maxDigits: 8  },
  { code: 'JO', dial: '+962', flag: '🇯🇴', name: 'Jordanie',            maxDigits: 9  },
  { code: 'LB', dial: '+961', flag: '🇱🇧', name: 'Liban',               maxDigits: 8  },
  { code: 'IQ', dial: '+964', flag: '🇮🇶', name: 'Irak',                maxDigits: 10 },
  { code: 'IL', dial: '+972', flag: '🇮🇱', name: 'Israël',              maxDigits: 9  },

  // ── Asie ──
  { code: 'CN', dial: '+86',  flag: '🇨🇳', name: 'Chine',               maxDigits: 11 },
  { code: 'JP', dial: '+81',  flag: '🇯🇵', name: 'Japon',               maxDigits: 10 },
  { code: 'KR', dial: '+82',  flag: '🇰🇷', name: 'Corée du Sud',        maxDigits: 10 },
  { code: 'IN', dial: '+91',  flag: '🇮🇳', name: 'Inde',                maxDigits: 10 },
  { code: 'PK', dial: '+92',  flag: '🇵🇰', name: 'Pakistan',            maxDigits: 10 },
  { code: 'BD', dial: '+880', flag: '🇧🇩', name: 'Bangladesh',          maxDigits: 10 },
  { code: 'ID', dial: '+62',  flag: '🇮🇩', name: 'Indonésie',           maxDigits: 11 },
  { code: 'MY', dial: '+60',  flag: '🇲🇾', name: 'Malaisie',            maxDigits: 10 },
  { code: 'TH', dial: '+66',  flag: '🇹🇭', name: 'Thaïlande',           maxDigits: 9  },
  { code: 'VN', dial: '+84',  flag: '🇻🇳', name: 'Vietnam',             maxDigits: 10 },
  { code: 'PH', dial: '+63',  flag: '🇵🇭', name: 'Philippines',         maxDigits: 10 },
  { code: 'SG', dial: '+65',  flag: '🇸🇬', name: 'Singapour',           maxDigits: 8  },

  // ── Amérique du Nord ──
  { code: 'US', dial: '+1',   flag: '🇺🇸', name: 'États-Unis',          maxDigits: 10 },
  { code: 'CA', dial: '+1',   flag: '🇨🇦', name: 'Canada',              maxDigits: 10 },
  { code: 'MX', dial: '+52',  flag: '🇲🇽', name: 'Mexique',             maxDigits: 10 },

  // ── Amérique du Sud ──
  { code: 'BR', dial: '+55',  flag: '🇧🇷', name: 'Brésil',              maxDigits: 11 },
  { code: 'AR', dial: '+54',  flag: '🇦🇷', name: 'Argentine',           maxDigits: 10 },
  { code: 'CO', dial: '+57',  flag: '🇨🇴', name: 'Colombie',            maxDigits: 10 },
  { code: 'CL', dial: '+56',  flag: '🇨🇱', name: 'Chili',               maxDigits: 9  },
  { code: 'PE', dial: '+51',  flag: '🇵🇪', name: 'Pérou',               maxDigits: 9  },

  // ── Océanie ──
  { code: 'AU', dial: '+61',  flag: '🇦🇺', name: 'Australie',           maxDigits: 9  },
  { code: 'NZ', dial: '+64',  flag: '🇳🇿', name: 'Nouvelle-Zélande',    maxDigits: 9  },
];

/** Default country: Morocco */
export const DEFAULT_COUNTRY = COUNTRY_CODES[0];

// ── Morocco-specific phone validation ──────────────────────────────────────
// Moroccan phone numbers (local part, without +212 or leading 0) are 9 digits.
// Operators (ANRT-regulated):
//   • Maroc Telecom (IAM) mobile : 6[0-4]x, 6[6-8]x
//   • Orange Maroc mobile        : 6[0-4]x, 69x
//   • Inwi mobile                : 65x, 66x, 7[0-2]x, 7[7-9]x
//   • Fixed lines                : 5xx (Maroc Telecom, Méditel)
// Rule: exactly 9 digits starting with 5, 6, or 7.
const MA_MOBILE_RE = /^[5-7]\d{8}$/;

/**
 * Validate a phone number based on the selected country's max digits.
 * Morocco gets stricter ANRT-compliant validation (9 digits, prefix 5/6/7).
 * Other countries accept 7–maxDigits digits.
 */
export function isValidPhoneForCountry(digits: string, country: CountryCode): boolean {
  const cleaned = digits.replace(/\D/g, '');

  if (country.code === 'MA') {
    let local = cleaned;
    // Handle full international format: 212XXXXXXXXX
    if (local.startsWith('212') && local.length === 12) {
      local = local.slice(3);
    }
    // Handle local format with leading 0: 0XXXXXXXXX
    if (local.startsWith('0') && local.length === 10) {
      local = local.slice(1);
    }
    return MA_MOBILE_RE.test(local);
  }

  return cleaned.length >= 7 && cleaned.length <= country.maxDigits;
}

/**
 * Normalize a phone number: strip non-digit chars, remove leading '0',
 * and prepend the given dial code.
 * If the number already starts with '+', it's returned as-is.
 * Handles Moroccan format:
 *   0XXXXXXXXX       → +212XXXXXXXXX
 *   212XXXXXXXXX     → +212XXXXXXXXX
 *   +212XXXXXXXXX    → +212XXXXXXXXX (unchanged)
 *   XXXXXXXXX        → +212XXXXXXXXX
 */
export function normalizePhone(input: string, dialCode: string = '+212'): string {
  let cleaned = input.replace(/[^0-9+]/g, '');

  // Already in international format
  if (cleaned.startsWith('+')) return cleaned;

  // Morocco: strip redundant country code if entered without +
  if (dialCode === '+212' && cleaned.startsWith('212') && cleaned.length === 12) {
    cleaned = cleaned.slice(3);
  }

  // Strip leading 0 (local format)
  if (cleaned.startsWith('0') && cleaned.length > 1) {
    cleaned = cleaned.substring(1);
  }

  return `${dialCode}${cleaned}`;
}
