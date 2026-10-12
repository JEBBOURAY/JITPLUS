import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { MerchantProfileService } from './merchant-profile.service';
import {
  MERCHANT_REPOSITORY,
  DEVICE_SESSION_REPOSITORY,
  LOYALTY_CARD_REPOSITORY,
  TRANSACTION_REPOSITORY,
  TRANSACTION_RUNNER,
  RAW_QUERY_RUNNER,
  REWARD_REPOSITORY,
  TEAM_MEMBER_REPOSITORY,
  STORE_REPOSITORY,
} from '../../common/repositories';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditLogService } from '../../admin/audit-log.service';
import { MailService } from '../../mail/mail.service';

describe('MerchantProfileService — brand profile', () => {
  let service: MerchantProfileService;
  let merchantRepo: { findUnique: jest.Mock; update: jest.Mock };
  let cache: { get: jest.Mock; set: jest.Mock; del: jest.Mock };

  beforeEach(async () => {
    merchantRepo = {
      findUnique: jest.fn(),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'm1', ...data })),
    };
    cache = { get: jest.fn(), set: jest.fn(), del: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantProfileService,
        { provide: MERCHANT_REPOSITORY, useValue: merchantRepo },
        { provide: DEVICE_SESSION_REPOSITORY, useValue: {} },
        { provide: LOYALTY_CARD_REPOSITORY, useValue: {} },
        { provide: TRANSACTION_REPOSITORY, useValue: {} },
        { provide: TRANSACTION_RUNNER, useValue: {} },
        { provide: RAW_QUERY_RUNNER, useValue: {} },
        { provide: REWARD_REPOSITORY, useValue: {} },
        { provide: TEAM_MEMBER_REPOSITORY, useValue: {} },
        { provide: STORE_REPOSITORY, useValue: {} },
        { provide: CACHE_MANAGER, useValue: cache },
        { provide: NotificationsService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: MailService, useValue: {} },
      ],
    }).compile();

    service = module.get(MerchantProfileService);
  });

  it('stores description, category and social links on the merchant', async () => {
    await service.updateProfile('m1', {
      description: 'Boulangerie artisanale',
      categorie: 'BOULANGERIE' as any,
      socialLinks: { instagram: 'maboulangerie', whatsapp: '+212600000000' },
    });

    const { data } = merchantRepo.update.mock.calls[0][0];
    expect(data).toEqual({
      description: 'Boulangerie artisanale',
      categorie: 'BOULANGERIE',
      socialLinks: { instagram: 'maboulangerie', whatsapp: '+212600000000' },
    });
    expect(cache.del).toHaveBeenCalledWith('merchant:detail:m1');
    expect(cache.del).toHaveBeenCalledWith('merchant:profile:m1');
  });

  it('drops blank social links so they are removed', async () => {
    await service.updateProfile('m1', { socialLinks: { instagram: 'shop', website: '' } });

    const { data } = merchantRepo.update.mock.calls[0][0];
    expect(data.socialLinks).toEqual({ instagram: 'shop' });
  });

  it('leaves social links untouched when not provided', async () => {
    await service.updateProfile('m1', { tagline: 'Le meilleur pain' });

    const { data } = merchantRepo.update.mock.calls[0][0];
    expect(data).not.toHaveProperty('socialLinks');
  });

  it('rejects banned content in brand fields', async () => {
    await expect(
      service.updateProfile('m1', { description: 'visit porn site' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(merchantRepo.update).not.toHaveBeenCalled();
  });
});
