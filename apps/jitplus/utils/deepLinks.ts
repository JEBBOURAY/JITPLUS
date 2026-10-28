import { isClaimToken, isEntityId } from '@/utils/ids';

// Custom scheme, universal/app links (any host) or an already-stripped path.
const CLAIM_LINK_RE = /^(?:jitplus:\/\/claim|https?:\/\/[^/]+\/d\/claim|\/d\/claim)\/?(?:\?([^#]*))?(?:#.*)?$/i;
const SHARE_LINK_RE = /^(?:jitplus:\/\/merchant\/|https?:\/\/[^/]+\/m\/|\/m\/)([^/?#]+)/i;
const DEAL_LINK_RE = /^(?:jitplus:\/\/deal\/|https?:\/\/[^/]+\/bp\/|\/bp\/)([^/?#]+)/i;

function safeDecode(value: string): string {
  try { return decodeURIComponent(value); } catch { return ''; }
}

/**
 * Maps an incoming claim, merchant-share or deal-share URL to its in-app route, or returns
 * null for any other URL (auth redirects, dev-client URLs...), which must be
 * left to expo-router untouched.
 */
export function resolveIncomingUrl(url: string): string | null {
  const claim = CLAIM_LINK_RE.exec(url);
  if (claim) {
    const tokenMatch = /(?:^|&)token=([^&]+)/i.exec(claim[1] ?? '');
    const token = tokenMatch ? safeDecode(tokenMatch[1]) : '';
    // An invalid token still lands on /claim so the user sees why nothing happened.
    return isClaimToken(token) ? `/claim?token=${encodeURIComponent(token)}` : '/claim';
  }

  const share = SHARE_LINK_RE.exec(url);
  if (share) {
    const id = safeDecode(share[1]).toLowerCase();
    return isEntityId(id) ? `/merchant/${id}` : '/';
  }

  const deal = DEAL_LINK_RE.exec(url);
  if (deal) {
    const id = safeDecode(deal[1]).toLowerCase();
    return isEntityId(id) ? `/deal/${id}` : '/';
  }

  return null;
}
