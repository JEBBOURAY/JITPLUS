import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { STORE_REPOSITORY, MERCHANT_REPOSITORY, type IStoreRepository, type IMerchantRepository } from '../../common/repositories';
import { MerchantPlanService } from './merchant-plan.service';
import { CreateStoreDto } from '../dto/create-store.dto';
import { UpdateStoreDto } from '../dto/update-store.dto';
import { Prisma, Store } from '@prisma/client';
import { stripUndefined } from '../../common/utils';
import { STORES_CACHE_TTL } from '../../common/constants';

@Injectable()
export class MerchantStoreService {
  constructor(
    @Inject(STORE_REPOSITORY) private storeRepo: IStoreRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(CACHE_MANAGER) private cache: Cache,
    private planService: MerchantPlanService,
  ) {}

  private storesCacheKey(merchantId: string): string {
    return `stores:list:${merchantId}`;
  }

  /** Invalidate both the per-merchant stores cache and the client-facing merchants list */
  private async invalidateStoresCaches(merchantId: string): Promise<void> {
    await Promise.all([
      this.cache.del(this.storesCacheKey(merchantId)),
      this.cache.del(`merchant:detail:${merchantId}`),
      // Invalidate the most common merchant list page seen by jitplus clients
      this.cache.del('merchants:list:p1:l50'),
    ]);
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
          ? "Le plan Gratuit ne permet qu'1 boutique. Passez au plan Pro pour gérer jusqu'à 10 boutiques — contactez notre équipe sur WhatsApp."
          : `Vous avez atteint la limite de ${maxStores} boutiques incluses dans votre plan Pro. Contactez notre équipe si vous avez besoin de plus.`,
      );
    }
    const { socialLinks, ...rest } = dto;
    const store = await this.storeRepo.create({
      data: {
        merchantId,
        ...rest,
        ...(socialLinks !== undefined && { socialLinks: socialLinks as unknown as Prisma.InputJsonObject }),
      },
    });
    await this.invalidateStoresCaches(merchantId);
    return store;
  }

  async updateStore(merchantId: string, storeId: string, dto: UpdateStoreDto): Promise<Store> {
    const store = await this.storeRepo.findFirst({
      where: { id: storeId, merchantId },
      select: { id: true },
    });
    if (!store) throw new NotFoundException('Magasin non trouvé');

    const { socialLinks, ...rest } = stripUndefined(dto);
    const data = {
      ...rest,
      ...(socialLinks !== undefined && { socialLinks: socialLinks as unknown as Prisma.InputJsonObject }),
    };
    const updated = await this.storeRepo.update({ where: { id: storeId }, data });

    // Sync key fields to the merchant profile when the main (first) store is updated
    const allStores = await this.storeRepo.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
      take: 1,
    });
    if (allStores.length > 0 && allStores[0].id === storeId) {
      const merchantSync: Record<string, unknown> = {};
      if (dto.description !== undefined) merchantSync.description = dto.description;
      if (dto.categorie !== undefined) merchantSync.categorie = dto.categorie;
      if (dto.ville !== undefined) merchantSync.ville = dto.ville;
      if (dto.quartier !== undefined) merchantSync.quartier = dto.quartier;
      if (dto.adresse !== undefined) merchantSync.adresse = dto.adresse;
      if (dto.latitude !== undefined) merchantSync.latitude = dto.latitude;
      if (dto.longitude !== undefined) merchantSync.longitude = dto.longitude;
      if (socialLinks !== undefined) merchantSync.socialLinks = socialLinks as unknown as Prisma.InputJsonObject;
      if (Object.keys(merchantSync).length > 0) {
        await this.merchantRepo.update({ where: { id: merchantId }, data: merchantSync });
        await Promise.all([
          this.cache.del(`merchant:detail:${merchantId}`),
          this.cache.del(`merchant:profile:${merchantId}`),
        ]);
      }
    }

    await this.invalidateStoresCaches(merchantId);
    return updated;
  }

  async deleteStore(merchantId: string, storeId: string): Promise<{ success: boolean; message: string }> {
    const store = await this.storeRepo.findFirst({
      where: { id: storeId, merchantId },
    });
    if (!store) throw new NotFoundException('Magasin non trouvé');

    // Check if this is the reference (oldest) store
    const allStores = await this.storeRepo.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
    });

    const isReferenceStore = allStores.length > 0 && allStores[0].id === storeId;

    if (isReferenceStore && allStores.length > 1) {
      // Transfer global data (email, socialLinks) to the next oldest store
      const nextStore = allStores[1];
      const globalData: Record<string, unknown> = {};
      if (store.email && !nextStore.email) globalData.email = store.email;
      if (store.description && !nextStore.description) globalData.description = store.description;
      const storeSocial = (store.socialLinks as Record<string, unknown>) ?? {};
      const nextSocial = (nextStore.socialLinks as Record<string, unknown>) ?? {};
      const mergedSocial = { ...storeSocial, ...nextSocial };
      if (Object.keys(mergedSocial).length > 0) {
        globalData.socialLinks = mergedSocial as unknown as Prisma.InputJsonObject;
      }
      if (Object.keys(globalData).length > 0) {
        await this.storeRepo.update({ where: { id: nextStore.id }, data: globalData });
      }

      // Sync the new reference store's data to the merchant profile
      const updatedNext = await this.storeRepo.findFirst({ where: { id: nextStore.id } });
      if (updatedNext) {
        const merchantSync: Record<string, unknown> = {
          description: updatedNext.description,
          categorie: updatedNext.categorie,
          ville: updatedNext.ville,
          quartier: updatedNext.quartier,
          adresse: updatedNext.adresse,
          latitude: updatedNext.latitude,
          longitude: updatedNext.longitude,
          socialLinks: (updatedNext.socialLinks ?? {}) as unknown as Prisma.InputJsonObject,
        };
        await this.merchantRepo.update({ where: { id: merchantId }, data: merchantSync });
        await Promise.all([
          this.cache.del(`merchant:detail:${merchantId}`),
          this.cache.del(`merchant:profile:${merchantId}`),
        ]);
      }
    }

    await this.storeRepo.delete({ where: { id: storeId } });
    await this.invalidateStoresCaches(merchantId);
    return { success: true, message: 'Magasin supprimé' };
  }
}
