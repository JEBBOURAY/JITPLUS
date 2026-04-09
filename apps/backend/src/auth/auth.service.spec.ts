import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { FirebaseService } from '../firebase/firebase.service';
import { MailService } from '../mail/mail.service';
import { MerchantPlanService } from '../merchant/services/merchant-plan.service';
import { MerchantReferralService } from '../merchant/services/merchant-referral.service';
import { ClientReferralService } from '../client-auth/client-referral.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import {
  MERCHANT_REPOSITORY,
  TEAM_MEMBER_REPOSITORY,
  DEVICE_SESSION_REPOSITORY,
  OTP_REPOSITORY,
  TRANSACTION_RUNNER,
} from '../common/repositories';
import { PUSH_PROVIDER, MAIL_PROVIDER } from '../common/interfaces';
import * as bcrypt from 'bcryptjs';

// ── Mocks ──────────────────────────────────────────────────────────────────────

const hashedPw = bcrypt.hashSync('ValidPass1!', 12);

const mockMerchant = {
  id: 'merchant-uuid-1',
  nom: 'Test Commerce',
  email: 'test@jitplus.com',
  password: hashedPw,
  categorie: 'CAFE',
  description: null,
  ville: 'Casablanca',
  quartier: null,
  adresse: null,
  latitude: null,
  longitude: null,
  logoUrl: null,
  coverUrl: null,
  pointsRules: {},
  pointsRate: 10,
  loyaltyType: 'POINTS',
  conversionRate: 10,
  stampsForReward: 10,
  activeRewardId: null,
  countryCode: 'MA',
  phoneNumber: null,
  isActive: true,
  termsAccepted: true,
  plan: 'PREMIUM',
  planExpiresAt: null,
  planActivatedByAdmin: false,
  trialStartedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  pushToken: null,
  failedLoginAttempts: 0,
  lockedUntil: null,
};

const mockPrismaService = {
  merchant: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  teamMember: {
    findUnique: jest.fn(),
  },
  deviceSession: {
    updateMany: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
  verify: jest.fn(),
};

const mockFirebaseService = {
  sendMulticast: jest.fn().mockResolvedValue(undefined),
};

const mockMailService = {
  sendWelcomeMerchant: jest.fn().mockResolvedValue(undefined),
  sendOtpEmail: jest.fn().mockResolvedValue(undefined),
};

const mockPlanService = {
  getTrialData: jest.fn().mockReturnValue({ plan: 'PREMIUM', trialStartedAt: new Date() }),
  isPremium: jest.fn().mockResolvedValue(true),
};

const mockReferralService = {
  validateCode: jest.fn().mockResolvedValue(null),
  creditReferrer: jest.fn().mockResolvedValue(undefined),
};

const mockConfigService = {
  get: jest.fn().mockImplementation((key: string) => {
    if (key === 'GOOGLE_CLIENT_ID') return 'test-google-client-id';
    return undefined;
  }),
};

const mockOtpRepo = {
  findUnique: jest.fn().mockResolvedValue(null),
  upsert: jest.fn().mockResolvedValue({}),
  delete: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
};

const mockTxRunner = {
  run: jest.fn().mockImplementation((fn) => fn(mockPrismaService)),
};

// ── Tests ──────────────────────────────────────────────────────────────────────


describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: MERCHANT_REPOSITORY, useValue: mockPrismaService.merchant },
        { provide: TEAM_MEMBER_REPOSITORY, useValue: mockPrismaService.teamMember },
        { provide: DEVICE_SESSION_REPOSITORY, useValue: mockPrismaService.deviceSession },
        { provide: OTP_REPOSITORY, useValue: mockOtpRepo },
        { provide: TRANSACTION_RUNNER, useValue: mockTxRunner },
        { provide: PUSH_PROVIDER, useValue: mockFirebaseService },
        { provide: MAIL_PROVIDER, useValue: mockMailService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MerchantPlanService, useValue: mockPlanService },
        { provide: MerchantReferralService, useValue: mockReferralService },
        { provide: ClientReferralService, useValue: { validateCode: jest.fn(), createReferral: jest.fn() } },
        { provide: JwtStrategy, useValue: { invalidateSession: jest.fn() } },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('login()', () => {
    it('returns access_token + merchant for valid credentials', async () => {
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce(mockMerchant);
      mockPrismaService.teamMember.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.merchant.update.mockResolvedValue(mockMerchant);

      const result = await service.login(
        { email: 'test@jitplus.com', password: 'ValidPass1!' },
        '1.2.3.4',
      );

      expect(result.access_token).toBe('mock-jwt-token');
      expect(result.merchant.email).toBe('test@jitplus.com');
      expect(result.userType).toBe('merchant');
      expect(result.merchant).not.toHaveProperty('password');
      expect(result.merchant).not.toHaveProperty('pushToken');
    });

    it('throws UnauthorizedException on wrong password', async () => {
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce(mockMerchant);
      mockPrismaService.teamMember.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.merchant.update.mockResolvedValue(mockMerchant);

      await expect(
        service.login({ email: 'test@jitplus.com', password: 'WrongPass!' }, '1.2.3.4'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when no user found (timing-safe)', async () => {
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.teamMember.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.login({ email: 'ghost@jitplus.com', password: 'anything' }, '1.2.3.4'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for a locked merchant', async () => {
      const lockedMerchant = {
        ...mockMerchant,
        failedLoginAttempts: 10,
        lockedUntil: new Date(Date.now() + 10 * 60_000), // locked for 10 more minutes
      };
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce(lockedMerchant);
      mockPrismaService.teamMember.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.login({ email: 'test@jitplus.com', password: 'ValidPass1!' }, '1.2.3.4'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('increments failedLoginAttempts on wrong password', async () => {
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce(mockMerchant);
      mockPrismaService.teamMember.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.merchant.update.mockResolvedValue(mockMerchant);

      await expect(
        service.login({ email: 'test@jitplus.com', password: 'Wrong!' }, '1.2.3.4'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPrismaService.merchant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'merchant-uuid-1' },
          data: expect.objectContaining({ failedLoginAttempts: 1 }),
        }),
      );
    });

    it('resets failedLoginAttempts on successful login', async () => {
      const merchantWithAttempts = { ...mockMerchant, failedLoginAttempts: 3 };
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce(merchantWithAttempts);
      mockPrismaService.teamMember.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.merchant.update.mockResolvedValue(merchantWithAttempts);

      await service.login({ email: 'test@jitplus.com', password: 'ValidPass1!' }, '1.2.3.4');

      expect(mockPrismaService.merchant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { failedLoginAttempts: 0, lockedUntil: null },
        }),
      );
    });

    it('does not return refresh_token when no deviceName (no session)', async () => {
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce(mockMerchant);
      mockPrismaService.teamMember.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.merchant.update.mockResolvedValue(mockMerchant);

      const result = await service.login(
        { email: 'test@jitplus.com', password: 'ValidPass1!' },
        '1.2.3.4',
      );

      // No deviceName → no DeviceSession → no refresh_token
      expect(result.refresh_token).toBeUndefined();
    });

    it('returns refresh_token when deviceName is provided', async () => {
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce(mockMerchant);
      mockPrismaService.teamMember.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.merchant.update.mockResolvedValue(mockMerchant);
      mockPrismaService.deviceSession.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.deviceSession.findFirst.mockResolvedValue(null);
      mockPrismaService.deviceSession.findMany.mockResolvedValue([]);
      mockPrismaService.deviceSession.create.mockResolvedValue({ id: 'session-1' });

      const result = await service.login(
        { email: 'test@jitplus.com', password: 'ValidPass1!', deviceName: 'iPhone 15' },
        '1.2.3.4',
      );

      expect(typeof result.refresh_token).toBe('string');
      expect(result.refresh_token!.length).toBeGreaterThan(40);
      expect(result.session_id).toBeDefined();
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('deletes device session by sessionId', async () => {
      mockPrismaService.deviceSession.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.logout('session-uuid-123');

      expect(mockPrismaService.deviceSession.deleteMany).toHaveBeenCalledWith({
        where: { tokenId: 'session-uuid-123' },
      });
      expect(result.message).toBe('Déconnecté');
    });

    it('returns success even if no sessionId provided', async () => {
      const result = await service.logout(undefined);
      expect(result.message).toBe('Déconnecté');
      expect(mockPrismaService.deviceSession.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ── register ───────────────────────────────────────────────────────────────

  describe('register()', () => {
    it('throws ConflictException if email already exists', async () => {
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce({ id: 'existing-id' });

      await expect(
        service.register({
          nom: 'Test',
          email: 'test@jitplus.com',
          password: 'ValidPass1!',
          categorie: 'CAFE' as any,
          ville: 'Casablanca',
          termsAccepted: true,
        } as any),
      ).rejects.toThrow(ConflictException);
    });
  });
});
