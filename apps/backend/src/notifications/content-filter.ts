/**
 * Server-side content filter for merchant marketing messages.
 *
 * Protects clients (and the platform) against:
 *  - Phishing / credential harvesting
 *  - Financial scams (fake lottery, fake bank alerts, money requests)
 *  - Adult / violent content
 *  - Spam patterns (ALL CAPS, excessive URLs)
 *
 * Applied to push, email and WhatsApp broadcasts before recording/sending.
 */

// ── Blocklist of forbidden terms (case-insensitive, accent-insensitive) ──
// Keep this list conservative: merchants use FR/EN/darija + Arabic.
// Focus on patterns that have ZERO legitimate use in loyalty marketing.
const PROHIBITED_PATTERNS: RegExp[] = [
  // Credential / account takeover
  /\b(mot\s*de\s*passe|password|كلمة\s*السر|الباسوورد|code\s*(?:otp|pin|secret)|cvv|cvc)\b/i,
  // Banking / card harvesting
  /\b(numero\s*de\s*carte|card\s*number|iban|swift|bic|rib)\b/i,
  /\b(virement|wire\s*transfer|western\s*union|moneygram|cashplus)\b/i,
  // Fake prize / lottery scams
  /\b(vous\s*avez\s*gagn[eé]|you\s*(?:have\s*)?won|ربحت|فزت)\s*\d+/i,
  /\b(loterie|lottery|tombola\s*officielle|jackpot)\s*\d/i,
  // Phishing call-to-action
  /\b(v[eé]rifier?\s*(?:votre|your)\s*(?:compte|account|identit[eé]|identity))\b/i,
  /\b(cliquer?\s*ici\s*(?:pour|to)\s*(?:d[eé]bloquer|unlock|r[eé]activer|reactivate))\b/i,
  // Adult / explicit
  /\b(porn|porno|sex|xxx|escort|nudes?)\b/i,
  // Violence / hate (narrow list)
  /\b(kill\s*yourself|kys|suicide\s*now)\b/i,
  // Drug sales
  /\b(cocaine|heroin|meth|ecstasy\s*for\s*sale)\b/i,
];

// ── URL detection (max 2 links in marketing content) ──
const URL_REGEX = /(?:https?:\/\/|www\.)\S+/gi;
const MAX_URLS = 2;

// ── Shouting detection ──
// Flag if > 70% of letters are uppercase AND length > 20 chars.
const MIN_SHOUT_LEN = 20;
const SHOUT_RATIO = 0.7;

export interface ContentViolation {
  code: 'PROHIBITED_TERM' | 'TOO_MANY_URLS' | 'ALL_CAPS';
  message: string;
}

/**
 * Normalize a string for matching: lowercase + strip diacritics.
 * Keeps Arabic characters intact.
 */
function normalize(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function detectAllCaps(input: string): boolean {
  const letters = input.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < MIN_SHOUT_LEN) return false;
  const upper = letters.replace(/[^A-ZÀ-Ö]/g, '');
  return upper.length / letters.length >= SHOUT_RATIO;
}

/**
 * Scan one or more text fields for prohibited content.
 * Returns the first violation found (or null if clean).
 */
export function detectProhibitedContent(...fields: string[]): ContentViolation | null {
  for (const field of fields) {
    if (!field) continue;
    const normalized = normalize(field);

    for (const pattern of PROHIBITED_PATTERNS) {
      if (pattern.test(normalized)) {
        return {
          code: 'PROHIBITED_TERM',
          message:
            'Le contenu contient des termes interdits (phishing, arnaque, contenu adulte ou violent). Veuillez modifier votre message.',
        };
      }
    }

    const urlMatches = field.match(URL_REGEX);
    if (urlMatches && urlMatches.length > MAX_URLS) {
      return {
        code: 'TOO_MANY_URLS',
        message: `Maximum ${MAX_URLS} liens par message. Veuillez en retirer.`,
      };
    }

    if (detectAllCaps(field)) {
      return {
        code: 'ALL_CAPS',
        message:
          'Évitez le texte tout en majuscules (perçu comme du spam). Utilisez une casse normale.',
      };
    }
  }

  return null;
}
