import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { MerchantStoreService } from './merchant-store.service';
import { STORE_REPOSITORY } from '../../common/repositories';
import { MerchantPlanService } from './merchant-plan.service';

// â”€â”€ Fixtures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MERCHANT_ID = 'merchant-uuid-1';
const STORE_ID = 'store-uuid-1';

const mockStore = {
  id: STORE_ID,
  merchantId: MERCHANT_ID,
  nom: 'Boutique Centrale',
  adresse: '12 rue Hassan II',
  ville: 'Casablanca',
  latitude: 33.5,
  longitude: -7.6,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

// â”€â”€ Mocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const mockStoreRepo = {
  findMany: jest.fn(),
  findFirst: jest.fn(),
  count: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const mockPlanService = {
  getMaxStores: jest.fn(),
};

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

// â”€â”€ Suite â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('MerchantStoreService', () => {
  let service: MerchantStoreService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantStoreService,
        { provide: STORE_REPOSITORY, useValue: mockStoreRepo },
        { provide: CACHE_MANAGER, useValue: mockCache },
        { provide: MerchantPlanService, useValue: mockPlanService },
      ],
    }).compile();

    service = module.get<MerchantStoreService>(MerchantStoreService);
    jest.clearAllMocks();
  });

  // â”€â”€ getStores â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('getStores()', () => {
    it('returns stores ordered by creation date', async () => {
      mockStoreRepo.findMany.mockResolvedValue([mockStore]);

      const result = await service.getStores(MERCHANT_ID);

      expect(mockStoreRepo.findMany).toHaveBeenCalledWith({
        where: { merchantId: MERCHANT_ID },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toEqual([mockStore]);
    });
  });

  // â”€â”€ getStore â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('getStore()', () => {
    it('returns the store when found', async () => {
      mockStoreRepo.findFirst.mockResolvedValue(mockStore);

      const result = await service.getStore(MERCHANT_ID, STORE_ID);

      expect(result).toEqual(mockStore);
    });

    it('throws NotFoundException when store does not exist', async () => {
      mockStoreRepo.findFirst.mockResolvedValue(null);

      await expect(service.getStore(MERCHANT_ID, 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when store belongs to another merchant', async () => {
      mockStoreRepo.findFirst.mockResolvedValue(null); // findFirst with { id, merchantId } returns null

      await expect(service.getStore('other-merchant', STORE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // â”€â”€ createStore â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('createStore()', () => {
    it('creates a store when under the plan limit', async () => {
      mockPlanService.getMaxStores.mockResolvedValue(1);
      mockStoreRepo.count.mockResolvedValue(0);
      mockStoreRepo.create.mockResolvedValue(mockStore);

      const result = await service.createStore(MERCHANT_ID, {
        nom: 'Boutique Centrale',
        adresse: '12 rue Hassan II',
        ville: 'Casablanca',
      } as never);

      expect(mockStoreRepo.create).toHaveBeenCalled();
      expect(result).toEqual(mockStore);
    });

    it('throws BadRequestException when FREE plan limit of 1 is reached', async () => {
      mockPlanService.getMaxStores.mockResolvedValue(1);
      mockStoreRepo.count.mockResolvedValue(1);

      await expect(
        service.createStore(MERCHANT_ID, { nom: 'New Store' } as never),
      ).rejects.toThrow(BadRequestException);
      expect(mockStoreRepo.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when PREMIUM plan limit is reached', async () => {
      mockPlanService.getMaxStores.mockResolvedValue(10);
      mockStoreRepo.count.mockResolvedValue(10);

      await expect(
        service.createStore(MERCHANT_ID, { nom: 'New Store' } as never),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a store when PREMIUM merchant has not reached limit', async () => {
      mockPlanService.getMaxStores.mockResolvedValue(10);
      mockStoreRepo.count.mockResolvedValue(5);
      mockStoreRepo.create.mockResolvedValue(mockStore);

      await expect(
        service.createStore(MERCHANT_ID, { nom: 'New' } as never),
      ).resolves.toEqual(mockStore);
    });
  });

  // â”€â”€ updateStore â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('updateStore()', () => {
    it('updates the store when it belongs to the merchant', async () => {
      const updated = { ...mockStore, nom: 'Boutique Nord' };
      mockStoreRepo.findFirst.mockResolvedValue({ id: STORE_ID });
      mockStoreRepo.update.mockResolvedValue(updated);

      const result = await service.updateStore(MERCHANT_ID, STORE_ID, { nom: 'Boutique Nord' });

      expect(mockStoreRepo.update).toHaveBeenCalledWith({
        where: { id: STORE_ID },
        data: { nom: 'Boutique Nord' },
      });
      expect(result.nom).toBe('Boutique Nord');
    });

    it('throws NotFoundException when store not found', async () => {
      mockStoreRepo.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStore(MERCHANT_ID, STORE_ID, { nom: 'X' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockStoreRepo.update).not.toHaveBeenCalled();
    });
  });

  // â”€â”€ deleteStore â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  describe('deleteStore()', () => {
    it('deletes the store and returns success', async () => {
      mockStoreRepo.findFirst.mockResolvedValue({ id: STORE_ID });
      mockStoreRepo.delete.mockResolvedValue(mockStore);

      const result = await service.deleteStore(MERCHANT_ID, STORE_ID);

      expect(mockStoreRepo.delete).toHaveBeenCalledWith({ where: { id: STORE_ID } });
      expect(result).toEqual({ success: true, message: 'Magasin supprimé' });
    });

    it('throws NotFoundException when store not found', async () => {
      mockStoreRepo.findFirst.mockResolvedValue(null);

      await expect(service.deleteStore(MERCHANT_ID, STORE_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockStoreRepo.delete).not.toHaveBeenCalled();
    });
  });
});
