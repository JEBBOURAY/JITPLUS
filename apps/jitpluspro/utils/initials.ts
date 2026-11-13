// Initials for avatars. Names are free text: they can start with spaces, an
// emoji or punctuation, and `charAt(0)` would return half a surrogate pair.

/** First letter or digit of a name, skipping spaces, emoji and punctuation; '' if none. */
export function firstLetter(s?: string | null): string {
  return (s ?? '').match(/[\p{L}\p{N}]/u)?.[0] ?? '';
}

/** Up to `max` uppercase initials, one per name part, or '?' when none has a letter. */
export function initialsOf(parts: (string | null | undefined)[], max = 2): string {
  return parts.map(firstLetter).filter(Boolean).slice(0, max).join('').toUpperCase() || '?';
}

/** Initials from the first two words of a single name (merchant, store). */
export function wordInitials(name?: string | null): string {
  return initialsOf((name ?? '').split(/\s+/).filter((w) => firstLetter(w)));
}
