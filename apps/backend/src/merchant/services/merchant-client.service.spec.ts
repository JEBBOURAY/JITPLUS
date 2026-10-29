import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MerchantClientService } from './merchant-client.service';
import { ScanTicketService } from './scan-ticket.service';
import {
  CLIENT_REPOSITORY,
  LOYALTY_CARD_REPOSITORY,
  TRANSACTION_REPOSITORY,
  MERCHANT_REPOSITORY,
} from '../../common/repositories';
import { INACTIVE_CLIENT_DAYS, MS_PER_DAY } from '../../common/constants';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MERCHANT_ID = 'merchant-uuid-1';
const JOINED = new Date('2026-01-10');
const LAST_TX = new Date('2026-09-01');

const client = (id: string) => ({
  id,
  prenom: 'Sara',
  nom: 'Alaoui',
  email: `${id}@mail.com`,
  telephone: '0600000000',
  shareInfoMerchants: true,
  createdAt: JOINED,
});

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockClientRepo = { findMany: jest.fn(), count: jest.fn() };
const mockLoyaltyCardRepo = { findMany: jest.fn(), count: jest.fn() };
const mockTransactionRepo = { groupBy: jest.fn() };
const mockMerchantRepo = { findUnique: jest.fn() };

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('MerchantClientService.getClients', () => {
  let service: MerchantClientService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockMerchantRepo.findUnique.mockResolvedValue({ stampsForReward: 10, rewards: [{ cout: 8 }, { cout: 12 }] });
    mockTransactionRepo.groupBy.mockResolvedValue([
      { clientId: 'c1', _max: { createdAt: LAST_TX }, _count: 4 },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantClientService,
        { provide: CLIENT_REPOSITORY, useValue: mockClientRepo },
        { provide: LOYALTY_CARD_REPOSITORY, useValue: mockLoyaltyCardRepo },
        { provide: TRANSACTION_REPOSITORY, useValue: mockTransactionRepo },
        { provide: MERCHANT_REPOSITORY, useValue: mockMerchantRepo },
        { provide: ScanTicketService, useValue: {} },
      ],
    }).compile();

    service = module.get(MerchantClientService);
  });

  it('lists newest clients first by default and returns the reward threshold', async () => {
    mockClientRepo.findMany.mockResolvedValue([client('c1')]);
    mockClientRepo.count.mockResolvedValue(1);
    mockLoyaltyCardRepo.findMany.mockResolvedValue([{ clientId: 'c1', stamps: 6, createdAt: JOINED }]);

    const res = await service.getClients(MERCHANT_ID, undefined, 1, 30);

    expect(mockClientRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ createdAt: 'desc' }], skip: 0, take: 30 }),
    );
    expect(mockLoyaltyCardRepo.count).not.toHaveBeenCalled();
    expect(res.rewardThreshold).toBe(8);
    expect(res.pagination).toEqual({ page: 1, limit: 30, total: 1, totalPages: 1 });
    expect(res.clients[0]).toMatchObject({ id: 'c1', stamps: 6, totalTransactions: 4, lastVisit: LAST_TX });
  });

  it('"reward" view keeps only cards that reached the cheapest reward, richest first', async () => {
    mockLoyaltyCardRepo.findMany.mockResolvedValue([
      { clientId: 'c1', stamps: 9, createdAt: JOINED, client: client('c1') },
    ]);
    mockLoyaltyCardRepo.count.mockResolvedValue(1);

    const res = await service.getClients(MERCHANT_ID, 'sara', 2, 20, 'reward');

    const args = mockLoyaltyCardRepo.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ merchantId: MERCHANT_ID, deactivatedAt: null, stamps: { gte: 8 } });
    expect(args.where.client.OR).toHaveLength(4);
    expect(args.orderBy).toEqual([{ stamps: 'desc' }, { id: 'asc' }]);
    expect(args.skip).toBe(20);
    expect(mockClientRepo.findMany).not.toHaveBeenCalled();
    // Cards come with the page, so they are not fetched a second time.
    expect(mockLoyaltyCardRepo.findMany).toHaveBeenCalledTimes(1);
    expect(res.clients[0]).toMatchObject({ id: 'c1', stamps: 9 });
  });

  it('"inactive" view filters on the last visit date', async () => {
    mockLoyaltyCardRepo.findMany.mockResolvedValue([]);
    mockLoyaltyCardRepo.count.mockResolvedValue(0);
    const before = Date.now();

    const res = await service.getClients(MERCHANT_ID, undefined, 1, 20, 'inactive');

    const { where, orderBy } = mockLoyaltyCardRepo.findMany.mock.calls[0][0];
    const cutoff = (where.lastVisitAt.lt as Date).getTime();
    expect(cutoff).toBeLessThanOrEqual(before - INACTIVE_CLIENT_DAYS * MS_PER_DAY + 1000);
    expect(cutoff).toBeGreaterThanOrEqual(before - INACTIVE_CLIENT_DAYS * MS_PER_DAY - 1000);
    expect(where.stamps).toBeUndefined();
    expect(orderBy).toEqual([{ lastVisitAt: 'desc' }, { id: 'asc' }]);
    expect(mockTransactionRepo.groupBy).not.toHaveBeenCalled();
    expect(res).toEqual({
      clients: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      rewardThreshold: 8,
    });
  });

  it('"loyal" view sorts by stamps without a stamps filter', async () => {
    mockLoyaltyCardRepo.findMany.mockResolvedValue([]);
    mockLoyaltyCardRepo.count.mockResolvedValue(0);

    await service.getClients(MERCHANT_ID, undefined, 1, 20, 'loyal');

    const { where, orderBy } = mockLoyaltyCardRepo.findMany.mock.calls[0][0];
    expect(where.stamps).toBeUndefined();
    expect(where.lastVisitAt).toBeUndefined();
    expect(orderBy).toEqual([{ stamps: 'desc' }, { id: 'asc' }]);
  });
});

describe('MerchantClientService scan lookup and status', () => {
  const clientRepo = { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn() };
  const loyaltyCardRepo = { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() };
  const transactionRepo = { groupBy: jest.fn() };
  const merchantRepo = { findUnique: jest.fn() };
  const scanTickets = { issue: jest.fn(() => 'ticket-1'), verify: jest.fn(() => false) };
  let service: MerchantClientService;

  beforeEach(async () => {
    jest.clearAllMocks();
    scanTickets.verify.mockReturnValue(false);
    merchantRepo.findUnique.mockResolvedValue({ stampsForReward: 10, rewards: [] });
    transactionRepo.groupBy.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantClientService,
        { provide: CLIENT_REPOSITORY, useValue: clientRepo },
        { provide: LOYALTY_CARD_REPOSITORY, useValue: loyaltyCardRepo },
        { provide: TRANSACTION_REPOSITORY, useValue: transactionRepo },
        { provide: MERCHANT_REPOSITORY, useValue: merchantRepo },
        { provide: ScanTicketService, useValue: scanTickets },
      ],
    }).compile();
    service = module.get(MerchantClientService);
  });

  describe('getClientsForScan', () => {
    it('searches only active members of the merchant first', async () => {
      clientRepo.findMany.mockResolvedValue([client('c1')]);
      loyaltyCardRepo.findMany.mockResolvedValue([{ clientId: 'c1', stamps: 3, createdAt: JOINED, deactivatedAt: null }]);

      const res = await service.getClientsForScan(MERCHANT_ID, 'sara');

      const where = clientRepo.findMany.mock.calls[0][0].where;
      expect(where.AND[0]).toEqual({ loyaltyCards: { some: { merchantId: MERCHANT_ID, deactivatedAt: null } } });
      expect(clientRepo.findMany).toHaveBeenCalledTimes(1);
      expect(clientRepo.findUnique).not.toHaveBeenCalled();
      expect(res[0]).toMatchObject({ id: 'c1', nom: 'Alaoui', stamps: 3 });
      expect(res[0]).not.toHaveProperty('scanTicket');
    });

    it('never falls back to a global name, email or partial search', async () => {
      clientRepo.findMany.mockResolvedValue([]);

      for (const term of ['sara', 'sara@mail.com', '0612']) {
        expect(await service.getClientsForScan(MERCHANT_ID, term)).toEqual([]);
      }
      expect(clientRepo.findMany).toHaveBeenCalledTimes(3);
      expect(clientRepo.findUnique).not.toHaveBeenCalled();
    });

    it('matches a non-member only on the exact E.164 phone, masked and with a scan ticket', async () => {
      clientRepo.findMany.mockResolvedValue([]);
      clientRepo.findUnique.mockResolvedValue({ id: 'c9', prenom: 'sara', nom: 'alaoui', deletedAt: null });

      const res = await service.getClientsForScan(MERCHANT_ID, '0612345678');

      expect(clientRepo.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { telephone: '+212612345678' } }),
      );
      expect(scanTickets.issue).toHaveBeenCalledWith('c9', MERCHANT_ID);
      expect(res).toEqual([
        expect.objectContaining({ id: 'c9', prenom: 'S.', nom: 'A.', email: null, telephone: null, scanTicket: 'ticket-1' }),
      ]);
    });

    it('ignores deleted accounts in the phone fallback', async () => {
      clientRepo.findMany.mockResolvedValue([]);
      clientRepo.findUnique.mockResolvedValue({ id: 'c9', prenom: 'x', nom: 'y', deletedAt: new Date() });

      expect(await service.getClientsForScan(MERCHANT_ID, '+212612345678')).toEqual([]);
      expect(scanTickets.issue).not.toHaveBeenCalled();
    });
  });

  describe('getClientStatus', () => {
    const fullClient = {
      id: 'c1', nom: 'Alaoui', email: 'c1@mail.com', telephone: '+212600000000',
      shareInfoMerchants: true, dateNaissance: null, deletedAt: null,
    };

    it('returns the status of an active member without writing anything', async () => {
      clientRepo.findUnique.mockResolvedValue(fullClient);
      loyaltyCardRepo.findUnique.mockResolvedValue({ id: 'lc1', stamps: 4, createdAt: JOINED, deactivatedAt: null });

      const res = await service.getClientStatus('c1', MERCHANT_ID);

      expect(res).toMatchObject({ id: 'c1', nom: 'Alaoui', email: 'c1@mail.com', stamps: 4 });
      expect(loyaltyCardRepo.create).not.toHaveBeenCalled();
      expect(loyaltyCardRepo.update).not.toHaveBeenCalled();
    });

    it('refuses a non-member without a valid scan ticket (no card is created)', async () => {
      clientRepo.findUnique.mockResolvedValue(fullClient);
      loyaltyCardRepo.findUnique.mockResolvedValue(null);

      await expect(service.getClientStatus('c1', MERCHANT_ID)).rejects.toThrow(NotFoundException);
      expect(loyaltyCardRepo.create).not.toHaveBeenCalled();
    });

    it('refuses a client who left the programme without a ticket and does not reactivate the card', async () => {
      clientRepo.findUnique.mockResolvedValue(fullClient);
      loyaltyCardRepo.findUnique.mockResolvedValue({ id: 'lc1', stamps: 0, createdAt: JOINED, deactivatedAt: new Date() });

      await expect(service.getClientStatus('c1', MERCHANT_ID, 'bad')).rejects.toThrow(NotFoundException);
      expect(scanTickets.verify).toHaveBeenCalledWith('bad', 'c1', MERCHANT_ID);
      expect(loyaltyCardRepo.update).not.toHaveBeenCalled();
    });

    it('previews a non-member with a valid ticket, with masked details', async () => {
      clientRepo.findUnique.mockResolvedValue(fullClient);
      loyaltyCardRepo.findUnique.mockResolvedValue(null);
      scanTickets.verify.mockReturnValue(true);

      const res = await service.getClientStatus('c1', MERCHANT_ID, 'ticket-1');

      expect(res).toMatchObject({ id: 'c1', nom: 'A.', email: null, telephone: null, stamps: 0 });
      expect(loyaltyCardRepo.create).not.toHaveBeenCalled();
    });

    it('rejects deleted clients', async () => {
      clientRepo.findUnique.mockResolvedValue({ ...fullClient, deletedAt: new Date() });
      loyaltyCardRepo.findUnique.mockResolvedValue({ id: 'lc1', stamps: 4, createdAt: JOINED, deactivatedAt: null });

      await expect(service.getClientStatus('c1', MERCHANT_ID)).rejects.toThrow(NotFoundException);
    });
  });
});
