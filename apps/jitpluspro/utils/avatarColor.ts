/** Palette of avatar background colors keyed by first char code */
const AVATAR_COLORS = [
  '#7C3AED', '#ec4899', '#06b6d4', '#10b981', '#3b82f6',
  '#8b5cf6', '#ef4444', '#0891B2', '#f97316', '#14b8a6',
];

/**
 * Pick a deterministic background color for a user avatar based on their name.
 */
export function avatarColor(name: string): string {
  const code = (name || '?').charCodeAt(0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}
