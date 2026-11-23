import { bookingChips, filterBookingShops, normalizeSearch, type BookingSearchShop } from '@jitplus/shared/src/booking';

const service = (id: string, nom: string, templateNom: string | null = null) => ({ id, nom, templateNom, durationMin: 30, priceFrom: null });
const shop = (merchantId: string, nom: string, services: BookingSearchShop['services']): BookingSearchShop => ({
  merchantId, nom, services, logoUrl: null, categorie: 'COIFFURE', ville: null, currency: 'MAD', distanceKm: null, hasCard: false,
});

const shops = [
  shop('a', 'Salon Yasmine', [service('a1', 'Coupe femme', 'Coupe femme'), service('a2', 'Brushing')]),
  shop('b', 'Barber Hicham', [service('b1', 'Coupe homme', 'Coupe homme'), service('b2', 'Barbe')]),
  shop('c', 'Beauty Nails', [service('c1', 'Manucure'), service('c2', 'Coupe homme express', 'Coupe homme')]),
];

describe('booking search', () => {
  it('ignores case and French accents', () => {
    expect(normalizeSearch('  Épilation ')).toBe('epilation');
  });

  it('keeps only the matching services, in the shop order', () => {
    const out = filterBookingShops(shops, 'coupe', null);
    expect(out.map((s) => s.merchantId)).toEqual(['a', 'b', 'c']);
    expect(out[0].services.map((s) => s.id)).toEqual(['a1']);
    expect(out[2].services.map((s) => s.id)).toEqual(['c2']);
  });

  it('a match on the shop name keeps all its services', () => {
    const out = filterBookingShops(shops, 'barber', null);
    expect(out).toHaveLength(1);
    expect(out[0].services).toHaveLength(2);
  });

  it('a chip groups services by catalogue name across shops', () => {
    const out = filterBookingShops(shops, '', normalizeSearch('Coupe homme'));
    expect(out.map((s) => [s.merchantId, s.services.map((x) => x.id)])).toEqual([['b', ['b1']], ['c', ['c2']]]);
  });

  it('chips list the services offered by the most shops first', () => {
    expect(bookingChips(shops)[0]).toEqual({ key: 'coupe homme', label: 'Coupe homme' });
  });

  it('no query and no chip returns the list as is', () => {
    expect(filterBookingShops(shops, '  ', null)).toBe(shops);
  });
});
