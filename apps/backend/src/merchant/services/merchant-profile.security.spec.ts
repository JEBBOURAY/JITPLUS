import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { MerchantProfileService } from './merchant-profile.service';
import {
  MERCHANT_REPOSITORY,
  DEVICE_SESSION_REPOSITORY,
  LOYALTY_CARD_REPOSITORY,
  TRANSACTION_REPOSITORY,
  TRANSACTION_RUNNER,
} from '../../common/repositories';
import { NotificationsService } from '../../notifications/notifications.service';
import { AuditLogService } from '../../admin/audit-log.service';
import { MailService } from '../../mail/mail.service';

const PASSWORD = 'Current#123';
const NEW_PASSWORD = 'Brand-New#456';

describe('MerchantProfileService — re-authentication for sensitive changes', () => {
  let service: MerchantProfileService;
  let merchantRepo: { findUnique: jest.Mock; update: jest.Mock };
  let deviceSessionRepo: { deleteMany: jest.Mock };
  let verifyIdToken: jest.Mock;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(async () => {
    merchantRepo = {
      findUnique: jest.fn(),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'm1', ...data })),
    };
    deviceSessionRepo = { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantProfileService,
        { provide: MERCHANT_REPOSITORY, useValue: merchantRepo },
        { provide: DEVICE_SESSION_REPOSITORY, useValue: deviceSessionRepo },
        { provide: LOYALTY_CARD_REPOSITORY, useValue: {} },
        { provide: TRANSACTION_REPOSITORY, useValue: {} },
        { provide: TRANSACTION_RUNNER, useValue: {} },
        { provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn().mockResolvedValue(undefined) } },
        { provide: NotificationsService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'google-client-id') } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: MailService, useValue: {} },
      ],
    }).compile();

    service = module.get(MerchantProfileService);
    verifyIdToken = jest.fn();
    (service as unknown as { googleClient: { verifyIdToken: jest.Mock } }).googleClient = { verifyIdToken };
  });

  const passwordAccount = () => ({ id: 'm1', email: 'old@shop.ma', password: passwordHash, googleId: null, appleId: null });
  const googleAccount = () => ({ id: 'm1', email: 'old@shop.ma', password: passwordHash, googleId: 'g-sub-1', appleId: null });
  const googleTicket = (sub: string) => ({ getPayload: () => ({ sub }) });

  describe('updateProfile — email change', () => {
    it('refuses an email change without re-authentication', async () => {
      merchantRepo.findUnique.mockResolvedValue(passwordAccount());

      await expect(service.updateProfile('m1', { email: 'attacker@evil.ma' })).rejects.toThrow(BadRequestException);
      expect(merchantRepo.update).not.toHaveBeenCalled();
    });

    it('refuses an email change with a wrong current password', async () => {
      merchantRepo.findUnique.mockResolvedValue(passwordAccount());

      await expect(
        service.updateProfile('m1', { email: 'attacker@evil.ma', currentPassword: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(merchantRepo.update).not.toHaveBeenCalled();
    });

    it('changes the email with the current password, without storing the password field', async () => {
      merchantRepo.findUnique.mockResolvedValue(passwordAccount());

      await service.updateProfile('m1', { email: 'new@shop.ma', currentPassword: PASSWORD });

      const { data } = merchantRepo.update.mock.calls[0][0];
      expect(data).toEqual({ email: 'new@shop.ma', emailVerified: false });
    });

    it('accepts a Google re-authentication for a Google account', async () => {
      merchantRepo.findUnique.mockResolvedValue(googleAccount());
      verifyIdToken.mockResolvedValue(googleTicket('g-sub-1'));

      await service.updateProfile('m1', { email: 'new@shop.ma', idToken: 'google-token' });

      expect(merchantRepo.update.mock.calls[0][0].data).toEqual({ email: 'new@shop.ma', emailVerified: false });
    });

    it('rejects a Google token of another account', async () => {
      merchantRepo.findUnique.mockResolvedValue(googleAccount());
      verifyIdToken.mockResolvedValue(googleTicket('someone-else'));

      await expect(
        service.updateProfile('m1', { email: 'new@shop.ma', idToken: 'google-token' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(merchantRepo.update).not.toHaveBeenCalled();
    });

    it('does not ask for re-authentication when the email is unchanged', async () => {
      merchantRepo.findUnique.mockResolvedValue(passwordAccount());

      await service.updateProfile('m1', { email: 'old@shop.ma', nom: 'Shop' });

      expect(merchantRepo.update.mock.calls[0][0].data).toEqual({ email: 'old@shop.ma', nom: 'Shop' });
    });
  });

  describe('changePassword', () => {
    it('refuses a Google account without current password or Google re-authentication', async () => {
      merchantRepo.findUnique.mockResolvedValue(googleAccount());

      await expect(service.changePassword('m1', { newPassword: NEW_PASSWORD })).rejects.toThrow(BadRequestException);
      expect(merchantRepo.update).not.toHaveBeenCalled();
    });

    it('lets a Google account set a password after Google re-authentication', async () => {
      merchantRepo.findUnique.mockResolvedValue(googleAccount());
      verifyIdToken.mockResolvedValue(googleTicket('g-sub-1'));

      await service.changePassword('m1', { newPassword: NEW_PASSWORD, idToken: 'google-token' }, 'session-1');

      expect(merchantRepo.update).toHaveBeenCalled();
    });

    it('ignores a Google token on an account that is not linked to Google', async () => {
      merchantRepo.findUnique.mockResolvedValue(passwordAccount());

      await expect(
        service.changePassword('m1', { newPassword: NEW_PASSWORD, idToken: 'google-token' }),
      ).rejects.toThrow(BadRequestException);
      expect(verifyIdToken).not.toHaveBeenCalled();
      expect(merchantRepo.update).not.toHaveBeenCalled();
    });

    it('still accepts the current password', async () => {
      merchantRepo.findUnique.mockResolvedValue(passwordAccount());

      await service.changePassword('m1', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }, 'session-1');

      expect(merchantRepo.update).toHaveBeenCalled();
      expect(deviceSessionRepo.deleteMany).toHaveBeenCalled();
    });
  });
});
