import { Prisma } from '@prisma/client';
import { MerchantNotifierService } from './merchant-notifier.service';
import { isCategoryEnabled, parseNotifPrefs } from './merchant-notif-policy';

// Wednesday 2026-11-04 10:00 UTC = 11:00 Maroc (outside quiet hours)
const DAYTIME = new Date('2026-11-04T10:00:00Z');
// 23:00 Maroc
const NIGHT = new Date('2026-11-04T22:00:00Z');

function setup() {
  const merchantRepo = { updateMany: jest.fn().mockResolvedValue({ count: 1 }) };
  const inboxRepo = { findMany: jest.fn().mockResolvedValue([]) };
  const trackerRepo = {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({}),
  };
  const push = { sendToMerchant: jest.fn().mockResolvedValue({ invalidToken: false }), sendMulticast: jest.fn() };
  const inbox = { record: jest.fn().mockResolvedValue('inbox-1') };
  const service = new MerchantNotifierService(
    merchantRepo as never,
    inboxRepo as never,
    trackerRepo as never,
    push as never,
    inbox as never,
  );
  return { service, merchantRepo, inboxRepo, trackerRepo, push, inbox };
}

const target = { id: 'm1', pushToken: 'ExponentPushToken[x]', notifPush: true, notifPrefs: null };

describe('notif prefs', () => {
  it('treats anything but an explicit false as ON', () => {
    expect(parseNotifPrefs(null)).toEqual({ news: true, tips: true, reminders: true, reports: true });
    expect(parseNotifPrefs({ tips: false, news: 'x' })).toEqual({ news: true, tips: false, reminders: true, reports: true });
  });

  it('never lets status / plan / security be switched off', () => {
    const allOff = { news: false, tips: false, reminders: false, reports: false };
    expect(isCategoryEnabled(allOff, 'PLAN')).toBe(true);
    expect(isCategoryEnabled(allOff, 'STATUS')).toBe(true);
    expect(isCategoryEnabled(allOff, 'SECURITY')).toBe(true);
    expect(isCategoryEnabled(allOff, 'TIP')).toBe(false);
    expect(isCategoryEnabled(allOff, 'OFFER')).toBe(false);
  });
});

describe('MerchantNotifierService', () => {
  it('records, pushes on the category channel with inboxId, and marks the campaign', async () => {
    const { service, push, inbox, trackerRepo } = setup();
    const r = await service.notify(target, {
      category: 'TIP', title: 'T', body: 'B', action: 'open_deals', event: 'merchant_tip', campaignId: 'c1',
    }, DAYTIME);
    expect(r).toBe('sent');
    expect(inbox.record).toHaveBeenCalledWith('m1', { category: 'TIP', title: 'T', body: 'B', action: 'open_deals' });
    expect(push.sendToMerchant).toHaveBeenCalledWith(
      target.pushToken, 'T', 'B',
      { category: 'TIP', event: 'merchant_tip', action: 'open_deals', inboxId: 'inbox-1' },
      'jitpro-tips',
    );
    expect(trackerRepo.create).toHaveBeenCalledWith({ data: { merchantId: 'm1', campaignId: 'c1', channel: 'PUSH' } });
  });

  it('skips an already delivered campaign', async () => {
    const { service, trackerRepo, push } = setup();
    trackerRepo.findUnique.mockResolvedValue({ id: 'x' });
    await expect(service.notify(target, { category: 'PLAN', title: 'T', body: 'B', campaignId: 'c1' }, DAYTIME)).resolves.toBe('duplicate');
    expect(push.sendToMerchant).not.toHaveBeenCalled();
  });

  it('lets only one of two concurrent instances deliver the same campaign', async () => {
    const { service, trackerRepo, push, inbox } = setup();
    // Both instances pass the read check; the unique index rejects the second claim.
    trackerRepo.create
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }));
    const n = { category: 'PLAN' as const, title: 'T', body: 'B', campaignId: 'c1' };
    const results = await Promise.all([service.notify(target, n, DAYTIME), service.notify(target, n, DAYTIME)]);
    expect(results.sort()).toEqual(['duplicate', 'sent']);
    expect(inbox.record).toHaveBeenCalledTimes(1);
    expect(push.sendToMerchant).toHaveBeenCalledTimes(1);
  });

  it('does not burn the campaign when the push is skipped for quiet hours', async () => {
    const { service, trackerRepo } = setup();
    await expect(service.notify(target, { category: 'TIP', title: 'T', body: 'B', campaignId: 'c1' }, NIGHT)).resolves.toBe('quiet_hours');
    expect(trackerRepo.create).not.toHaveBeenCalled();
  });

  it('respects the per-category opt-out', async () => {
    const { service, inbox } = setup();
    const r = await service.notify({ ...target, notifPrefs: { reminders: false } }, { category: 'REMINDER', title: 'T', body: 'B' }, DAYTIME);
    expect(r).toBe('opted_out');
    expect(inbox.record).not.toHaveBeenCalled();
  });

  it('holds marketing during quiet hours but not plan alerts', async () => {
    const { service } = setup();
    await expect(service.notify(target, { category: 'NEWS', title: 'T', body: 'B' }, NIGHT)).resolves.toBe('quiet_hours');
    await expect(service.notify(target, { category: 'PLAN', title: 'T', body: 'B' }, NIGHT)).resolves.toBe('sent');
  });

  it('caps marketing at 1 per day and 3 per week, unless bypassed', async () => {
    const { service, inboxRepo } = setup();
    const hoursAgo = (h: number) => ({ createdAt: new Date(DAYTIME.getTime() - h * 3_600_000) });

    inboxRepo.findMany.mockResolvedValueOnce([hoursAgo(2)]);
    await expect(service.notify(target, { category: 'TIP', title: 'T', body: 'B' }, DAYTIME)).resolves.toBe('capped');

    inboxRepo.findMany.mockResolvedValueOnce([hoursAgo(30), hoursAgo(50), hoursAgo(80)]);
    await expect(service.notify(target, { category: 'OFFER', title: 'T', body: 'B' }, DAYTIME)).resolves.toBe('capped');

    inboxRepo.findMany.mockResolvedValueOnce([hoursAgo(30), hoursAgo(50)]);
    await expect(service.notify(target, { category: 'OFFER', title: 'T', body: 'B' }, DAYTIME)).resolves.toBe('sent');
    expect(inboxRepo.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ take: 3, orderBy: { createdAt: 'desc' } }));

    inboxRepo.findMany.mockResolvedValue([hoursAgo(1), hoursAgo(2), hoursAgo(3)]);
    await expect(service.notify(target, { category: 'NEWS', title: 'T', body: 'B', bypassCap: true }, DAYTIME)).resolves.toBe('sent');
    await expect(service.notify(target, { category: 'STATUS', title: 'T', body: 'B' }, DAYTIME)).resolves.toBe('sent');
  });

  it('keeps transactional items in the inbox without a device, drops marketing ones', async () => {
    const { service, inbox, push } = setup();
    const noDevice = { ...target, pushToken: null };
    await expect(service.notify(noDevice, { category: 'PLAN', title: 'T', body: 'B' }, DAYTIME)).resolves.toBe('inbox_only');
    await expect(service.notify(noDevice, { category: 'TIP', title: 'T', body: 'B' }, DAYTIME)).resolves.toBe('no_device');
    expect(inbox.record).toHaveBeenCalledTimes(1);
    expect(push.sendToMerchant).not.toHaveBeenCalled();
  });

  it('master switch off silences everything but security', async () => {
    const { service, push } = setup();
    const muted = { ...target, notifPush: false };
    await expect(service.notify(muted, { category: 'PLAN', title: 'T', body: 'B' }, DAYTIME)).resolves.toBe('inbox_only');
    await expect(service.notify(muted, { category: 'SECURITY', title: 'T', body: 'B' }, DAYTIME)).resolves.toBe('sent');
    expect(push.sendToMerchant).toHaveBeenCalledTimes(1);
  });

  it('clears a stale token', async () => {
    const { service, push, merchantRepo } = setup();
    push.sendToMerchant.mockResolvedValue({ invalidToken: true });
    await expect(service.notify(target, { category: 'PLAN', title: 'T', body: 'B' }, DAYTIME)).resolves.toBe('stale_token');
    expect(merchantRepo.updateMany).toHaveBeenCalledWith({
      where: { id: 'm1', pushToken: target.pushToken },
      data: { pushToken: null },
    });
  });

  it('never throws', async () => {
    const { service, inbox } = setup();
    inbox.record.mockRejectedValue(new Error('db down'));
    await expect(service.notify(target, { category: 'PLAN', title: 'T', body: 'B' }, DAYTIME)).resolves.toBe('error');
  });
});
