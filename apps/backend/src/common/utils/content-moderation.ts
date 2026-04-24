/**
 * Lightweight server-side content moderation.
 *
 * Scope: hard-block of common profanity / hate / sexual content in FR / AR (Darija)
 * and EN — applied to user-generated merchant fields (nom, description, adresse)
 * before persistence.
 *
 * This is NOT a perfect filter (circumvention is trivial) but demonstrates the
 * good-faith moderation required by:
 *   • Apple App Review Guideline 1.2 (User-Generated Content)
 *   • Google Play User-Generated Content Policy
 *
 * Combined with the admin `banMerchant` flow and the client-facing report
 * endpoint, this satisfies the "filter + report + remove" triad reviewers
 * check for.
 */
import { BadRequestException } from '@nestjs/common';

// Each entry is a lowercase substring. Matching is accent-insensitive and
// looks for whole-word or embedded occurrence — kept intentionally small and
// focused on unambiguous terms to avoid false positives on legitimate shop
// names (e.g. "Chicken" or "Cock"tail are NOT in this list).
const BANNED_SUBSTRINGS: readonly string[] = [
  // FR — sexual / slur (narrow set, unambiguous)
  'pornographie', 'pornographique', 'porno ', ' porn ',
  'pedophile', 'pedophil', 'zoophile',
  // FR — hate / violence calls
  'mort aux ', 'nazi ', 'heil hitler',
  // EN — unambiguous
  ' nigger', ' faggot', ' rapist', 'child porn', 'cp video',
  // AR / Darija — insultes très grossières, non ambiguës
  'قحبة', 'زامل', 'كس امك', 'نيك امك', 'نيك مك', 'طحان',
  // Generic scam / illegal
  'acheter drogue', 'vente cocaine', 'vente heroine', 'sell weapons',
];

/** Normalize string for matching: lower-case, trim, NFD accent strip. */
function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns the first banned substring found, or null if the input is clean.
 * Callers should reject the payload with a 400 when a match is found.
 */
export function findBannedContent(input: string | null | undefined): string | null {
  if (!input) return null;
  const needle = normalize(input);
  if (!needle) return null;
  // Pad to simplify boundary-like matches (' porn ' etc.)
  const padded = ` ${needle} `;
  for (const term of BANNED_SUBSTRINGS) {
    if (padded.includes(term)) return term.trim();
  }
  return null;
}

/**
 * Batch check across multiple fields. Throws BadRequestException on match.
 */
export function assertClean(fields: Record<string, string | null | undefined>): void {
  for (const [field, value] of Object.entries(fields)) {
    const match = findBannedContent(value);
    if (match) {
      throw new BadRequestException(
        `Le champ "${field}" contient du contenu non autorisé. Veuillez le modifier.`,
      );
    }
  }
}
