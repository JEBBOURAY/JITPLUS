export type NotifSection = 'today' | 'yesterday' | 'thisWeek' | 'earlier';

export type NotifListItem<T> =
  | { kind: 'header'; key: string; section: NotifSection }
  | { kind: 'notif'; key: string; notif: T };

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

/** Buckets a date relative to `now`. Future dates (clock skew) count as today. */
export function getNotifSection(date: Date, now: Date = new Date()): NotifSection {
  const todayStart = startOfDay(now);
  const ts = date.getTime();
  if (ts >= todayStart) return 'today';
  if (ts >= todayStart - DAY_MS) return 'yesterday';
  if (ts >= todayStart - 6 * DAY_MS) return 'thisWeek';
  return 'earlier';
}

/**
 * Flattens a newest-first list into section headers + items so it can be
 * rendered by a single FlatList (keeps infinite scroll + virtualization).
 */
export function groupNotificationsBySection<T extends { id: string; createdAt: string }>(
  list: T[],
  now: Date = new Date(),
): NotifListItem<T>[] {
  const out: NotifListItem<T>[] = [];
  let current: NotifSection | null = null;
  for (const notif of list) {
    const section = getNotifSection(new Date(notif.createdAt), now);
    if (section !== current) {
      current = section;
      out.push({ kind: 'header', key: `header-${section}-${notif.id}`, section });
    }
    out.push({ kind: 'notif', key: notif.id, notif });
  }
  return out;
}

export type RelativeAge =
  | { unit: 'now' }
  | { unit: 'minutes'; value: number }
  | { unit: 'hours'; value: number };

/** Short relative age, meant for items in the "today" section. */
export function getRelativeAge(date: Date, now: Date = new Date()): RelativeAge {
  const diffMin = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (diffMin < 1) return { unit: 'now' };
  if (diffMin < 60) return { unit: 'minutes', value: diffMin };
  return { unit: 'hours', value: Math.floor(diffMin / 60) };
}
