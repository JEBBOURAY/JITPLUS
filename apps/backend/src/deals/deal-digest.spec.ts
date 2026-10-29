import { dealsForClient, digestGroupKey, digestMessage, groupByCity, pickFeaturedOnline, type DigestDeal } from './deal-digest';

const NOW = Date.UTC(2026, 10, 2, 11);

function deal(overrides: Partial<DigestDeal> = {}): DigestDeal {
  return {
    id: 'd1',
    merchantId: 'm1',
    merchantName: 'SportZone',
    category: 'SPORT',
    scope: 'LOCAL',
    title: '-30 % sur les baskets Run X',
    cityKeys: ['casablanca'],
    percentOff: 30,
    startsAt: new Date(NOW - 3_600_000),
    ...overrides,
  };
}

describe('deal digest', () => {
  it('features the most recent ONLINE deal, then the strongest discount, skipping merchants featured this week', () => {
    const older = deal({ id: 'a', scope: 'ONLINE', merchantId: 'm1', startsAt: new Date(NOW - 7_200_000), percentOff: 80 });
    const recentSmall = deal({ id: 'b', scope: 'ONLINE', merchantId: 'm2', percentOff: 10 });
    const recentBig = deal({ id: 'c', scope: 'ONLINE', merchantId: 'm3', percentOff: 40 });
    const local = deal({ id: 'd', scope: 'LOCAL', merchantId: 'm4', startsAt: new Date(NOW) });

    expect(pickFeaturedOnline([older, recentSmall, recentBig, local], new Set())?.id).toBe('c');
    expect(pickFeaturedOnline([older, recentSmall, recentBig], new Set(['m3']))?.id).toBe('b');
    expect(pickFeaturedOnline([older], new Set(['m1']))).toBeNull();
  });

  it('groups LOCAL deals by city, newest first, a deal counting in each of its cities', () => {
    const a = deal({ id: 'a', cityKeys: ['casablanca', 'rabat'], startsAt: new Date(NOW - 5_000) });
    const b = deal({ id: 'b', cityKeys: ['casablanca'] , startsAt: new Date(NOW) });
    const online = deal({ id: 'o', scope: 'ONLINE', cityKeys: [] });
    const byCity = groupByCity([a, b, online]);
    expect([...byCity.keys()].sort()).toEqual(['casablanca', 'rabat']);
    expect(byCity.get('casablanca')!.map((d) => d.id)).toEqual(['b', 'a']);
    expect(byCity.get('rabat')!.map((d) => d.id)).toEqual(['a']);
  });

  it('filters deals by the client categories (empty = all) and blocked merchants', () => {
    const sport = deal({ id: 's', category: 'SPORT', merchantId: 'm1' });
    const food = deal({ id: 'f', category: 'RESTAURANT', merchantId: 'm2' });
    expect(dealsForClient([sport, food], [], new Set()).map((d) => d.id)).toEqual(['s', 'f']);
    expect(dealsForClient([sport, food], ['RESTAURANT'], new Set()).map((d) => d.id)).toEqual(['f']);
    expect(dealsForClient([sport, food], [], new Set(['m1'])).map((d) => d.id)).toEqual(['f']);
  });

  it('builds a single-deal message that opens the deal', () => {
    const msg = digestMessage('fr', [deal()], 'casablanca');
    expect(msg.title).toBe('Nouveau bon plan à Casablanca');
    expect(msg.body).toBe('🔥 SportZone : -30 % sur les baskets Run X');
    expect(msg.data).toEqual({ event: 'deals_digest', action: 'open_deal', dealId: 'd1' });

    expect(digestMessage('en', [deal({ scope: 'ONLINE' })], null).title).toBe('New online deal');
  });

  it('builds a grouped message that opens the deals tab', () => {
    const deals = [
      deal({ id: 'a', merchantName: 'SportZone' }),
      deal({ id: 'b', merchantName: 'Café Atlas' }),
      deal({ id: 'c', merchantName: 'SportZone' }),
      deal({ id: 'd', merchantName: 'Librairie Nour' }),
      deal({ id: 'e', merchantName: 'Opticien Lux', scope: 'ONLINE' }),
    ];
    const fr = digestMessage('fr', deals, 'casablanca');
    expect(fr.title).toBe('🔥 5 nouveaux bons plans à Casablanca et en ligne');
    expect(fr.body).toBe('SportZone, Café Atlas, Librairie Nour et 2 autres');
    expect(fr.data).toEqual({ event: 'deals_digest', action: 'open_deals' });

    expect(digestMessage('ar', deals.slice(0, 2), 'casablanca').title).toBe('🔥 2 عروض جديدة في الدار البيضاء');
    expect(digestMessage('en', deals.slice(0, 2), 'marrakech').title).toBe('🔥 2 new deals in Marrakesh');
  });

  it('gives the same group key to clients that get the same message', () => {
    const deals = [deal({ id: 'a' }), deal({ id: 'b' })];
    expect(digestGroupKey('fr', deals, 'casablanca')).toBe(digestGroupKey('fr', [...deals], 'casablanca'));
    expect(digestGroupKey('fr', deals, 'casablanca')).not.toBe(digestGroupKey('ar', deals, 'casablanca'));
    expect(digestGroupKey('fr', deals, null)).not.toBe(digestGroupKey('fr', deals, 'casablanca'));
  });
});
