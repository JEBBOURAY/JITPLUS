import { MerchantInboxService } from './merchant-inbox.service';

const MERCHANT_ID = 'm-1';
const CREATED = new Date('2026-01-01T00:00:00Z');

function makeRepos() {
  const inboxRepo = {
    create: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    findFirst: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const notificationRepo = {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    findFirst: jest.fn().mockResolvedValue(null),
  };
  const readRepo = {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: jest.fn().mockResolvedValue({}),
  };
  const merchantRepo = {
    findUnique: jest.fn().mockResolvedValue({ createdAt: CREATED }),
  };
  const service = new MerchantInboxService(
    inboxRepo as never,
    notificationRepo as never,
    readRepo as never,
    merchantRepo as never,
  );
  return { service, inboxRepo, notificationRepo, readRepo };
}

describe('MerchantInboxService', () => {
  it('record() stores the entry and never throws on DB failure', async () => {
    const { service, inboxRepo } = makeRepos();
    await service.record(MERCHANT_ID, { category: 'PLAN', title: 'T', body: 'B', action: 'open_plan' });
    expect(inboxRepo.create).toHaveBeenCalledWith({
      data: { merchantId: MERCHANT_ID, category: 'PLAN', title: 'T', body: 'B', action: 'open_plan' },
    });

    inboxRepo.create.mockRejectedValueOnce(new Error('db down'));
    await expect(service.record(MERCHANT_ID, { category: 'TIP', title: 'T', body: 'B' })).resolves.toBeUndefined();
  });

  it('list() merges broadcasts and personal items newest first, with read state', async () => {
    const { service, inboxRepo, notificationRepo, readRepo } = makeRepos();
    notificationRepo.findMany.mockResolvedValue([
      { id: 'a1', title: 'Admin', body: 'x', channel: 'PUSH', createdAt: new Date('2026-03-02T10:00:00Z') },
    ]);
    notificationRepo.count.mockResolvedValue(1);
    inboxRepo.findMany.mockResolvedValue([
      { id: 'p1', title: 'Plan', body: 'y', category: 'PLAN', action: 'open_plan', readAt: null, createdAt: new Date('2026-03-03T10:00:00Z') },
      { id: 'p2', title: 'Tip', body: 'z', category: 'TIP', action: null, readAt: new Date(), createdAt: new Date('2026-03-01T10:00:00Z') },
    ]);
    inboxRepo.count.mockResolvedValue(2);
    readRepo.findMany.mockResolvedValue([{ notificationId: 'a1' }]);

    const res = await service.list(MERCHANT_ID, 1, 20);

    expect(res.notifications.map((n) => n.id)).toEqual(['p1', 'a1', 'p2']);
    expect(res.notifications[0]).toMatchObject({ category: 'PLAN', action: 'open_plan', isRead: false, channel: null });
    expect(res.notifications[1]).toMatchObject({ category: 'ADMIN', action: null, isRead: true, channel: 'PUSH' });
    expect(res.notifications[2].isRead).toBe(true);
    expect(res.pagination.total).toBe(3);
  });

  it('list() pages through the merged feed', async () => {
    const { service, inboxRepo } = makeRepos();
    const items = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`, title: 't', body: 'b', category: 'TIP', action: null, readAt: null,
      createdAt: new Date(Date.UTC(2026, 0, 10 - i)),
    }));
    inboxRepo.findMany.mockResolvedValue(items);
    inboxRepo.count.mockResolvedValue(5);

    const res = await service.list(MERCHANT_ID, 2, 2);
    expect(res.notifications.map((n) => n.id)).toEqual(['p2', 'p3']);
    expect(inboxRepo.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 4 }));
  });

  it('countUnread() adds unread broadcasts and unread personal items', async () => {
    const { service, inboxRepo, notificationRepo, readRepo } = makeRepos();
    notificationRepo.count.mockResolvedValue(4);
    readRepo.count.mockResolvedValue(3);
    inboxRepo.count.mockResolvedValue(2);
    await expect(service.countUnread(MERCHANT_ID)).resolves.toBe(3);
    expect(inboxRepo.count).toHaveBeenCalledWith({ where: { merchantId: MERCHANT_ID, readAt: null } });
  });

  it('markAllRead() marks both sources', async () => {
    const { service, inboxRepo, notificationRepo, readRepo } = makeRepos();
    notificationRepo.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
    readRepo.findMany.mockResolvedValue([{ notificationId: 'a1' }]);

    await service.markAllRead(MERCHANT_ID);

    expect(readRepo.createMany).toHaveBeenCalledWith({
      data: [{ merchantId: MERCHANT_ID, notificationId: 'a2' }],
      skipDuplicates: true,
    });
    expect(inboxRepo.updateMany).toHaveBeenCalledWith({
      where: { merchantId: MERCHANT_ID, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it('markRead() on a personal item only touches the inbox', async () => {
    const { service, inboxRepo, readRepo } = makeRepos();
    inboxRepo.findFirst.mockResolvedValue({ readAt: null });
    await service.markRead(MERCHANT_ID, 'p1');
    expect(inboxRepo.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', merchantId: MERCHANT_ID, readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect(readRepo.upsert).not.toHaveBeenCalled();
  });

  it('markRead() on a broadcast stores a read receipt; unknown ids are ignored', async () => {
    const { service, notificationRepo, readRepo } = makeRepos();
    notificationRepo.findFirst.mockResolvedValueOnce({ id: 'a1' });
    await service.markRead(MERCHANT_ID, 'a1');
    expect(readRepo.upsert).toHaveBeenCalledTimes(1);

    await service.markRead(MERCHANT_ID, 'unknown');
    expect(readRepo.upsert).toHaveBeenCalledTimes(1);
  });
});
