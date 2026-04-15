import { Test, TestingModule } from '@nestjs/testing';
import { MerchantTransactionService } from './merchant-transaction.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { MerchantPlanService } from './merchant-plan.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EventsGateway } from '../../events';
import {
  CLIENT_REPOSITORY,
  MERCHANT_REPOSITORY,
  REWARD_REPOSITORY,
  LOYALTY_CARD_REPOSITORY,
  TRANSACTION_REPOSITORY,
  TRANSACTION_RUNNER,
} from '../../common/repositories';
import { AuditLogService } from '../../admin/audit-log.service';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockClient = { id: 'client-uuid-1' };

const mockMerchant = {
  id: 'merchant-uuid-1',
  nom: 'Test Commerce',
  pointsRate: 10,
  pointsRules: { pointsPerDirham: 10, minimumPurchase: 5 },
  loyaltyType: 'POINTS',
  conversionRate: 10,
  stampsForReward: 10,
  activeRewardId: null,
};

const mockLoyaltyCard = {
  id: 'card-uuid-1',
  clientId: 'client-uuid-1',
  merchantId: 'merchant-uuid-1',
  points: 100,
};

const mockReward = {
  id: 'reward-uuid-1',
  cout: 50,
  titre: 'Café gratuit',
};

const mockTransaction = {
  id: 'tx-uuid-1',
  clientId: 'client-uuid-1',
  merchantId: 'merchant-uuid-1',
  type: 'EARN_POINTS',
  points: 10,
  amount: 100,
  status: 'ACTIVE',
  createdAt: new Date(),
};

// ── Prisma mock that simulates $transaction ─────────────────────────────────

const createPrismaMock = () => {
  const clientMock = {
    loyaltyCard: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    transaction: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    reward: {
      findFirst: jest.fn(),
    },
  };

  // Simulate Prisma's $transaction by calling the callback with clientMock
  const prismaTransactionFn = jest.fn().mockImplementation(
    async (fn: (prisma: typeof clientMock) => Promise<unknown>) => fn(clientMock),
  );

  return {
    $transaction: prismaTransactionFn,
    client: { findUnique: jest.fn() },
    merchant: { findUnique: jest.fn() },
    reward: { findFirst: jest.fn() },
    loyaltyCard: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    transaction: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    _txClient: clientMock,
  };
};

let mockPrisma: ReturnType<typeof createPrismaMock>;

const mockNotifications = {
  sendToClient: jest.fn().mockResolvedValue(undefined),
};

const mockPlanService = {
  assertCanAddClient: jest.fn().mockResolvedValue(undefined),
  isPremium: jest.fn().mockResolvedValue(true),
};

const mockEventsGateway = {
  server: { emit: jest.fn() },
  notifyMerchant: jest.fn(),
  notifyClient: jest.fn(),
  emitPointsUpdated: jest.fn(),
  emitNotificationNew: jest.fn(),
  emitTransactionRecorded: jest.fn(),
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('MerchantTransactionService', () => {
  let service: MerchantTransactionService;

  beforeEach(async () => {
    mockPrisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantTransactionService,
        { provide: CLIENT_REPOSITORY, useValue: mockPrisma.client },
        { provide: MERCHANT_REPOSITORY, useValue: mockPrisma.merchant },
        { provide: REWARD_REPOSITORY, useValue: mockPrisma.reward },
        { provide: LOYALTY_CARD_REPOSITORY, useValue: mockPrisma.loyaltyCard },
        { provide: TRANSACTION_REPOSITORY, useValue: mockPrisma.transaction },
        { provide: TRANSACTION_RUNNER, useValue: { run: mockPrisma.$transaction } },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: EventsGateway, useValue: mockEventsGateway },
        { provide: MerchantPlanService, useValue: mockPlanService },
        { provide: AuditLogService, useValue: { log: jest.fn() } },

      ],
    }).compile();

    service = module.get<MerchantTransactionService>(MerchantTransactionService);
    jest.clearAllMocks();
  });

  // ── createTransaction EARN_POINTS ──────────────────────────────────────────

  describe('createTransaction() — EARN_POINTS', () => {
    beforeEach(() => {
      mockPrisma.client.findUnique.mockResolvedValue(mockClient);
      mockPrisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      mockPrisma._txClient.loyaltyCard.findUnique.mockResolvedValue(mockLoyaltyCard);
      mockPrisma._txClient.transaction.create.mockResolvedValue(mockTransaction);
      mockPrisma._txClient.loyaltyCard.update.mockResolvedValue({ ...mockLoyaltyCard, points: 110 });
    });

    it('creates a transaction and returns it', async () => {
      const result = await service.createTransaction(
        'client-uuid-1', 'merchant-uuid-1',
        'EARN_POINTS', 100, 10,
      );

      expect(result).toEqual(mockTransaction);
      expect(mockPrisma._txClient.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'EARN_POINTS', points: 10, amount: 100 }),
        }),
      );
    });

    it('adds points to the loyalty card', async () => {
      await service.createTransaction(
        'client-uuid-1', 'merchant-uuid-1',
        'EARN_POINTS', 100, 10,
      );

      expect(mockPrisma._txClient.loyaltyCard.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { points: 110 }, // 100 + 10
        }),
      );
    });

    it('throws BadRequestException for invalid points amount (POINTS mode)', async () => {
      await expect(
        service.createTransaction(
          'client-uuid-1', 'merchant-uuid-1',
          'EARN_POINTS', 100, 99, // Wrong: 100/10 = 10, not 99
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when client does not exist', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(null);

      await expect(
        service.createTransaction('unknown-client', 'merchant-uuid-1', 'EARN_POINTS', 100, 10),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when merchant does not exist', async () => {
      mockPrisma.client.findUnique.mockResolvedValue(mockClient);
      mockPrisma.merchant.findUnique.mockResolvedValue(null);

      await expect(
        service.createTransaction('client-uuid-1', 'unknown-merchant', 'EARN_POINTS', 100, 10),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a loyalty card if it does not exist (first visit)', async () => {
      mockPrisma._txClient.loyaltyCard.findUnique.mockResolvedValue(null);
      mockPrisma._txClient.loyaltyCard.create.mockResolvedValue(mockLoyaltyCard);
      mockPrisma._txClient.loyaltyCard.update.mockResolvedValue({ ...mockLoyaltyCard, points: 10 });

      await service.createTransaction(
        'client-uuid-1', 'merchant-uuid-1', 'EARN_POINTS', 100, 10,
      );

      expect(mockPlanService.assertCanAddClient).toHaveBeenCalledWith('merchant-uuid-1');
      expect(mockPrisma._txClient.loyaltyCard.create).toHaveBeenCalled();
    });
  });

  // ── createTransaction REDEEM_REWARD ───────────────────────────────────────

  describe('createTransaction() — REDEEM_REWARD', () => {
    beforeEach(() => {
      mockPrisma.client.findUnique.mockResolvedValue(mockClient);
      mockPrisma.merchant.findUnique.mockResolvedValue(mockMerchant);
      mockPrisma.reward.findFirst.mockResolvedValue(mockReward);
      mockPrisma._txClient.loyaltyCard.findUnique.mockResolvedValue(mockLoyaltyCard); // 100 points
      mockPrisma._txClient.reward.findFirst.mockResolvedValue(mockReward); // costs 50 pts
      mockPrisma._txClient.transaction.create.mockResolvedValue({ ...mockTransaction, type: 'REDEEM_REWARD', points: 50 });
      mockPrisma._txClient.loyaltyCard.update.mockResolvedValue({ ...mockLoyaltyCard, points: 50 });
    });

    it('deducts points and creates a REDEEM_REWARD transaction', async () => {
      const result = await service.createTransaction(
        'client-uuid-1', 'merchant-uuid-1',
        'REDEEM_REWARD', 0, 50, 'reward-uuid-1',
      );

      expect(result.type).toBe('REDEEM_REWARD');
      expect(mockPrisma._txClient.loyaltyCard.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { points: 50 }, // 100 - 50
        }),
      );
    });

    it('throws BadRequestException when insufficient points', async () => {
      const poorCard = { ...mockLoyaltyCard, points: 10 }; // only 10 points, reward costs 50
      mockPrisma._txClient.loyaltyCard.findUnique.mockResolvedValue(poorCard);

      await expect(
        service.createTransaction(
          'client-uuid-1', 'merchant-uuid-1',
          'REDEEM_REWARD', 0, 50, 'reward-uuid-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when rewardId is missing', async () => {
      await expect(
        service.createTransaction(
          'client-uuid-1', 'merchant-uuid-1',
          'REDEEM_REWARD', 0, 50,
          // no rewardId
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when points mismatch reward cost', async () => {
      await expect(
        service.createTransaction(
          'client-uuid-1', 'merchant-uuid-1',
          'REDEEM_REWARD', 0, 99, // Reward costs 50, not 99
          'reward-uuid-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── getTransactions ────────────────────────────────────────────────────────

  describe('getTransactions()', () => {
    it('returns paginated transactions for a merchant', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([mockTransaction]);
      mockPrisma.transaction.count.mockResolvedValue(1);

      const result = await service.getTransactions('merchant-uuid-1', 1, 20);

      expect(result.transactions).toHaveLength(1);
      expect(result.pagination).toBeDefined();
    });
  });
});
