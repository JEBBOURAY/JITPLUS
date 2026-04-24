import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ClientService } from './client.service';
import {
  CLIENT_REPOSITORY,
  LOYALTY_CARD_REPOSITORY,
  MERCHANT_REPOSITORY,
  NOTIFICATION_REPOSITORY,
  CLIENT_NOTIFICATION_STATUS_REPOSITORY,
  PROFILE_VIEW_REPOSITORY,
  TRANSACTION_REPOSITORY,
  TRANSACTION_RUNNER,
} from '../common/repositories';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

// ── Fixtures ────────────────────────────────────────────────────────────────

const CLIENT_ID = 'client-uuid';
const MERCHANT_ID = 'merchant-uuid';

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockPrisma = {
  clientMerchantBlock: {
    upsert: jest.fn(),
    deleteMany: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockMerchantRepo = {
  findFirst: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
};

const mockLoyaltyCardRepo = {
  findUnique: jest.fn(),
  update: jest.fn(),
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const noop = { findUnique: jest.fn(), findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn(), delete: jest.fn(), count: jest.fn() };

// ── Suite ───────────────────────────────────────────────────────────────────

describe('ClientService — block / unblock / filter', () => {
  let service: ClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientService,
        { provide: CLIENT_REPOSITORY, useValue: noop },
        { provide: LOYALTY_CARD_REPOSITORY, useValue: mockLoyaltyCardRepo },
        { provide: MERCHANT_REPOSITORY, useValue: mockMerchantRepo },
        { provide: NOTIFICATION_REPOSITORY, useValue: noop },
        { provide: CLIENT_NOTIFICATION_STATUS_REPOSITORY, useValue: noop },
        { provide: PROFILE_VIEW_REPOSITORY, useValue: noop },
        { provide: TRANSACTION_REPOSITORY, useValue: noop },
        { provide: TRANSACTION_RUNNER, useValue: { run: jest.fn() } },
        { provide: CACHE_MANAGER, useValue: mockCache },
        { provide: MailService, useValue: { sendContentReport: jest.fn() } },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ClientService>(ClientService);
    jest.clearAllMocks();
  });

  // ── blockMerchant ────────────────────────────────────────────────────────

  describe('blockMerchant()', () => {
    it('throws NotFoundException when merchant does not exist', async () => {
      mockMerchantRepo.findFirst.mockResolvedValue(null);

      await expect(service.blockMerchant(CLIENT_ID, MERCHANT_ID))
        .rejects.toThrow(NotFoundException);

      expect(mockPrisma.clientMerchantBlock.upsert).not.toHaveBeenCalled();
    });

    it('creates a block row idempotently and deactivates the loyalty card', async () => {
      mockMerchantRepo.findFirst.mockResolvedValue({ id: MERCHANT_ID });
      mockPrisma.clientMerchantBlock.upsert.mockResolvedValue({});
      mockLoyaltyCardRepo.findUnique.mockResolvedValue({ id: 'card-1', deactivatedAt: null });
      mockLoyaltyCardRepo.update.mockResolvedValue({});

      const result = await service.blockMerchant(CLIENT_ID, MERCHANT_ID);

      expect(result).toEqual({ success: true });
      expect(mockPrisma.clientMerchantBlock.upsert).toHaveBeenCalledWith({
        where: { clientId_merchantId: { clientId: CLIENT_ID, merchantId: MERCHANT_ID } },
        update: {},
        create: { clientId: CLIENT_ID, merchantId: MERCHANT_ID },
      });
      expect(mockLoyaltyCardRepo.update).toHaveBeenCalledWith({
        where: { id: 'card-1' },
        data: { deactivatedAt: expect.any(Date), points: 0 },
      });
      expect(mockCache.del).toHaveBeenCalledWith(`merchant:detail:${MERCHANT_ID}`);
    });

    it('still succeeds when loyalty card cleanup throws (best-effort)', async () => {
      mockMerchantRepo.findFirst.mockResolvedValue({ id: MERCHANT_ID });
      mockPrisma.clientMerchantBlock.upsert.mockResolvedValue({});
      mockLoyaltyCardRepo.findUnique.mockRejectedValue(new Error('db flake'));

      const result = await service.blockMerchant(CLIENT_ID, MERCHANT_ID);

      expect(result).toEqual({ success: true });
    });
  });

  // ── unblockMerchant ──────────────────────────────────────────────────────

  describe('unblockMerchant()', () => {
    it('deletes the block row and is idempotent', async () => {
      mockPrisma.clientMerchantBlock.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.unblockMerchant(CLIENT_ID, MERCHANT_ID);

      expect(result).toEqual({ success: true });
      expect(mockPrisma.clientMerchantBlock.deleteMany).toHaveBeenCalledWith({
        where: { clientId: CLIENT_ID, merchantId: MERCHANT_ID },
      });
    });
  });

  // ── getMerchantById hides blocked merchants ──────────────────────────────

  describe('getMerchantById()', () => {
    it('throws NotFoundException when the merchant is blocked by this client', async () => {
      mockPrisma.clientMerchantBlock.findUnique.mockResolvedValue({ id: 'block-1' });

      await expect(service.getMerchantById(MERCHANT_ID, CLIENT_ID))
        .rejects.toThrow(NotFoundException);

      // Should not fall through to cache or repo lookup
      expect(mockCache.get).not.toHaveBeenCalled();
      expect(mockMerchantRepo.findFirst).not.toHaveBeenCalled();
    });
  });

  // ── getMerchants filters blocked ─────────────────────────────────────────

  describe('getMerchants()', () => {
    const page = 1;
    const limit = 50;
    const sampleMerchants = [
      { id: 'm1', nom: 'A', stores: [] },
      { id: 'm2', nom: 'B', stores: [] },
      { id: 'm3', nom: 'C', stores: [] },
    ];

    it('returns the cached list unchanged when clientId is omitted', async () => {
      const cached = { merchants: sampleMerchants, pagination: { total: 3 } };
      mockCache.get.mockResolvedValue(cached);

      const result = await service.getMerchants(page, limit);

      expect(result).toBe(cached);
      expect(mockPrisma.clientMerchantBlock.findMany).not.toHaveBeenCalled();
    });

    it('filters out merchants blocked by the client', async () => {
      const cached = { merchants: sampleMerchants, pagination: { total: 3 } };
      mockCache.get.mockResolvedValue(cached);
      mockPrisma.clientMerchantBlock.findMany.mockResolvedValue([
        { merchantId: 'm2' },
      ]);

      const result = await service.getMerchants(page, limit, CLIENT_ID) as any;

      expect(result.merchants).toHaveLength(2);
      expect(result.merchants.map((m: any) => m.id)).toEqual(['m1', 'm3']);
      // Pagination is preserved (the filter runs post-cache)
      expect(result.pagination).toEqual(cached.pagination);
    });

    it('returns the cached list untouched when the client has no blocks', async () => {
      const cached = { merchants: sampleMerchants, pagination: { total: 3 } };
      mockCache.get.mockResolvedValue(cached);
      mockPrisma.clientMerchantBlock.findMany.mockResolvedValue([]);

      const result = await service.getMerchants(page, limit, CLIENT_ID);

      expect(result).toBe(cached);
    });
  });
});
