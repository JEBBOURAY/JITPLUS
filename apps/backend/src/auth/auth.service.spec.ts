import { Test, TestingModule } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LoginDto } from './dto/login.dto';
import { AppleTokenVerifier } from '../common/apple/apple-token-verifier.service';
import { OtpSendLimiter } from '../common/coordination/otp-send-limiter.service';
import { AuthService } from './auth.service';
import { MerchantSessionService } from './merchant-session.service';
import { MerchantSignupService } from './merchant-signup.service';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { FirebaseService } from '../firebase/firebase.service';
import { MailService } from '../mail/mail.service';
import { MerchantPlanService } from '../merchant/services/merchant-plan.service';
import { MerchantReferralService } from '../merchant/services/merchant-referral.service';
import { ClientReferralService } from '../client-auth/client-referral.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  MERCHANT_REPOSITORY,
  TEAM_MEMBER_REPOSITORY,
  DEVICE_SESSION_REPOSITORY,
  OTP_REPOSITORY,
  TRANSACTION_RUNNER,
} from '../common/repositories';
import { MAIL_PROVIDER } from '../common/interfaces';
import { MerchantNotifierService } from '../merchant-inbox/merchant-notifier.service';
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
  amountPerStamp: 10,
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
  failedLoginAttempts: 0,
  lockedUntil: null,
};

const mockPrismaService = {
  merchant: {
    findUnique: jest.fn(),
    // Phone uniqueness check run by every signup.
    findFirst: jest.fn().mockResolvedValue(null),
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
    delete: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
  verify: jest.fn(),
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

const DEVICE = { deviceName: 'Test Phone', deviceOS: 'ios', deviceId: 'dev-test' };

const mockTxRunner = {
  run: jest.fn().mockImplementation((fn) => fn(mockPrismaService)),
};

// ── Tests ──────────────────────────────────────────────────────────────────────


// AuthService (password login) is wired with the real MerchantSessionService and
// MerchantSignupService so the session / signup flows run end to end on the mocks.
describe('AuthService + MerchantSessionService + MerchantSignupService', () => {
  let service: AuthService;
  let sessions: MerchantSessionService;
  let signupService: MerchantSignupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        MerchantSessionService,
        MerchantSignupService,
        { provide: MERCHANT_REPOSITORY, useValue: mockPrismaService.merchant },
        { provide: TEAM_MEMBER_REPOSITORY, useValue: mockPrismaService.teamMember },
        { provide: DEVICE_SESSION_REPOSITORY, useValue: mockPrismaService.deviceSession },
        { provide: OTP_REPOSITORY, useValue: mockOtpRepo },
        { provide: TRANSACTION_RUNNER, useValue: mockTxRunner },
        { provide: MAIL_PROVIDER, useValue: mockMailService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MerchantPlanService, useValue: mockPlanService },
        { provide: MerchantReferralService, useValue: mockReferralService },
        { provide: ClientReferralService, useValue: { validateCode: jest.fn(), createReferral: jest.fn() } },
        { provide: JwtStrategy, useValue: { invalidateSession: jest.fn() } },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MerchantNotifierService, useValue: { notify: jest.fn().mockResolvedValue('sent') } },
        { provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn().mockResolvedValue(undefined) } },
        { provide: AppleTokenVerifier, useValue: { verify: jest.fn() } },
        { provide: OtpSendLimiter, useValue: { consume: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    sessions = module.get<MerchantSessionService>(MerchantSessionService);
    signupService = module.get<MerchantSignupService>(MerchantSignupService);
    jest.clearAllMocks();
    // Every successful sign-in opens a DeviceSession: default to an unknown device.
    mockPrismaService.deviceSession.findFirst.mockResolvedValue(null);
    mockPrismaService.deviceSession.create.mockResolvedValue({});
    mockPrismaService.deviceSession.findMany.mockResolvedValue([]);
  });

  // ── login ──────────────────────────────────────────────────────────────────

  describe('sendLoginNotification()', () => {
    const send = (...args: unknown[]) => (sessions as any).sendLoginNotification(...args);
    let notifier: { notify: jest.Mock };
    beforeEach(() => {
      notifier = (sessions as any).notifier;
      notifier.notify.mockClear();
      (mockMailService as any).sendLoginAlert = jest.fn().mockResolvedValue(undefined);
    });

    it('does nothing for an already known device', async () => {
      await send('m1', { kind: 'owner' }, 'iPhone', false);
      expect(notifier.notify).not.toHaveBeenCalled();
      expect((mockMailService as any).sendLoginAlert).not.toHaveBeenCalled();
    });

    it('sends a SECURITY alert + email for a new device, in the merchant language', async () => {
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce({
        id: 'm1', pushToken: 'tok', notifPush: false, notifPrefs: null, language: 'en', email: 'o@x.com',
      });
      await send('m1', { kind: 'member', name: 'Sara' }, 'Pixel 8', true);
      expect(notifier.notify).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'm1', pushToken: 'tok' }),
        expect.objectContaining({
          category: 'SECURITY',
          action: 'open_security',
          title: 'New sign-in to your account',
          body: expect.stringContaining('Sara (team) signed in on a new device: Pixel 8'),
        }),
      );
      expect((mockMailService as any).sendLoginAlert)
        .toHaveBeenCalledWith('o@x.com', 'Sara (team)', 'Pixel 8', expect.any(Date), 'en');
    });
  });

  describe('login()', () => {
    it('returns access_token + merchant for valid credentials', async () => {
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce(mockMerchant);
      mockPrismaService.teamMember.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.merchant.update.mockResolvedValue(mockMerchant);

      const result = await service.login(
        { email: 'test@jitplus.com', password: 'ValidPass1!', ...DEVICE },
        '1.2.3.4',
      );

      expect(result.access_token).toBe('mock-jwt-token');
      expect(result.merchant.email).toBe('test@jitplus.com');
      expect(result.userType).toBe('merchant');
      expect(result.merchant).not.toHaveProperty('password');
      // pushToken is never selected, so it cannot leak into the response.
      expect(mockPrismaService.merchant.findUnique.mock.calls[0][0].select).not.toHaveProperty('pushToken');
    });

    it('throws UnauthorizedException on wrong password', async () => {
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce(mockMerchant);
      mockPrismaService.teamMember.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.merchant.update.mockResolvedValue(mockMerchant);

      await expect(
        service.login({ email: 'test@jitplus.com', password: 'WrongPass!', ...DEVICE }, '1.2.3.4'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when no user found (timing-safe)', async () => {
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.teamMember.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.login({ email: 'ghost@jitplus.com', password: 'anything', ...DEVICE }, '1.2.3.4'),
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
        service.login({ email: 'test@jitplus.com', password: 'ValidPass1!', ...DEVICE }, '1.2.3.4'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('increments failedLoginAttempts on wrong password', async () => {
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce(mockMerchant);
      mockPrismaService.teamMember.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.merchant.update.mockResolvedValue(mockMerchant);

      await expect(
        service.login({ email: 'test@jitplus.com', password: 'Wrong!', ...DEVICE }, '1.2.3.4'),
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

      await service.login({ email: 'test@jitplus.com', password: 'ValidPass1!', ...DEVICE }, '1.2.3.4');

      expect(mockPrismaService.merchant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { failedLoginAttempts: 0, lockedUntil: null },
        }),
      );
    });

    it('rejects a sign-in without deviceName at validation (its token would be refused)', async () => {
      const dto = plainToInstance(LoginDto, { email: 'test@jitplus.com', password: 'ValidPass1!' });
      const errors = await validate(dto);
      expect(errors.map((e) => e.property)).toContain('deviceName');
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
        { email: 'test@jitplus.com', password: 'ValidPass1!', ...DEVICE, deviceName: 'iPhone 15' },
        '1.2.3.4',
      );

      expect(typeof result.refresh_token).toBe('string');
      expect(result.refresh_token!.length).toBeGreaterThan(40);
      expect(result.session_id).toBeDefined();
    });
  });

  // ── registerDeviceSession ─────────────────────────────────────────────────

  describe('registerDeviceSession()', () => {
    const register = (device: Record<string, unknown>) =>
      (sessions as any).registerDeviceSession('m1', 'sess-1', device, '1.2.3.4', 'merchant', 'o@x.com', 'Owner', 'hash');

    it('reuses the row of a known deviceId: not a new device, no eviction query', async () => {
      mockPrismaService.deviceSession.findFirst.mockResolvedValueOnce({ id: 'row-1' });
      mockPrismaService.deviceSession.update.mockResolvedValueOnce({});

      const res = await register({ deviceName: 'iPhone', deviceOS: 'ios', deviceId: 'dev-1' });

      expect(res).toEqual({ isNewDevice: false });
      expect(mockPrismaService.deviceSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { merchantId: 'm1', deviceId: 'dev-1' } }),
      );
      expect(mockPrismaService.deviceSession.create).not.toHaveBeenCalled();
      expect(mockPrismaService.deviceSession.findMany).not.toHaveBeenCalled();
    });

    it('without deviceId (old app) recognises the device by name + OS', async () => {
      mockPrismaService.deviceSession.findFirst.mockResolvedValueOnce({ id: 'row-2' });
      mockPrismaService.deviceSession.update.mockResolvedValueOnce({});

      const res = await register({ deviceName: 'iPhone', deviceOS: 'ios' });

      expect(res).toEqual({ isNewDevice: false });
      expect(mockPrismaService.deviceSession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { merchantId: 'm1', deviceId: null, deviceName: 'iPhone', deviceOS: 'ios' } }),
      );
    });

    it('creates a row for an unknown device and evicts beyond the cap', async () => {
      mockPrismaService.deviceSession.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.deviceSession.create.mockResolvedValueOnce({});
      mockPrismaService.deviceSession.findMany.mockResolvedValueOnce([]);

      const res = await register({ deviceName: 'Pixel', deviceOS: 'android', deviceId: 'dev-2' });

      expect(res).toEqual({ isNewDevice: true });
      expect(mockPrismaService.deviceSession.create).toHaveBeenCalled();
      expect(mockPrismaService.deviceSession.findMany).toHaveBeenCalled();
    });
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('revokes the session but keeps the device known (no new-sign-in alert on re-login)', async () => {
      mockPrismaService.deviceSession.updateMany.mockResolvedValue({ count: 1 });

      const result = await sessions.logout('session-uuid-123');

      expect(mockPrismaService.deviceSession.updateMany).toHaveBeenCalledWith({
        where: { tokenId: 'session-uuid-123' },
        data: { tokenId: null, refreshTokenHash: null, isCurrentDevice: false },
      });
      expect(mockPrismaService.deviceSession.deleteMany).not.toHaveBeenCalled();
      expect(result.message).toBe('Déconnecté');
    });

    it('returns success even if no sessionId provided', async () => {
      const result = await sessions.logout(undefined);
      expect(result.message).toBe('Déconnecté');
      expect(mockPrismaService.deviceSession.updateMany).not.toHaveBeenCalled();
    });
  });

  // ── refreshWithToken ───────────────────────────────────────────────────────

  describe('refreshWithToken()', () => {
    const { createHash } = jest.requireActual<typeof import('crypto')>('crypto');
    const RT = 'refresh-token-plain';
    const RT_HASH = createHash('sha256').update(RT).digest('hex');
    const baseSession = {
      id: 'session-row-1',
      merchantId: mockMerchant.id,
      refreshTokenHash: RT_HASH,
      userType: 'merchant',
      userEmail: mockMerchant.email,
      userName: mockMerchant.nom,
    };

    it('rotates the session conditioned on the previous refresh hash', async () => {
      mockPrismaService.deviceSession.findUnique.mockResolvedValueOnce(baseSession);
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce(mockMerchant);
      mockPrismaService.deviceSession.updateMany.mockResolvedValueOnce({ count: 1 });

      const result = await sessions.refreshWithToken(RT, 'old-session-id');

      expect(mockPrismaService.deviceSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: baseSession.id, refreshTokenHash: RT_HASH } }),
      );
      expect(result.refresh_token).toBeDefined();
      expect(result.session_id).not.toBe('old-session-id');
    });

    it('rejects when a concurrent refresh already rotated the session', async () => {
      mockPrismaService.deviceSession.findUnique.mockResolvedValueOnce(baseSession);
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce(mockMerchant);
      mockPrismaService.deviceSession.updateMany.mockResolvedValueOnce({ count: 0 });

      await expect(sessions.refreshWithToken(RT, 'old-session-id')).rejects.toThrow(UnauthorizedException);
    });

    it('keeps the team member identity in the refreshed token', async () => {
      mockPrismaService.deviceSession.findUnique.mockResolvedValueOnce({
        ...baseSession,
        userType: 'team_member',
        userEmail: 'alice@jitplus.com',
      });
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce(mockMerchant);
      mockPrismaService.teamMember.findUnique.mockResolvedValueOnce({
        id: 'member-1', nom: 'Alice', isActive: true, merchantId: mockMerchant.id,
      });
      mockPrismaService.deviceSession.updateMany.mockResolvedValueOnce({ count: 1 });

      await sessions.refreshWithToken(RT, 'old-session-id');

      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'team_member', teamMemberId: 'member-1', teamMemberName: 'Alice' }),
      );
    });

    it('revokes the session of a deactivated team member instead of refreshing it', async () => {
      mockPrismaService.deviceSession.findUnique.mockResolvedValueOnce({
        ...baseSession,
        userType: 'team_member',
        userEmail: 'alice@jitplus.com',
      });
      mockPrismaService.merchant.findUnique.mockResolvedValueOnce(mockMerchant);
      mockPrismaService.teamMember.findUnique.mockResolvedValueOnce({
        id: 'member-1', nom: 'Alice', isActive: false, merchantId: mockMerchant.id,
      });
      mockPrismaService.deviceSession.delete.mockResolvedValueOnce({});

      await expect(sessions.refreshWithToken(RT, 'old-session-id')).rejects.toThrow(UnauthorizedException);
      expect(mockPrismaService.deviceSession.delete).toHaveBeenCalledWith({ where: { id: baseSession.id } });
      expect(mockPrismaService.deviceSession.updateMany).not.toHaveBeenCalled();
      expect(mockJwtService.sign).not.toHaveBeenCalled();
    });
  });

  // ── register ───────────────────────────────────────────────────────────────
  describe('register()', () => {
    // A `mockRejectedValueOnce` left unused by a failing test must not leak into the next one.
    beforeEach(() => mockPrismaService.merchant.create.mockReset());

    it('throws ConflictException when the DB raises P2002 on email uniqueness', async () => {
      // Uniqueness is now enforced solely by the DB unique constraint (P2002 catch);
      // there is no pre-check findUnique, which would create a TOCTOU window under
      // concurrent submits.
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`email`)',
        { code: 'P2002', clientVersion: 'test' } as any,
      );
      mockPrismaService.merchant.create.mockRejectedValueOnce(p2002);

      await expect(
        signupService.register({
          nom: 'Test',
          email: 'test@jitplus.com',
          password: 'ValidPass1!',
          phoneNumber: '+212600000000',
          categorie: 'CAFE' as any,
          ville: 'Casablanca',
          termsAccepted: true,
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('saves the language picked at signup on the merchant', async () => {
      // Stop the flow right after the insert: only its payload matters here.
      mockPrismaService.merchant.create.mockRejectedValueOnce(new Error('stop'));
      const base = { nom: 'Test', email: 'lang@jitplus.com', password: 'ValidPass1!', phoneNumber: '+212600000000', termsAccepted: true };

      await expect(signupService.register({ ...base, language: 'ar' } as any)).rejects.toThrow();
      expect(mockPrismaService.merchant.create.mock.calls[0][0].data.language).toBe('ar');
    });

    it('keeps the default language when none is sent', async () => {
      mockPrismaService.merchant.create.mockRejectedValueOnce(new Error('stop'));
      const base = { nom: 'Test', email: 'nolang@jitplus.com', password: 'ValidPass1!', phoneNumber: '+212600000000', termsAccepted: true };

      await expect(signupService.register(base as any)).rejects.toThrow();
      expect(mockPrismaService.merchant.create.mock.calls[0][0].data).not.toHaveProperty('language');
    });

    const signup = { nom: 'Test', email: 'new@jitplus.com', password: 'ValidPass1!', phoneNumber: '+212600000000', termsAccepted: true };

    it('refuses a phone number already used by another merchant', async () => {
      mockPrismaService.merchant.findFirst.mockResolvedValueOnce({ id: 'other' });

      await expect(signupService.register(signup as any)).rejects.toThrow(ConflictException);
      expect(mockPrismaService.merchant.create).not.toHaveBeenCalled();
    });

    it('applies the content policy to the business name', async () => {
      await expect(signupService.register({ ...signup, nomCommerce: 'heil hitler shop' } as any)).rejects.toThrow(BadRequestException);
      expect(mockPrismaService.merchant.create).not.toHaveBeenCalled();
    });

    it('ignores a logo URL sent at signup', async () => {
      mockPrismaService.merchant.create.mockRejectedValueOnce(new Error('stop'));
      await expect(signupService.register({ ...signup, logoUrl: 'https://evil.example/x.png' } as any)).rejects.toThrow();
      expect(mockPrismaService.merchant.create.mock.calls[0][0].data).not.toHaveProperty('logoUrl');
    });

    it('opens the session right away when the app sends its device', async () => {
      mockPrismaService.merchant.create.mockResolvedValueOnce({ id: 'm1', email: signup.email, nom: 'Test', language: 'fr', stores: [] });

      const res = await signupService.register({ ...signup, deviceName: 'Pixel 7', deviceOS: 'android' } as any);

      expect(res.access_token).toBe('mock-jwt-token');
      expect(res.refresh_token).toEqual(expect.any(String));
      expect(res.requiresEmailVerification).toBe(false);
    });

    it('returns no session for older apps that do not send their device', async () => {
      mockPrismaService.merchant.create.mockResolvedValueOnce({ id: 'm1', email: signup.email, nom: 'Test', language: 'fr', stores: [] });

      const res = await signupService.register(signup as any);

      expect(res.access_token).toBeUndefined();
      expect(mockPrismaService.deviceSession.create).not.toHaveBeenCalled();
    });
  });
});
