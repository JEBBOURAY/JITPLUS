import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ClientAuthService } from './client-auth.service';
import {
  CLIENT_REPOSITORY,
  OTP_REPOSITORY,
} from '../common/repositories';
import { MAIL_PROVIDER, SMS_PROVIDER } from '../common/interfaces';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CLIENT_ID = 'client-uuid-1';
const PHONE = '+212612345678';

const makeClient = (overrides: Record<string, unknown> = {}) => ({
  id: CLIENT_ID,
  nom: 'Test',
  prenom: 'User',
  email: 'test@example.com',
  emailVerified: true,
  telephone: PHONE,
  telephoneVerified: true,
  googleId: null,
  password: null,
  shareInfoMerchants: false,
  notifPush: true,
  notifWhatsapp: true,
  termsAccepted: true,
  dateNaissance: null,
  createdAt: new Date('2025-01-01'),
  refreshTokenHash: 'hashed-refresh-token',
  refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  ...overrides,
});

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockClientRepo = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  upsert: jest.fn(),
};

const mockOtpRepo = {
  findUnique: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  upsert: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-access-token'),
  verify: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    switch (key) {
      case 'GOOGLE_CLIENT_ID': return 'google-client-id';
      case 'APPLE_TEAM_ID': return 'apple-team-id';
      default: return undefined;
    }
  }),
};

const mockMailProvider = {
  sendOtpEmail: jest.fn().mockResolvedValue(true),
  sendWelcomeClient: jest.fn().mockResolvedValue(undefined),
};

const mockSmsProvider = {
  sendWhatsAppOtp: jest.fn().mockResolvedValue(true),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ClientAuthService', () => {
  let service: ClientAuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientAuthService,
        { provide: CLIENT_REPOSITORY, useValue: mockClientRepo },
        { provide: OTP_REPOSITORY, useValue: mockOtpRepo },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MAIL_PROVIDER, useValue: mockMailProvider },
        { provide: SMS_PROVIDER, useValue: mockSmsProvider },
      ],
    }).compile();

    service = module.get<ClientAuthService>(ClientAuthService);
    jest.clearAllMocks();
  });

  // ── logout ─────────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('clears refresh token, expiration and push token', async () => {
      mockClientRepo.update.mockResolvedValue({});

      const result = await service.logout(CLIENT_ID);

      expect(result).toEqual({ success: true, message: 'Déconnexion réussie' });
      expect(mockClientRepo.update).toHaveBeenCalledWith({
        where: { id: CLIENT_ID },
        data: { refreshTokenHash: null, refreshTokenExpiresAt: null, pushToken: null },
      });
    });
  });

  // ── refreshAccessToken ─────────────────────────────────────────────────────

  describe('refreshAccessToken()', () => {
    it('issues new tokens when refresh token is valid', async () => {
      const client = makeClient();
      mockClientRepo.findFirst.mockResolvedValue(client);
      mockClientRepo.update.mockResolvedValue({});

      const result = await service.refreshAccessToken('valid-refresh-token');

      expect(result.access_token).toBeDefined();
      expect(result.refresh_token).toBeDefined();
      expect(result.client.id).toBe(CLIENT_ID);
      // Should rotate — persist new hash
      expect(mockClientRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CLIENT_ID },
          data: expect.objectContaining({
            refreshTokenHash: expect.any(String),
            refreshTokenExpiresAt: expect.any(Date),
          }),
        }),
      );
    });

    it('throws UnauthorizedException when refresh token not found', async () => {
      mockClientRepo.findFirst.mockResolvedValue(null);

      await expect(service.refreshAccessToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException and invalidates expired refresh token', async () => {
      const expiredClient = makeClient({
        refreshTokenExpiresAt: new Date(Date.now() - 1000), // expired
      });
      mockClientRepo.findFirst.mockResolvedValue(expiredClient);
      mockClientRepo.update.mockResolvedValue({});

      await expect(service.refreshAccessToken('expired-token')).rejects.toThrow(
        UnauthorizedException,
      );

      // Should have cleared the expired token
      expect(mockClientRepo.update).toHaveBeenCalledWith({
        where: { id: CLIENT_ID },
        data: { refreshTokenHash: null, refreshTokenExpiresAt: null },
      });
    });
  });

  // ── sendOtp ────────────────────────────────────────────────────────────────

  describe('sendOtp()', () => {
    it('throws BadRequestException for invalid phone format', async () => {
      await expect(service.sendOtp('123')).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when registering with existing phone', async () => {
      mockClientRepo.findUnique.mockResolvedValue({ id: CLIENT_ID });

      await expect(service.sendOtp(PHONE, true)).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when login with non-existing phone', async () => {
      mockClientRepo.findUnique.mockResolvedValue(null);

      await expect(service.sendOtp(PHONE, false)).rejects.toThrow(BadRequestException);
    });

    it('sends OTP via WhatsApp for valid login flow', async () => {
      mockClientRepo.findUnique.mockResolvedValue({ id: CLIENT_ID });
      mockOtpRepo.findUnique.mockResolvedValue(null); // no existing OTP
      mockOtpRepo.upsert.mockResolvedValue({});
      mockSmsProvider.sendWhatsAppOtp.mockResolvedValue(true);

      const result = await service.sendOtp(PHONE, false);

      expect(result).toEqual({ success: true, message: 'Code envoyé avec succès' });
      expect(mockSmsProvider.sendWhatsAppOtp).toHaveBeenCalledWith(
        PHONE,
        expect.any(String), // 6-digit code
      );
    });

    it('throws HttpException when WhatsApp send fails', async () => {
      mockClientRepo.findUnique.mockResolvedValue({ id: CLIENT_ID });
      mockOtpRepo.findUnique.mockResolvedValue(null);
      mockOtpRepo.upsert.mockResolvedValue({});
      mockSmsProvider.sendWhatsAppOtp.mockResolvedValue(false);

      await expect(service.sendOtp(PHONE, false)).rejects.toThrow(HttpException);
    });

    it('rejects OTP spam with cooldown', async () => {
      mockClientRepo.findUnique.mockResolvedValue({ id: CLIENT_ID });
      // OTP was sent recently (expires in future, within cooldown window)
      mockOtpRepo.findUnique.mockResolvedValue({
        telephone: PHONE,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min from now
      });

      await expect(service.sendOtp(PHONE, false)).rejects.toThrow(HttpException);
    });
  });
});
