import {
  describeWheelEnd,
  formatDaySlots,
  getFicheContacts,
  getFicheRewards,
  getFicheTabs,
  getKnownBadges,
  getOpenStatus,
  getSocialProfiles,
  linkifyText,
  pluralKey,
  toWebsite,
  validateOpeningHours,
} from '@jitplus/shared/src/merchantFiche';
import type { OpeningHours } from '@jitplus/shared/src/types';

// 2024-01-01 is a Monday.
const at = (day: number, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2024, 0, day, h, m);
};

describe('getOpenStatus', () => {
  const hours: OpeningHours = {
    mon: { closed: false, slots: [{ open: '09:00', close: '12:00' }, { open: '14:00', close: '19:00' }] },
    fri: { closed: false, slots: [{ open: '18:00', close: '02:00' }] },
    sat: { closed: true, slots: [] },
  };

  it('is open inside a slot', () => {
    expect(getOpenStatus(hours, at(1, '10:00'))).toEqual({ isOpen: true, closesAt: '12:00' });
  });

  it('gives the next slot of the day during a break', () => {
    expect(getOpenStatus(hours, at(1, '13:00'))).toMatchObject({ isOpen: false, opensAt: '14:00', opensInDays: 0 });
  });

  it('keeps an overnight slot open after midnight', () => {
    // Saturday 01:00 still belongs to Friday's 18:00 – 02:00 slot.
    expect(getOpenStatus(hours, at(6, '01:00'))).toEqual({ isOpen: true, closesAt: '02:00' });
    expect(getOpenStatus(hours, at(6, '03:00'))).toMatchObject({ isOpen: false, opensDay: 'mon', opensInDays: 2 });
  });

  it('returns null without hours', () => {
    expect(getOpenStatus(null)).toBeNull();
    expect(getOpenStatus({})).toBeNull();
  });
});

describe('formatDaySlots', () => {
  it('formats sorted slots and treats closed days as null', () => {
    expect(formatDaySlots({ closed: false, slots: [{ open: '14:00', close: '19:00' }, { open: '09:00', close: '12:00' }] }))
      .toBe('09:00 – 12:00 · 14:00 – 19:00');
    expect(formatDaySlots({ closed: true, slots: [{ open: '09:00', close: '12:00' }] })).toBeNull();
    expect(formatDaySlots({ closed: false, slots: [] })).toBeNull();
  });
});

describe('validateOpeningHours', () => {
  it('accepts overnight slots and rejects empty or malformed ones', () => {
    expect(validateOpeningHours({ fri: { closed: false, slots: [{ open: '18:00', close: '02:00' }] } })).toBeNull();
    expect(validateOpeningHours({ mon: { closed: false, slots: [{ open: '09:00', close: '09:00' }] } })).toBe('empty');
    expect(validateOpeningHours({ mon: { closed: false, slots: [{ open: '9:00', close: '18:00' }] } })).toBe('format');
    expect(validateOpeningHours({ mon: { closed: true, slots: [{ open: 'x', close: 'y' }] } })).toBeNull();
  });
});

describe('links', () => {
  it('only keeps http(s) websites', () => {
    expect(toWebsite('cafe-atlas.ma')).toBe('https://cafe-atlas.ma/');
    expect(toWebsite('javascript:alert(1)')).toBeNull();
    expect(toWebsite('nodomain')).toBeNull();
  });

  it('builds social profiles from handles or pasted URLs, in display order', () => {
    const profiles = getSocialProfiles({
      facebook: 'https://www.facebook.com/cafe.atlas/',
      instagram: '@cafe.atlas',
      whatsapp: '+212612345678',
    });
    expect(profiles.map((p) => p.network)).toEqual(['instagram', 'facebook']);
    expect(profiles[0].urls).toEqual(['instagram://user?username=cafe.atlas', 'https://www.instagram.com/cafe.atlas']);
    expect(profiles[1].handle).toBe('cafe.atlas');
  });

  it('lists contact actions from the first store, then the brand', () => {
    const contacts = getFicheContacts({
      name: 'Café Atlas',
      latitude: 33.5,
      longitude: -7.6,
      socialLinks: { whatsapp: '+212 6 12 34 56 78', website: 'cafe-atlas.ma' },
      stores: [{ nom: 'Maarif', telephone: '05 22 00 00 00', email: 'hello@cafe-atlas.ma' }],
    });
    expect(contacts.map((c) => c.key)).toEqual(['directions', 'call', 'whatsapp', 'website', 'email']);
    expect(contacts[0]).toMatchObject({ latitude: 33.5, longitude: -7.6, label: 'Maarif' });
    expect(contacts[1]).toEqual({ key: 'call', url: 'tel:0522000000' });
    expect(contacts[2]).toEqual({ key: 'whatsapp', url: 'https://wa.me/212612345678' });
  });

  it('linkifies urls, e-mails and phone numbers in free text', () => {
    const parts = linkifyText('Commandez sur www.atlas.ma, écrivez à hello@atlas.ma ou appelez le 06 12 34 56 78.');
    expect(parts.filter((p) => p.url).map((p) => p.url)).toEqual([
      'https://www.atlas.ma/',
      'mailto:hello@atlas.ma',
      'tel:0612345678',
    ]);
    expect(parts.map((p) => p.text).join('')).toBe('Commandez sur www.atlas.ma, écrivez à hello@atlas.ma ou appelez le 06 12 34 56 78.');
  });
});

describe('loyalty and badges', () => {
  it('sorts rewards and falls back to one gift at the stamp goal', () => {
    expect(getFicheRewards([{ id: 'b', titre: 'B', cout: 8 }, { id: 'a', titre: 'A', cout: 3 }], 10, 'Gift').map((r) => r.id))
      .toEqual(['a', 'b']);
    expect(getFicheRewards([], 12, 'Gift')).toEqual([{ id: 'default', titre: 'Gift', cout: 12 }]);
  });

  it('drops unknown badge codes', () => {
    expect(getKnownBadges(['WIFI', 'UNKNOWN', 'HALAL'])).toEqual(['WIFI', 'HALAL']);
  });

  it('picks the plural key', () => {
    expect(pluralKey('merchant.yourStamps', 1)).toBe('merchant.yourStamps_one');
    expect(pluralKey('merchant.yourStamps', 0)).toBe('merchant.yourStamps_other');
  });
});

describe('page tabs', () => {
  it('only lists tabs with something to show', () => {
    expect(getFicheTabs({ hasDeals: false, photoCount: 0 })).toEqual(['overview', 'loyalty', 'info']);
    expect(getFicheTabs({ hasDeals: true, photoCount: 3 })).toEqual(['overview', 'loyalty', 'deals', 'info', 'photos']);
  });

  it('describes when the lucky wheel ends', () => {
    const t = (key: string, opts?: Record<string, unknown>) => (opts ? `${key}:${opts.days}` : key);
    const now = new Date(2024, 0, 1, 12, 0).getTime();
    const inHours = (h: number) => new Date(now + h * 3_600_000).toISOString();
    expect(describeWheelEnd(inHours(-1), t, 'merchant', now)).toBe('merchant.luckyWheelEndsToday');
    expect(describeWheelEnd(inHours(20), t, 'merchant', now)).toBe('merchant.luckyWheelEndsTomorrow');
    expect(describeWheelEnd(inHours(60), t, 'fiche', now)).toBe('fiche.luckyWheelEndsIn:3');
  });
});
