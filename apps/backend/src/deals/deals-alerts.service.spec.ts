import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DealsAlertsService } from './deals-alerts.service';

const PREFS = { dealAlertsEnabled: false, dealAlertCityKey: null, dealAlertCategories: [], dealOnlineAlerts: true };

function makeService(current: Record<string, unknown> | null = PREFS) {
  const prisma: any = {
    client: {
      findFirst: jest.fn().mockResolvedValue(current),
      update: jest.fn(({ data }: any) => Promise.resolve({ ...current, ...data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    deal: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
  };
  const push = { sendMulticast: jest.fn(), sendToMerchant: jest.fn() };
  return { service: new DealsAlertsService(prisma, push), prisma, push };
}

describe('DealsAlertsService preferences', () => {
  it('returns the stored preferences', async () => {
    const { service } = makeService({ ...PREFS, dealAlertsEnabled: true, dealAlertCityKey: 'rabat' });
    await expect(service.getPreferences('c1')).resolves.toEqual({ enabled: true, cityKey: 'rabat', categories: [], online: true });
  });

  it('refuses to enable city alerts without a city', async () => {
    const { service, prisma } = makeService();
    await expect(service.updatePreferences('c1', { enabled: true })).rejects.toMatchObject({
      response: { code: 'DEAL_ALERT_NEEDS_CITY' },
    });
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it('refuses an unknown city', async () => {
    const { service } = makeService();
    await expect(service.updatePreferences('c1', { enabled: true, cityKey: 'atlantis' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores the city, deduplicated categories and the online switch', async () => {
    const { service, prisma } = makeService();
    const result = await service.updatePreferences('c1', {
      enabled: true,
      cityKey: 'casablanca',
      categories: ['RESTAURANT', 'RESTAURANT'] as any,
      online: false,
    });
    expect(prisma.client.update.mock.calls[0][0].data).toEqual({
      dealAlertsEnabled: true,
      dealAlertCityKey: 'casablanca',
      dealAlertCategories: ['RESTAURANT'],
      dealOnlineAlerts: false,
    });
    expect(result).toEqual({ enabled: true, cityKey: 'casablanca', categories: ['RESTAURANT'], online: false });
  });

  it('keeps the other fields when only the online switch changes', async () => {
    const { service, prisma } = makeService({ ...PREFS, dealAlertsEnabled: true, dealAlertCityKey: 'fes' });
    await service.updatePreferences('c1', { online: false });
    expect(prisma.client.update.mock.calls[0][0].data).toEqual({
      dealAlertsEnabled: true,
      dealAlertCityKey: 'fes',
      dealOnlineAlerts: false,
    });
  });

  it('404s for an unknown client', async () => {
    const { service } = makeService(null);
    await expect(service.getPreferences('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('DealsAlertsService digest', () => {
  it('does nothing when no deal is new', async () => {
    const { service, prisma, push } = makeService();
    await expect(service.runDigest(new Date())).resolves.toEqual({ city: 0, online: 0 });
    expect(prisma.client.findMany).not.toHaveBeenCalled();
    expect(push.sendMulticast).not.toHaveBeenCalled();
  });
});
