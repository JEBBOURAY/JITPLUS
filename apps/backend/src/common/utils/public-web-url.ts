/** Default fallback (used only if env var is unset — production MUST set it). */
const DEFAULT_PUBLIC_WEB_URL = 'https://jitplus.com';

/** Public link on the website (PUBLIC_WEB_URL) that opens an app through the smart redirect. */
export function buildPublicWebUrl(path: string): string {
  const base = (process.env.PUBLIC_WEB_URL?.trim() || DEFAULT_PUBLIC_WEB_URL).replace(/\/+$/, '');
  return `${base}/${path.replace(/^\/+/, '')}`;
}
