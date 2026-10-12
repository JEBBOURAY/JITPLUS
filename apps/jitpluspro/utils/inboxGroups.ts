export type InboxSectionKey = 'today' | 'yesterday' | 'week' | 'older';

export interface InboxSection<T> {
  key: InboxSectionKey;
  data: T[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const ORDER: InboxSectionKey[] = ['today', 'yesterday', 'week', 'older'];

/**
 * Buckets items by the merchant's local calendar day. "week" covers the five
 * days before yesterday. Future timestamps (device clock behind the server)
 * land in "today". Input order is kept inside each section; empty sections
 * are dropped.
 */
export function groupInboxByDate<T extends { createdAt: string }>(
  items: T[],
  now: Date = new Date(),
): InboxSection<T>[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - DAY_MS;
  const startOfWeek = startOfToday - 6 * DAY_MS;

  const buckets: Record<InboxSectionKey, T[]> = { today: [], yesterday: [], week: [], older: [] };
  for (const item of items) {
    const ts = new Date(item.createdAt).getTime();
    if (Number.isNaN(ts)) {
      buckets.older.push(item);
    } else if (ts >= startOfToday) {
      buckets.today.push(item);
    } else if (ts >= startOfYesterday) {
      buckets.yesterday.push(item);
    } else if (ts >= startOfWeek) {
      buckets.week.push(item);
    } else {
      buckets.older.push(item);
    }
  }

  return ORDER.filter((key) => buckets[key].length > 0).map((key) => ({ key, data: buckets[key] }));
}
