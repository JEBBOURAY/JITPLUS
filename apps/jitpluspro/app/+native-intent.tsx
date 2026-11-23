/**
 * Entry point for links opening the app (launch URL and URLs received while
 * running). The Android App Link https://…/pro/referral (and the web
 * /pro/register?ref= landing) has a `/pro/` prefix that no screen matches, so
 * it opened "Page introuvable": map it to the app routes. Parsed by hand: the
 * React Native URL polyfill does not implement every URL API.
 */
const PRO_LINK = /^(?:https?:\/\/[^/?#]+)?\/pro\/(referral|register)\/?(?:\?([^#]*))?(?:#.*)?$/i;
const REF_PARAM = /(?:^|&)ref=([A-Za-z0-9_-]{4,20})(?:&|$)/;

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const match = PRO_LINK.exec(path);
  if (!match) return path;
  if (match[1].toLowerCase() === 'referral') return '/referral';
  const ref = REF_PARAM.exec(match[2] ?? '')?.[1];
  return ref ? `/register?ref=${ref}` : '/register';
}
