import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { RewardsService } from './rewards.service';
import { REWARD_REPOSITORY } from './reward.repository.interface';
import { MerchantPlanService } from '../merchant/services/merchant-plan.service';
import { STORAGE_PROVIDER } from '../common/interfaces';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MERCHANT_ID = 'merchant-uuid-1';
const REWARD_ID = 'reward-uuid-1';

const mockReward = {
  id: REWARD_ID,
  merchantId: MERCHANT_ID,
  titre: 'Café gratuit',
  cout: 50,
  description: 'Un café offert',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const mockRewardRepo = {
  findAllByMerchant: jest.fn(),
  findOneByMerchant: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockPlanService = {
  isPremium: jest.fn().mockResolvedValue(true),
};

const OWN_IMAGE = `https://storage.googleapis.com/bucket/rewards/${MERCHANT_ID}/cafe_1a2b3c4d.webp`;
const LEGACY_IMAGE = 'https://storage.googleapis.com/bucket/rewards/cafe_9f8e7d6c.webp';
const FOREIGN_IMAGE = 'https://storage.googleapis.com/bucket/rewards/other-merchant/the_1a2b3c4d.webp';

const mockStorage = {
  deleteFile: jest.fn().mockResolvedValue(undefined),
  isOwnedBy: jest.fn((url: string, ownerId: string) => url.includes(`/rewards/${ownerId}/`)),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('RewardsService', () => {
  let service: RewardsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RewardsService,
        { provide: REWARD_REPOSITORY, useValue: mockRewardRepo },
        { provide: CACHE_MANAGER, useValue: mockCache },
        { provide: MerchantPlanService, useValue: mockPlanService },
        { provide: STORAGE_PROVIDER, useValue: mockStorage },
      ],
    }).compile();

    service = module.get<RewardsService>(RewardsService);
    jest.clearAllMocks();
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns sorted rewards for a merchant', async () => {
      mockRewardRepo.findAllByMerchant.mockResolvedValue([mockReward]);

      const result = await service.findAll(MERCHANT_ID);

      expect(mockRewardRepo.findAllByMerchant).toHaveBeenCalledWith(MERCHANT_ID);
      expect(result).toEqual([mockReward]);
    });

    it('returns empty array when no rewards exist', async () => {
      mockRewardRepo.findAllByMerchant.mockResolvedValue([]);
      const result = await service.findAll(MERCHANT_ID);
      expect(result).toEqual([]);
    });
  });

  // ── findOne ────────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('returns the reward when found', async () => {
      mockRewardRepo.findOneByMerchant.mockResolvedValue(mockReward);

      const result = await service.findOne(REWARD_ID, MERCHANT_ID);

      expect(mockRewardRepo.findOneByMerchant).toHaveBeenCalledWith(REWARD_ID, MERCHANT_ID);
      expect(result).toEqual(mockReward);
    });

    it('throws NotFoundException when reward does not exist', async () => {
      mockRewardRepo.findOneByMerchant.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', MERCHANT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates and returns a reward for valid data', async () => {
      mockRewardRepo.create.mockResolvedValue(mockReward);

      const result = await service.create(MERCHANT_ID, {
        titre: 'Café gratuit',
        cout: 50,
        description: 'Un café offert',
      });

      expect(mockRewardRepo.create).toHaveBeenCalledWith({
        titre: 'Café gratuit', cout: 50, description: 'Un café offert', merchantId: MERCHANT_ID,
      });
      expect(result).toEqual(mockReward);
    });

    it('throws BadRequestException when cout is 0', async () => {
      await expect(
        service.create(MERCHANT_ID, { titre: 'Gratuit', cout: 0 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRewardRepo.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when cout is negative', async () => {
      await expect(
        service.create(MERCHANT_ID, { titre: 'Gratuit', cout: -10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts an image uploaded by the merchant', async () => {
      mockRewardRepo.create.mockResolvedValue({ ...mockReward, imageUrl: OWN_IMAGE });
      await service.create(MERCHANT_ID, { titre: 'Café', cout: 5, imageUrl: OWN_IMAGE });
      expect(mockRewardRepo.create).toHaveBeenCalled();
    });

    it('rejects an image that belongs to another merchant or to no one', async () => {
      for (const imageUrl of [FOREIGN_IMAGE, LEGACY_IMAGE, 'https://evil.example/x.png']) {
        await expect(
          service.create(MERCHANT_ID, { titre: 'Café', cout: 5, imageUrl }),
        ).rejects.toThrow(BadRequestException);
      }
      expect(mockRewardRepo.create).not.toHaveBeenCalled();
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('updates and returns the reward for valid data', async () => {
      const updated = { ...mockReward, titre: 'Thé gratuit' };
      mockRewardRepo.findOneByMerchant.mockResolvedValue(mockReward);
      mockRewardRepo.update.mockResolvedValue(updated);

      const result = await service.update(REWARD_ID, MERCHANT_ID, { titre: 'Thé gratuit' });

      expect(mockRewardRepo.update).toHaveBeenCalledWith(REWARD_ID, { titre: 'Thé gratuit' });
      expect(result.titre).toBe('Thé gratuit');
    });

    it('throws NotFoundException when reward does not belong to merchant', async () => {
      mockRewardRepo.findOneByMerchant.mockResolvedValue(null);

      await expect(
        service.update(REWARD_ID, 'other-merchant', { titre: 'X' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockRewardRepo.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when updating cout to 0', async () => {
      await expect(
        service.update(REWARD_ID, MERCHANT_ID, { cout: 0 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRewardRepo.findOneByMerchant).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when updating cout to a negative value', async () => {
      await expect(
        service.update(REWARD_ID, MERCHANT_ID, { cout: -5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows updating cout to a positive value', async () => {
      const updated = { ...mockReward, cout: 100 };
      mockRewardRepo.findOneByMerchant.mockResolvedValue(mockReward);
      mockRewardRepo.update.mockResolvedValue(updated);

      const result = await service.update(REWARD_ID, MERCHANT_ID, { cout: 100 });
      expect(result.cout).toBe(100);
    });

    it('rejects pointing the reward at a foreign image (nothing updated or deleted)', async () => {
      mockRewardRepo.findOneByMerchant.mockResolvedValue({ ...mockReward, imageUrl: OWN_IMAGE });

      await expect(
        service.update(REWARD_ID, MERCHANT_ID, { imageUrl: FOREIGN_IMAGE }),
      ).rejects.toThrow(BadRequestException);
      expect(mockRewardRepo.update).not.toHaveBeenCalled();
      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
    });

    it('keeps an unchanged legacy image without deleting it', async () => {
      mockRewardRepo.findOneByMerchant.mockResolvedValue({ ...mockReward, imageUrl: LEGACY_IMAGE });
      mockRewardRepo.update.mockResolvedValue({ ...mockReward, imageUrl: LEGACY_IMAGE });

      await service.update(REWARD_ID, MERCHANT_ID, { imageUrl: LEGACY_IMAGE });
      expect(mockRewardRepo.update).toHaveBeenCalled();
      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
    });

    it('deletes the replaced image only when it is under the merchant prefix, after the update', async () => {
      mockRewardRepo.findOneByMerchant.mockResolvedValue({ ...mockReward, imageUrl: OWN_IMAGE });
      mockRewardRepo.update.mockResolvedValue({ ...mockReward, imageUrl: null });

      await service.update(REWARD_ID, MERCHANT_ID, { imageUrl: null });
      expect(mockStorage.deleteFile).toHaveBeenCalledWith(OWN_IMAGE);
      expect(mockRewardRepo.update.mock.invocationCallOrder[0])
        .toBeLessThan(mockStorage.deleteFile.mock.invocationCallOrder[0]);
    });

    it('does not delete a legacy (un-prefixed) image when it is replaced', async () => {
      mockRewardRepo.findOneByMerchant.mockResolvedValue({ ...mockReward, imageUrl: LEGACY_IMAGE });
      mockRewardRepo.update.mockResolvedValue({ ...mockReward, imageUrl: OWN_IMAGE });

      await service.update(REWARD_ID, MERCHANT_ID, { imageUrl: OWN_IMAGE });
      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
    });
  });

  // ── remove ─────────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('deletes and returns the reward', async () => {
      mockRewardRepo.findOneByMerchant.mockResolvedValue(mockReward);
      mockRewardRepo.delete.mockResolvedValue(mockReward);

      const result = await service.remove(REWARD_ID, MERCHANT_ID);

      expect(mockRewardRepo.delete).toHaveBeenCalledWith(REWARD_ID);
      expect(result).toEqual(mockReward);
    });

    it('deletes the image of a removed reward only when the merchant owns it', async () => {
      mockRewardRepo.findOneByMerchant.mockResolvedValue(mockReward);
      mockRewardRepo.delete.mockResolvedValueOnce({ ...mockReward, imageUrl: OWN_IMAGE });
      await service.remove(REWARD_ID, MERCHANT_ID);
      expect(mockStorage.deleteFile).toHaveBeenCalledWith(OWN_IMAGE);

      mockStorage.deleteFile.mockClear();
      mockRewardRepo.delete.mockResolvedValueOnce({ ...mockReward, imageUrl: FOREIGN_IMAGE });
      await service.remove(REWARD_ID, MERCHANT_ID);
      expect(mockStorage.deleteFile).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when reward not found', async () => {
      mockRewardRepo.findOneByMerchant.mockResolvedValue(null);

      await expect(service.remove(REWARD_ID, 'other-merchant')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockRewardRepo.delete).not.toHaveBeenCalled();
    });
  });
});
