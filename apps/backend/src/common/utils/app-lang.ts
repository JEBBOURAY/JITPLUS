/** Languages the apps, pushes and inbox messages are translated into. */
export type AppLang = 'fr' | 'en' | 'ar';

/**
 * Normalizes a stored/requested language to an AppLang: exact 'en' or 'ar',
 * anything else (null, unknown, other case) falls back to 'fr'.
 */
export function pickAppLang(v?: string | null): AppLang {
  return v === 'en' || v === 'ar' ? v : 'fr';
}
