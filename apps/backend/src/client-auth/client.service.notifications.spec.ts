import { Test, TestingModule } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Prisma } from '@prisma/client';
import { ClientService } from './client.service';
import {
  CLIENT_REPOSITORY,
  LOYALTY_CARD_REPOSITORY,
  MERCHANT_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  CLIENT_NOTIFICATION_STATUS_REPOSITORY,
  PROFILE_VIEW_REPOSITORY,
  CLIENT_MERCHANT_BLOCK_REPOSITORY,
  TRANSACTION_RUNNER,
  RAW_QUERY_RUNNER,
} from '../common/repositories';
import { MailService } from '../mail/mail.service';
import { ClientClaimService } from '../merchant/services/client-claim.service';
import { DealsClientService } from '../deals/deals-client.service';
import { DEAL_DIGEST_AUDIENCE } from '../deals/deal-limits';
import { EMAIL_LOGO_JITPLUS } from '../common/constants';

const CLIENT_ID = 'client-uuid';

/** Normalised SQL text of the n-th raw query (whitespace collapsed). */
const sqlOf = (call: unknown[]) => (call[0] as Prisma.Sql).sql.replace(/\s+/g, ' ');
const valuesOf = (call: unknown[]) => (call[0] as Prisma.Sql).values;

describe('ClientService — notification feed', () => {
  let service: ClientService;
  const rawQuery = { queryRaw: jest.fn(), executeRaw: jest.fn() };
  const notificationRepo = { findMany: jest.fn(), count: jest.fn() };
  const statusRepo = { findMany: jest.fn(), count: jest.fn(), updateMany: jest.fn(), createMany: jest.fn(), upsert: jest.fn() };
  const loyaltyCardRepo = { findMany: jest.fn() };
  const cache = { get: jest.fn(), set: jest.fn(), del: jest.fn() };
  const txRunner = { run: jest.fn(), batch: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientService,
        { provide: CLIENT_REPOSITORY, useValue: {} },
        { provide: LOYALTY_CARD_REPOSITORY, useValue: loyaltyCardRepo },
        { provide: MERCHANT_REPOSITORY, useValue: {} },
        { provide: NOTIFICATION_REPOSITORY, useValue: notificationRepo },
        { provide: CLIENT_NOTIFICATION_STATUS_REPOSITORY, useValue: statusRepo },
        { provide: PROFILE_VIEW_REPOSITORY, useValue: {} },
        { provide: CLIENT_MERCHANT_BLOCK_REPOSITORY, useValue: {} },
        { provide: TRANSACTION_RUNNER, useValue: txRunner },
        { provide: RAW_QUERY_RUNNER, useValue: rawQuery },
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: MailService, useValue: {} },
        { provide: ClientClaimService, useValue: {} },
        { provide: DealsClientService, useValue: {} },
      ],
    }).compile();
    service = module.get(ClientService);
  });

  /** Visibility rules every feed query must encode. */
  const expectVisibilityRules = (sql: string, values: unknown[], withDigests: boolean) => {
    // Broadcast branch: per card of the client, broadcasts since the card was created.
    expect(sql).toContain('FROM loyalty_cards c JOIN notifications n ON n.merchant_id = c.merchant_id AND n.is_broadcast = true AND n.created_at >= c.created_at');
    // Personal branch: driven by the client's own status rows, same card window.
    expect(sql).toContain('FROM client_notification_statuses s JOIN notifications n ON n.id = s.notification_id WHERE s.client_id =');
    expect(sql).toContain('c2.merchant_id = n.merchant_id AND n.created_at >= c2.created_at');
    // In-app feed only shows PUSH (or legacy NULL channel) merchant notifications.
    expect(sql).toContain("(n.channel = 'PUSH' OR n.channel IS NULL)");
    expect(sql).toContain('UNION');
    expect(values).toContain(CLIENT_ID);
    if (withDigests) {
      expect(sql).toContain('n.audience = ? OR');
      expect(values).toContain(DEAL_DIGEST_AUDIENCE);
    } else {
      expect(sql).not.toContain('n.audience');
      expect(values).not.toContain(DEAL_DIGEST_AUDIENCE);
    }
  };

  describe('getNotifications', () => {
    it('pages in SQL (newest first, dismissed excluded) and keeps that order in the response', async () => {
      const d1 = new Date('2026-10-02');
      const d2 = new Date('2026-10-01');
      rawQuery.queryRaw.mockResolvedValue([
        { id: 'n-new', total: 12 },
        { id: 'n-old', total: 12 },
      ]);
      // Prisma returns rows in arbitrary order: the response must follow the SQL page order.
      notificationRepo.findMany.mockResolvedValue([
        { id: 'n-old', title: 'B', body: 'b', createdAt: d2, audience: DEAL_DIGEST_AUDIENCE, merchant: null, clientStatuses: [] },
        {
          id: 'n-new', title: 'A', body: 'a', createdAt: d1, audience: null,
          merchant: { id: 'm1', nom: 'Café', categorie: 'CAFE', logoUrl: 'https://x/logo.png' },
          clientStatuses: [{ isRead: true, readAt: d1 }],
        },
      ]);

      const res = await service.getNotifications(CLIENT_ID, 2, 10);

      const call = rawQuery.queryRaw.mock.calls[0];
      const sql = sqlOf(call);
      expectVisibilityRules(sql, valuesOf(call), true);
      expect(sql).toContain('d.is_dismissed = true');
      expect(sql).toContain('ORDER BY l.created_at DESC, l.id DESC');
      expect(valuesOf(call)).toEqual(expect.arrayContaining([10, 10])); // limit 10, offset (2-1)*10

      expect(notificationRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['n-new', 'n-old'] } } }),
      );
      expect(notificationRepo.count).not.toHaveBeenCalled();
      expect(res.notifications.map((n) => n.id)).toEqual(['n-new', 'n-old']);
      expect(res.notifications[0]).toEqual({
        id: 'n-new', title: 'A', body: 'a', type: 'promo',
        merchantName: 'Café', merchantCategory: 'CAFE', merchantLogoUrl: 'https://x/logo.png',
        isRead: true, readAt: d1, createdAt: d1,
      });
      expect(res.notifications[1]).toMatchObject({
        type: 'deals_digest', merchantName: null, merchantLogoUrl: EMAIL_LOGO_JITPLUS, isRead: false, readAt: null,
      });
      expect(res.pagination).toEqual({ page: 2, limit: 10, total: 12, totalPages: 2 });
    });

    it('returns the total even when the page is past the end', async () => {
      rawQuery.queryRaw.mockResolvedValue([{ id: null, total: 3 }]);

      const res = await service.getNotifications(CLIENT_ID, 5, 30);

      expect(notificationRepo.findMany).not.toHaveBeenCalled();
      expect(res).toEqual({ notifications: [], pagination: { page: 5, limit: 30, total: 3, totalPages: 1 } });
    });
  });

  describe('getUnreadCount', () => {
    it('counts visible notifications neither read nor dismissed, and caches it', async () => {
      cache.get.mockResolvedValue(undefined);
      rawQuery.queryRaw.mockResolvedValue([{ unread: 4 }]);

      const res = await service.getUnreadCount(CLIENT_ID);

      const call = rawQuery.queryRaw.mock.calls[0];
      const sql = sqlOf(call);
      expectVisibilityRules(sql, valuesOf(call), true);
      expect(sql).toContain('(s.is_read = true OR s.is_dismissed = true)');
      expect(res).toEqual({ unreadCount: 4 });
      expect(cache.set).toHaveBeenCalledWith(`client:unread:${CLIENT_ID}`, { unreadCount: 4 }, expect.any(Number));
    });

    it('serves the cached value without querying', async () => {
      cache.get.mockResolvedValue({ unreadCount: 2 });
      expect(await service.getUnreadCount(CLIENT_ID)).toEqual({ unreadCount: 2 });
      expect(rawQuery.queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('markAllAsRead / dismissAllNotifications', () => {
    it('marks all as read in one set-based statement (no id list), digests excluded', async () => {
      rawQuery.queryRaw.mockResolvedValue([{ count: 7 }]);

      const res = await service.markAllAsRead(CLIENT_ID);

      const call = rawQuery.queryRaw.mock.calls[0];
      const sql = sqlOf(call);
      expectVisibilityRules(sql, valuesOf(call), false);
      expect(sql).toContain('UPDATE client_notification_statuses s SET is_read = true, read_at =');
      expect(sql).toContain('ON CONFLICT (client_id, notification_id) DO NOTHING');
      expect(sql).not.toContain('is_dismissed = true');
      expect(notificationRepo.findMany).not.toHaveBeenCalled();
      expect(txRunner.batch).not.toHaveBeenCalled();
      expect(res).toEqual({ success: true, count: 7 });
      expect(cache.del).toHaveBeenCalledWith(`client:unread:${CLIENT_ID}`);
    });

    it('dismisses all (new rows created read + dismissed) in one statement', async () => {
      rawQuery.queryRaw.mockResolvedValue([{ count: 3 }]);

      const res = await service.dismissAllNotifications(CLIENT_ID);

      const call = rawQuery.queryRaw.mock.calls[0];
      const sql = sqlOf(call);
      expectVisibilityRules(sql, valuesOf(call), false);
      expect(sql).toContain('SET is_dismissed = true, dismissed_at =');
      expect(sql).toContain('(id, client_id, notification_id, is_read, read_at, is_dismissed, dismissed_at)');
      expect(res).toEqual({ success: true, count: 3 });
      expect(cache.del).toHaveBeenCalledWith(`client:unread:${CLIENT_ID}`);
    });

    it('returns count 0 without touching the cache when nothing is targeted', async () => {
      rawQuery.queryRaw.mockResolvedValue([{ count: 0 }]);
      expect(await service.markAllAsRead(CLIENT_ID)).toEqual({ success: true, count: 0 });
      expect(await service.dismissAllNotifications(CLIENT_ID)).toEqual({ success: true, count: 0 });
      expect(cache.del).not.toHaveBeenCalled();
    });
  });
});
