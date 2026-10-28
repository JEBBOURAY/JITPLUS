import { moroccoCityLabel } from './morocco-cities';
import { dealDigestTexts } from './deal-notif-i18n';

export interface DigestDeal {
  id: string;
  merchantId: string;
  merchantName: string;
  category: string;
  scope: 'LOCAL' | 'ONLINE';
  title: string;
  cityKeys: string[];
  percentOff: number | null;
  startsAt: Date;
}

/** Most recent first, then the strongest discount. */
export function compareDigestDeals(a: DigestDeal, b: DigestDeal): number {
  return b.startsAt.getTime() - a.startsAt.getTime() || (b.percentOff ?? 0) - (a.percentOff ?? 0) || a.id.localeCompare(b.id);
}

/** The single ONLINE deal of the day, skipping merchants already featured this week. */
export function pickFeaturedOnline(deals: DigestDeal[], featuredMerchants: ReadonlySet<string>): DigestDeal | null {
  const candidates = deals.filter((d) => d.scope === 'ONLINE' && !featuredMerchants.has(d.merchantId));
  return candidates.sort(compareDigestDeals)[0] ?? null;
}

export function groupByCity(deals: DigestDeal[]): Map<string, DigestDeal[]> {
  const byCity = new Map<string, DigestDeal[]>();
  for (const d of deals) {
    if (d.scope !== 'LOCAL') continue;
    for (const key of d.cityKeys) byCity.set(key, [...(byCity.get(key) ?? []), d]);
  }
  for (const list of byCity.values()) list.sort(compareDigestDeals);
  return byCity;
}

/** Empty `categories` means every category. */
export function dealsForClient(
  deals: DigestDeal[],
  categories: readonly string[],
  blocked: ReadonlySet<string>,
): DigestDeal[] {
  return deals.filter((d) => !blocked.has(d.merchantId) && (categories.length === 0 || categories.includes(d.category)));
}

export interface DigestMessage {
  title: string;
  body: string;
  data: Record<string, string>;
}

/** `deals` is ordered (local first, ONLINE last); `cityKey` is null for an ONLINE-only digest. */
export function digestMessage(lang: string, deals: DigestDeal[], cityKey: string | null): DigestMessage {
  const city = cityKey ? moroccoCityLabel(cityKey, lang) : '';
  const texts = dealDigestTexts(lang, {
    count: deals.length,
    city,
    withOnline: deals.some((d) => d.scope === 'ONLINE'),
    first: { merchant: deals[0].merchantName, title: deals[0].title },
    merchants: [...new Set(deals.map((d) => d.merchantName))],
  });
  const data: Record<string, string> =
    deals.length === 1
      ? { event: 'deals_digest', action: 'open_deal', dealId: deals[0].id }
      : { event: 'deals_digest', action: 'open_deals' };
  return { ...texts, data };
}

export function digestGroupKey(lang: string, deals: DigestDeal[], cityKey: string | null): string {
  return `${lang}|${cityKey ?? '#online'}|${deals.map((d) => d.id).join(',')}`;
}
