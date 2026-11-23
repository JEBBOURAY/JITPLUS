/** Count shown in a small badge: capped at "99+" so the pill keeps its width. */
export function formatBadgeCount(count: number): string {
  return count > 99 ? '99+' : String(count);
}
