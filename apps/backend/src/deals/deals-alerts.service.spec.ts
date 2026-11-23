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

describe('DealsAlertsService cardholders and saved deals', () => {
  const DEAL = { id: 'd1', title: 'Moins 30', merchantId: 'm1', merchant: { nom: 'Shop' } };
  const holder = (clientId: string, pushToken: string | null, language = 'fr') => ({ clientId, client: { pushToken, language } });

  function make() {
    const { service, prisma, push } = makeService();
    prisma.loyaltyCard = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.dealSave = { findMany: jest.fn().mockResolvedValue([]) };
    prisma.notification = { create: jest.fn().mockResolvedValue({ id: 'n1' }), update: jest.fn() };
    prisma.clientNotificationStatus = { createMany: jest.fn() };
    prisma.$queryRaw = jest.fn();
    prisma.campaignSentTracker = { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn() };
    push.sendMulticast.mockResolvedValue({ successCount: 1, failureCount: 0, invalidTokens: [] });
    return { service, prisma, push };
  }

  it('tells the cardholders who win the daily claim, and keeps the deals open for the others', async () => {
    const { service, prisma, push } = make();
    prisma.deal.findMany.mockResolvedValue([DEAL, { ...DEAL, id: 'd2', title: 'Autre' }]);
    prisma.loyaltyCard.findMany.mockResolvedValue([holder('c1', 't1'), holder('c2', 't2'), holder('c3', null)]);
    // c2 already got a deal push today (another merchant).
    prisma.$queryRaw.mockResolvedValue([{ client_id: 'c1' }]);

    await expect(service.notifyCardholders(new Date())).resolves.toBe(1);
    // Only reachable clients compete for the daily push.
    expect(prisma.$queryRaw.mock.calls[0]).toContainEqual(['c1', 'c2']);
    const where = prisma.loyaltyCard.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ merchantId: 'm1', deactivatedAt: null, consentPending: false });
    expect(where.client.merchantBlocks).toEqual({ none: { merchantId: 'm1' } });
    expect(push.sendMulticast).toHaveBeenCalledTimes(1);
    expect(push.sendMulticast).toHaveBeenCalledWith(
      ['t1'],
      '2 nouveaux bons plans chez Shop',
      'Moins 30',
      undefined,
      { event: 'deals_digest', action: 'open_deal', dealId: 'd1' },
    );
    expect(prisma.campaignSentTracker.createMany).toHaveBeenCalledWith({
      data: [
        { clientId: 'c1', campaignId: 'deal_card_d1', channel: 'PUSH' },
        { clientId: 'c1', campaignId: 'deal_card_d2', channel: 'PUSH' },
      ],
      skipDuplicates: true,
    });
    // c2 has not heard of them yet: the deals come back on the next run.
    expect(prisma.deal.updateMany).not.toHaveBeenCalled();
  });

  it('on a later run tells only what each cardholder missed, then marks the deals', async () => {
    const { service, prisma, push } = make();
    prisma.deal.findMany.mockResolvedValue([DEAL, { ...DEAL, id: 'd2', title: 'Autre' }]);
    prisma.loyaltyCard.findMany.mockResolvedValue([holder('c1', 't1'), holder('c2', 't2')]);
    // c1 was told about both yesterday, c2 about d1 only.
    prisma.campaignSentTracker.findMany.mockResolvedValue([
      { clientId: 'c1', campaignId: 'deal_card_d1' },
      { clientId: 'c1', campaignId: 'deal_card_d2' },
      { clientId: 'c2', campaignId: 'deal_card_d1' },
    ]);
    prisma.$queryRaw.mockResolvedValue([{ client_id: 'c2' }]);

    await expect(service.notifyCardholders(new Date())).resolves.toBe(1);
    expect(prisma.$queryRaw.mock.calls[0]).toContainEqual(['c2']);
    expect(push.sendMulticast).toHaveBeenCalledWith(['t2'], 'Nouveau bon plan chez Shop', 'Autre', undefined, expect.objectContaining({ dealId: 'd2' }));
    expect(prisma.deal.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['d1', 'd2'] }, cardAlertSentAt: null },
      data: { cardAlertSentAt: expect.any(Date) },
    });
  });

  it('reminds only the saves this run marked', async () => {
    const { service, prisma, push } = make();
    prisma.deal.findMany.mockResolvedValue([DEAL]);
    prisma.dealSave.findMany.mockResolvedValue([holder('c1', 't1', 'en'), holder('c2', 't2', 'en')]);
    prisma.$queryRaw.mockResolvedValue([{ client_id: 'c2' }]);

    await expect(service.remindSaved(new Date())).resolves.toBe(1);
    expect(prisma.deal.findMany.mock.calls[0][0].where).toMatchObject({ status: 'ACTIVE', saves: { some: { remindedAt: null } } });
    expect(push.sendMulticast).toHaveBeenCalledWith(['t2'], 'A deal you saved ends soon', 'Shop: Moins 30', undefined, expect.objectContaining({ dealId: 'd1' }));
  });

  it('does nothing without a new deal or a saved deal ending', async () => {
    const { service, prisma, push } = make();
    await expect(service.notifyCardholders(new Date())).resolves.toBe(0);
    await expect(service.remindSaved(new Date())).resolves.toBe(0);
    expect(prisma.loyaltyCard.findMany).not.toHaveBeenCalled();
    expect(push.sendMulticast).not.toHaveBeenCalled();
  });
});
