/**
 * Search form of a text: lower case, trimmed, without French accents or Arabic
 * vowel marks (harakat), so "Café" matches "cafe" and "مَقهى" matches "مقهى".
 */
export function normalizeSearch(text: string): string {
  let out = text;
  // Engine without Unicode normalization: accents are then matched as typed.
  try { out = text.normalize('NFD'); } catch { /* keep the raw text */ }
  return out.replace(/[̀-ًͯ-ْ]/g, '').toLowerCase().trim();
}
