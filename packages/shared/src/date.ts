// ── Shared date utilities ───────────────────────────────────────────────────
// Single source of truth for both JitPlus (client) and JitPlus Pro (merchant) apps.
// Merges timeAgo (from jitplus) + formatDate/formatDateTime (from jitpluspro).

type SupportedLocale = 'fr' | 'en' | 'ar';

// ── Month names (Intl.DateTimeFormat is unreliable on Hermes / older Android) ─
const MONTHS: Record<SupportedLocale, string[]> = {
  fr: ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'],
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
  ar: ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'],
};

const MONTHS_SHORT: Record<SupportedLocale, string[]> = {
  fr: ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'],
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  ar: ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'],
};

const RELATIVE_LABELS: Record<SupportedLocale, {
  now: string;
  minsAgo: (m: number) => string;
  hoursAgo: (h: number) => string;
  daysAgo: (d: number) => string;
  todayAt: (time: string) => string;
}> = {
  fr: {
    now:      "À l'instant",
    minsAgo:  (m) => `Il y a ${m} min`,
    hoursAgo: (h) => `Il y a ${h}h`,
    daysAgo:  (d) => `Il y a ${d}j`,
    todayAt:  (t) => `Aujourd'hui ${t}`,
  },
  en: {
    now:      'Just now',
    minsAgo:  (m) => `${m}m ago`,
    hoursAgo: (h) => `${h}h ago`,
    daysAgo:  (d) => `${d}d ago`,
    todayAt:  (t) => `Today ${t}`,
  },
  ar: {
    now:      'الآن',
    minsAgo:  (m) => `منذ ${m} دقيقة`,
    hoursAgo: (h) => `منذ ${h} ساعة`,
    daysAgo:  (d) => `منذ ${d} يوم`,
    todayAt:  (t) => `اليوم ${t}`,
  },
};

/** Normalise an AppLocale / BCP-47 tag to our 3-key set */
function resolveLocale(locale = 'fr'): SupportedLocale {
  if (locale.startsWith('ar')) return 'ar';
  if (locale.startsWith('en')) return 'en';
  return 'fr';
}

/**
 * Returns a human-readable relative time string respecting the current locale.
 *
 * Examples (fr): "À l'instant", "Il y a 5 min", "Il y a 3h", "Il y a 2j", "24 févr."
 * Examples (en): "Just now", "5m ago", "3h ago", "2d ago", "Feb 24"
 * Examples (ar): "الآن", "منذ 5 دقيقة", "منذ 3 ساعة", "منذ 2 يوم"
 */
export function timeAgo(dateStr: string | undefined | null, locale?: string): string {
  if (!dateStr) return '';
  const timestamp = new Date(dateStr).getTime();
  if (isNaN(timestamp)) return '';

  const l    = resolveLocale(locale);
  const L    = RELATIVE_LABELS[l];
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60_000);

  if (mins < 1)  return L.now;
  if (mins < 60) return L.minsAgo(mins);

  const hours = Math.floor(mins / 60);
  if (hours < 24) return L.hoursAgo(hours);

  const days = Math.floor(hours / 24);
  if (days < 7) return L.daysAgo(days);

  const date  = new Date(dateStr);
  const day   = date.getDate();
  const month = MONTHS_SHORT[l][date.getMonth()];
  return l === 'en' ? `${month} ${day}` : `${day} ${month}`;
}

/**
 * Format a date string as a long date, e.g. "01 janvier 2024" / "January 01, 2024"
 */
export function formatDate(d: string, locale?: string): string {
  const l = resolveLocale(locale);
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  const day   = String(date.getDate()).padStart(2, '0');
  const month = MONTHS[l][date.getMonth()];
  const year  = date.getFullYear();
  if (l === 'ar') return `${day} ${month} ${year}`;
  if (l === 'en') return `${month} ${day}, ${year}`;
  return `${day} ${month} ${year}`;
}

/**
 * Format a date string as "Aujourd'hui 14:30" or "01 janv. 14:30"
 */
export function formatDateTime(d: string, locale?: string): string {
  const l    = resolveLocale(locale);
  const date = new Date(d);
  if (isNaN(date.getTime())) return d;
  const now     = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const hh      = String(date.getHours()).padStart(2, '0');
  const mm      = String(date.getMinutes()).padStart(2, '0');
  const time    = `${hh}:${mm}`;

  if (isToday) return RELATIVE_LABELS[l].todayAt(time);

  const day   = String(date.getDate()).padStart(2, '0');
  const month = MONTHS_SHORT[l][date.getMonth()];
  return `${day} ${month} ${time}`;
}
