import { BookingClientService } from './booking-client.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { BookingAvailabilityService } from './booking-availability.service';
import type { BookingNotifyService } from './booking-notify.service';
import type { MerchantPlanService } from '../merchant/services/merchant-plan.service';

const CASA = { lat: 33.5731, lng: -7.5898 };

function shop(id: string, nom: string, store: { latitude: number | null; longitude: number | null } | null) {
  return {
    id, nom, logoUrl: null, categorie: 'COIFFURE', ville: 'Casablanca', currency: 'MAD',
    stores: store ? [store] : [],
    bookableServices: [
      { id: `${id}-s`, nom: 'Coupe homme', durationMin: 30, priceFrom: { toString: () => '80' }, template: { nom: 'Coupe homme' } },
    ],
  };
}

describe('BookingClientService.searchServices', () => {
  const merchants = [
    shop('far', 'B Salon loin', { latitude: 34.02, longitude: -6.83 }), // Rabat
    shop('near', 'C Salon proche', { latitude: 33.574, longitude: -7.59 }),
    shop('mine', 'D Mon salon', { latitude: 31.63, longitude: -8.0 }), // Marrakech, but carded
    shop('nowhere', 'A Salon sans GPS', { latitude: null, longitude: null }),
    shop('blocked', 'E Salon bloqué', { latitude: 33.573, longitude: -7.589 }),
  ];
  const prisma = {
    merchant: { findMany: jest.fn().mockResolvedValue(merchants) },
    loyaltyCard: { findMany: jest.fn().mockResolvedValue([{ merchantId: 'mine' }]) },
    clientMerchantBlock: { findMany: jest.fn().mockResolvedValue([{ merchantId: 'blocked' }]) },
  };
  const service = new BookingClientService(
    prisma as unknown as PrismaService,
    {} as BookingAvailabilityService,
    {} as BookingNotifyService,
    {} as MerchantPlanService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('puts the client\'s shops first, then the nearest, unknown distance last, and leaves blocked shops out', async () => {
    const { shops } = await service.searchServices(CASA, 'client-1');
    expect(shops.map((s) => s.merchantId)).toEqual(['mine', 'near', 'far', 'nowhere']);
    expect(shops[0].hasCard).toBe(true);
    expect(shops[1].distanceKm).toBeLessThan(1);
    expect(shops[3].distanceKm).toBeNull();
    expect(shops[1].services[0]).toEqual({ id: 'near-s', nom: 'Coupe homme', templateNom: 'Coupe homme', durationMin: 30, priceFrom: 80 });
  });

  it('only lists shops with booking on and a bookable service', async () => {
    await service.searchServices(null, 'client-1');
    const where = prisma.merchant.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      isActive: true,
      deletedAt: null,
      bookingSettings: { is: { enabled: true } },
      bookableServices: { some: { isActive: true, deletedAt: null } },
    });
  });

  it('for a guest: no card or block lookup, sorted by name without a position', async () => {
    const { shops } = await service.searchServices(null);
    expect(prisma.loyaltyCard.findMany).not.toHaveBeenCalled();
    expect(prisma.clientMerchantBlock.findMany).not.toHaveBeenCalled();
    expect(shops.every((s) => !s.hasCard && s.distanceKm === null)).toBe(true);
    expect(shops.map((s) => s.merchantId)).toEqual(['nowhere', 'far', 'near', 'mine', 'blocked']);
  });
});
