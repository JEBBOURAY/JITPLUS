import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { EmailQuotaService } from './email-quota.service';
import { EventsGateway } from '../events';
import {
  MERCHANT_REPOSITORY,
  CLIENT_REPOSITORY,
  LOYALTY_CARD_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  CLIENT_NOTIFICATION_STATUS_REPOSITORY,
} from '../common/repositories';
import { EMAIL_BLAST_PROVIDER, PUSH_PROVIDER, SMS_PROVIDER } from '../common/interfaces';

const MERCHANT_ID = 'm1';
const BATCH = 1000;

const member = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  pushToken: null as string | null,
  notifPush: true,
  email: null as string | null,
  notifEmail: true,
  prenom: 'P',
  language: 'fr',
  telephone: null as string | null,
  notifWhatsapp: false,
  ...over,
});
const card = (c: ReturnType<typeof member>) => ({ clientId: c.id, client: c });

describe('NotificationsService', () => {
  let service: NotificationsService;
  const merchantRepo = { findUnique: jest.fn(), findUniqueOrThrow: jest.fn() };
  const clientRepo = { findMany: jest.fn(), updateMany: jest.fn() };
  const loyaltyCardRepo = { findMany: jest.fn() };
  const notificationRepo = { create: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() };
  const statusRepo = { createMany: jest.fn(), groupBy: jest.fn() };
  const push = { sendMulticast: jest.fn() };
  const blast = { sendBlast: jest.fn() };
  const sms = { sendWhatsAppMessage: jest.fn() };
  const emitter = { emit: jest.fn() };
  const gateway = { emitNotificationNew: jest.fn(), server: { to: jest.fn(() => emitter) } };
  const quota = { checkAndIncrementQuota: jest.fn() };
  const cache = { get: jest.fn(), set: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    cache.get.mockResolvedValue(null);
    notificationRepo.create.mockResolvedValue({ id: 'n1', title: 't', body: 'b', createdAt: new Date() });
    statusRepo.createMany.mockResolvedValue({ count: 0 });
    clientRepo.updateMany.mockResolvedValue({ count: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: MERCHANT_REPOSITORY, useValue: merchantRepo },
        { provide: CLIENT_REPOSITORY, useValue: clientRepo },
        { provide: LOYALTY_CARD_REPOSITORY, useValue: loyaltyCardRepo },
        { provide: NOTIFICATION_REPOSITORY, useValue: notificationRepo },
        { provide: CLIENT_NOTIFICATION_STATUS_REPOSITORY, useValue: statusRepo },
        { provide: PUSH_PROVIDER, useValue: push },
        { provide: EMAIL_BLAST_PROVIDER, useValue: blast },
        { provide: SMS_PROVIDER, useValue: sms },
        { provide: EmailQuotaService, useValue: quota },
        { provide: EventsGateway, useValue: gateway },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: CACHE_MANAGER, useValue: cache },
      ],
    }).compile();
    service = module.get(NotificationsService);
  });

  describe('merchant blasts page over the merchant cards, not the clients table', () => {
    it('sendToAll: every active member, keyset-paged by client id', async () => {
      const page1 = Array.from({ length: BATCH }, (_, i) => member(`c${String(i).padStart(4, '0')}`, i === 0 ? { pushToken: 'tok' } : {}));
      const page2 = [member('c9999', { pushToken: 'tok2', notifPush: false })];
      loyaltyCardRepo.findMany.mockResolvedValueOnce(page1.map(card)).mockResolvedValueOnce(page2.map(card));
      push.sendMulticast.mockResolvedValue({ successCount: 1, failureCount: 0, invalidTokens: [] });

      const res = await service.sendToAll(MERCHANT_ID, { title: 'Promo', body: 'Hello' });

      const [first, second] = loyaltyCardRepo.findMany.mock.calls.map((c) => c[0]);
      expect(first.where).toEqual({ merchantId: MERCHANT_ID, deactivatedAt: null });
      expect(first.orderBy).toEqual({ clientId: 'asc' });
      expect(first.take).toBe(BATCH);
      expect(second.where).toEqual({ merchantId: MERCHANT_ID, deactivatedAt: null, clientId: { gt: 'c0999' } });
      expect(clientRepo.findMany).not.toHaveBeenCalled();
      // Only push-enabled tokens are pushed, but every member gets the in-app row.
      expect(push.sendMulticast.mock.calls[0][0]).toEqual(['tok']);
      expect(res.recipientCount).toBe(BATCH + 1);
      expect(statusRepo.createMany).toHaveBeenCalledTimes(3); // 1001 rows in chunks of 500
    });

    it('sendEmailToAll keeps only members with an email who did not opt out', async () => {
      loyaltyCardRepo.findMany.mockResolvedValueOnce([
        card(member('a', { email: 'a@x.ma' })),
        card(member('b', { email: 'b@x.ma', notifEmail: false })),
        card(member('c', { email: null })),
        card(member('d', { email: '' })),
      ]);
      merchantRepo.findUniqueOrThrow.mockResolvedValue({ nom: 'Shop' });
      blast.sendBlast.mockResolvedValue({ total: 1, successCount: 1, failureCount: 0 });

      await service.sendEmailToAll(MERCHANT_ID, { subject: 'Promo', body: 'Hello' });

      expect(quota.checkAndIncrementQuota).toHaveBeenCalledWith(MERCHANT_ID, 1);
      expect(blast.sendBlast.mock.calls[0][0]).toEqual([{ clientId: 'a', email: 'a@x.ma', prenom: 'P', lang: 'fr' }]);
    });

    it('sendWhatsAppToAll keeps only opted-in members with a phone', async () => {
      loyaltyCardRepo.findMany.mockResolvedValueOnce([
        card(member('a', { telephone: '+212600000001', notifWhatsapp: true })),
        card(member('b', { telephone: '+212600000002', notifWhatsapp: false })),
        card(member('c', { telephone: null, notifWhatsapp: true })),
      ]);
      merchantRepo.findUniqueOrThrow.mockResolvedValue({ nom: 'Shop' });
      sms.sendWhatsAppMessage.mockResolvedValue(true);

      const res = await service.sendWhatsAppToAll(MERCHANT_ID, 'Hello');

      expect(sms.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
      expect(sms.sendWhatsAppMessage.mock.calls[0][0]).toBe('+212600000001');
      expect(res).toEqual({ recipientCount: 1, successCount: 1, failureCount: 0 });
    });
  });

  describe('sendPushToAllClients', () => {
    it('streams pages, chunks stale-token cleanup and returns the same totals', async () => {
      const page1 = Array.from({ length: BATCH }, (_, i) => ({ id: `c${i}`, pushToken: i < 600 ? `t${i}` : null }));
      const page2 = [{ id: 'z1', pushToken: 'tz' }, { id: 'z2', pushToken: null }];
      clientRepo.findMany.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
      push.sendMulticast
        .mockResolvedValueOnce({ successCount: 0, failureCount: 600, invalidTokens: page1.slice(0, 600).map((c) => c.pushToken) })
        .mockRejectedValueOnce(new Error('fcm down'));

      const res = await service.sendPushToAllClients('T', 'B');

      // 1002 clients, 601 tokens, 0 FCM successes: 401 delivered in-app only.
      expect(res).toEqual({ recipientCount: 1002, successCount: 401, failureCount: 601 });
      expect(notificationRepo.create).toHaveBeenCalledTimes(1);
      expect(notificationRepo.update).toHaveBeenCalledWith({
        where: { id: 'n1' },
        data: { recipientCount: 1002, successCount: 401, failureCount: 601 },
      });
      // Second page resumes after the last id of the first one.
      expect(clientRepo.findMany.mock.calls[1][0]).toMatchObject({ skip: 1, cursor: { id: 'c999' } });
      // 600 stale tokens -> 2 bounded IN lists.
      expect(clientRepo.updateMany).toHaveBeenCalledTimes(2);
      expect(clientRepo.updateMany.mock.calls[0][0].where.pushToken.in).toHaveLength(500);
      expect(clientRepo.updateMany.mock.calls[1][0].where.pushToken.in).toHaveLength(100);
      expect(statusRepo.createMany).toHaveBeenCalledTimes(3);
      expect(gateway.emitNotificationNew).toHaveBeenCalledTimes(1002);
    });

    it('creates nothing when no client is reachable', async () => {
      clientRepo.findMany.mockResolvedValueOnce([]);
      expect(await service.sendPushToAllClients('T', 'B')).toEqual({ recipientCount: 0, successCount: 0, failureCount: 0 });
      expect(notificationRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('getHistory', () => {
    it('uses the stored recipientCount and counts status rows only for rows that need it', async () => {
      const base = { merchantId: MERCHANT_ID, title: 't', body: 'b', successCount: 0, failureCount: 0, isBroadcast: true, audience: null, createdAt: new Date() };
      notificationRepo.findMany.mockResolvedValue([
        { ...base, id: 'push', channel: 'PUSH', recipientCount: 50 },
        { ...base, id: 'wa', channel: 'WHATSAPP', recipientCount: 7 },
        { ...base, id: 'mail', channel: 'EMAIL', recipientCount: 90 },
        { ...base, id: 'legacy', channel: null, recipientCount: 0 },
      ]);
      notificationRepo.count.mockResolvedValue(4);
      statusRepo.groupBy.mockImplementation(({ where }) =>
        Promise.resolve(
          where.isRead
            ? [{ notificationId: 'push', _count: 12 }]
            : [{ notificationId: 'legacy', _count: 3 }],
        ),
      );

      const res = await service.getHistory(MERCHANT_ID, 1, 20);

      expect(notificationRepo.findMany.mock.calls[0][0].include).toBeUndefined();
      const countCall = statusRepo.groupBy.mock.calls.find((c) => !c[0].where.isRead)![0];
      expect(countCall.where).toEqual({ notificationId: { in: ['mail', 'legacy'] } });
      expect(res.notifications.map((n) => [n.id, n.receivedCount, n.readCount])).toEqual([
        ['push', 50, 12],
        ['wa', 7, 0],
        ['mail', 0, 0],
        ['legacy', 3, 0],
      ]);
      expect(res.pagination).toEqual({ page: 1, limit: 20, total: 4, totalPages: 1 });
    });
  });
});
