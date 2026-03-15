import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { STORE_REPOSITORY, type IStoreRepository } from '../../common/repositories';
import { MerchantPlanService } from './merchant-plan.service';
import { CreateStoreDto } from '../dto/create-store.dto';
import { UpdateStoreDto } from '../dto/update-store.dto';
import { Store } from '../../generated/client';
import { stripUndefined } from '../../common/utils';
import { STORES_CACHE_TTL } from '../../common/constants';

@Injectable()
export class MerchantStoreService {
  constructor(
    @Inject(STORE_REPOSITORY) private storeRepo: IStoreRepository,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private planService: MerchantPlanService,
  ) {}

  private storesCacheKey(merchantId: string): string {
    return `stores:list:${merchantId}`;
  }

  async getStores(merchantId: string) {
    const cacheKey = this.storesCacheKey(merchantId);
    const cached = await this.cache.get<Store[]>(cacheKey);
    if (cached) return cached;

    const stores = await this.storeRepo.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
    });
    await this.cache.set(cacheKey, stores, STORES_CACHE_TTL);
    return stores;
  }

  async getStore(merchantId: string, storeId: string): Promise<Store> {
    const store = await this.storeRepo.findFirst({
      where: { id: storeId, merchantId },
    });
    if (!store) throw new NotFoundException('Magasin non trouvé');
    return store;
  }

  async createStore(merchantId: string, dto: CreateStoreDto): Promise<Store> {
    const maxStores = await this.planService.getMaxStores(merchantId);
    const count = await this.storeRepo.count({ where: { merchantId } });
    if (count >= maxStores) {
      throw new BadRequestException(
        maxStores === 1
          ? 'Le plan Gratuit est limité à 1 boutique. Passez au plan Premium pour ajouter plus de magasins.'
          : `Vous avez atteint la limite de ${maxStores} magasins.`,
      );
    }
    const store = await this.storeRepo.create({
      data: { merchantId, ...dto },
    });
    await this.cache.del(this.storesCacheKey(merchantId));
    return store;
  }

  async updateStore(merchantId: string, storeId: string, dto: UpdateStoreDto): Promise<Store> {
    const store = await this.storeRepo.findFirst({
      where: { id: storeId, merchantId },
      select: { id: true },
    });
    if (!store) throw new NotFoundException('Magasin non trouvé');

    const data = stripUndefined(dto);
    const updated = await this.storeRepo.update({ where: { id: storeId }, data });
    await this.cache.del(this.storesCacheKey(merchantId));
    return updated;
  }

  async deleteStore(merchantId: string, storeId: string): Promise<{ success: boolean; message: string }> {
    const store = await this.storeRepo.findFirst({
      where: { id: storeId, merchantId },
      select: { id: true },
    });
    if (!store) throw new NotFoundException('Magasin non trouvé');

    await this.storeRepo.delete({ where: { id: storeId } });
    await this.cache.del(this.storesCacheKey(merchantId));
    return { success: true, message: 'Magasin supprimé' };
  }
}
