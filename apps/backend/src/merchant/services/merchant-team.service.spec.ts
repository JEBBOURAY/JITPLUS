import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { MerchantTeamService } from './merchant-team.service';
import { TEAM_MEMBER_REPOSITORY, MERCHANT_REPOSITORY } from '../../common/repositories';
import { AuditLogService } from '../../admin/audit-log.service';
import * as bcrypt from 'bcryptjs';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MERCHANT_ID = 'merchant-uuid-1';
const MEMBER_ID = 'member-uuid-1';

const mockMember = {
  id: MEMBER_ID,
  merchantId: MERCHANT_ID,
  nom: 'Alice Dupont',
  email: 'alice@jitplus.com',
  password: bcrypt.hashSync('Password1!', 4),
  role: 'STAFF',
  isActive: true,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockMerchantRepo = {
  findUnique: jest.fn(),
};

const mockTeamMemberRepo = {
  findMany: jest.fn(),
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('MerchantTeamService', () => {
  let service: MerchantTeamService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantTeamService,
        { provide: TEAM_MEMBER_REPOSITORY, useValue: mockTeamMemberRepo },
        { provide: MERCHANT_REPOSITORY, useValue: mockMerchantRepo },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get<MerchantTeamService>(MerchantTeamService);
    jest.clearAllMocks();
  });

  // ── getTeamMembers ─────────────────────────────────────────────────────────

  describe('getTeamMembers()', () => {
    it('returns members with transactionsCount mapped', async () => {
      mockTeamMemberRepo.findMany.mockResolvedValue([
        { ...mockMember, _count: { transactions: 5 } },
      ]);

      const result = await service.getTeamMembers(MERCHANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0].transactionsCount).toBe(5);
      expect((result[0] as Record<string, unknown>)._count).toBeUndefined();
    });

    it('returns empty array when no members', async () => {
      mockTeamMemberRepo.findMany.mockResolvedValue([]);

      const result = await service.getTeamMembers(MERCHANT_ID);

      expect(result).toEqual([]);
    });
  });

  // ── createTeamMember ───────────────────────────────────────────────────────

  describe('createTeamMember()', () => {
    const dto = {
      nom: 'Bob Martin',
      email: 'bob@jitplus.com',
      password: 'Secur3Pass!',
    };

    it('creates a team member with a hashed password', async () => {
      mockMerchantRepo.findUnique.mockResolvedValue(null);
      mockTeamMemberRepo.findUnique.mockResolvedValue(null);
      mockTeamMemberRepo.create.mockResolvedValue({
        id: 'new-member-id',
        nom: dto.nom,
        email: dto.email,
        role: 'STAFF',
        isActive: true,
        createdAt: new Date(),
      });

      const result = await service.createTeamMember(MERCHANT_ID, dto);

      expect(result.email).toBe(dto.email);
      // Verify create was called with a hashed (not plaintext) password
      const createCall = mockTeamMemberRepo.create.mock.calls[0][0];
      expect(createCall.data.password).not.toBe(dto.password);
      expect(await bcrypt.compare(dto.password, createCall.data.password)).toBe(true);
    });

    it('throws ConflictException if an existing merchant uses the email', async () => {
      mockMerchantRepo.findUnique.mockResolvedValue({ id: 'some-merchant' });
      mockTeamMemberRepo.findUnique.mockResolvedValue(null);

      await expect(service.createTeamMember(MERCHANT_ID, dto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockTeamMemberRepo.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException if an existing team member uses the email', async () => {
      mockMerchantRepo.findUnique.mockResolvedValue(null);
      mockTeamMemberRepo.findUnique.mockResolvedValue({ id: 'existing-member' });

      await expect(service.createTeamMember(MERCHANT_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── updateTeamMember ───────────────────────────────────────────────────────

  describe('updateTeamMember()', () => {
    it('updates the member name and returns result', async () => {
      mockTeamMemberRepo.findUnique.mockResolvedValue({
        id: MEMBER_ID,
        merchantId: MERCHANT_ID,
        email: mockMember.email,
      });
      mockTeamMemberRepo.update.mockResolvedValue({
        ...mockMember,
        nom: 'Alice Martin',
      });

      const result = await service.updateTeamMember(MERCHANT_ID, MEMBER_ID, {
        nom: 'Alice Martin',
      });

      expect(mockTeamMemberRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: MEMBER_ID } }),
      );
      expect(result.nom).toBe('Alice Martin');
    });

    it('throws NotFoundException when member not found', async () => {
      mockTeamMemberRepo.findUnique.mockResolvedValue(null);

      await expect(
        service.updateTeamMember(MERCHANT_ID, MEMBER_ID, { nom: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when member belongs to another merchant', async () => {
      mockTeamMemberRepo.findUnique.mockResolvedValue({
        id: MEMBER_ID,
        merchantId: 'other-merchant',
        email: mockMember.email,
      });

      await expect(
        service.updateTeamMember(MERCHANT_ID, MEMBER_ID, { nom: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('hashes the password when a new password is provided', async () => {
      mockTeamMemberRepo.findUnique.mockResolvedValue({
        id: MEMBER_ID,
        merchantId: MERCHANT_ID,
        email: mockMember.email,
      });
      mockTeamMemberRepo.update.mockResolvedValue(mockMember);

      await service.updateTeamMember(MERCHANT_ID, MEMBER_ID, {
        password: 'NewPass123!',
      });

      const updateCall = mockTeamMemberRepo.update.mock.calls[0][0];
      expect(updateCall.data.password).toBeDefined();
      expect(updateCall.data.password).not.toBe('NewPass123!');
      expect(await bcrypt.compare('NewPass123!', updateCall.data.password as string)).toBe(true);
    });

    it('checks email uniqueness when email is being changed', async () => {
      mockTeamMemberRepo.findUnique.mockResolvedValue({
        id: MEMBER_ID,
        merchantId: MERCHANT_ID,
        email: 'old@jitplus.com',
      });
      mockMerchantRepo.findUnique.mockResolvedValue(null);
      mockTeamMemberRepo.findFirst.mockResolvedValue({ id: 'another-member' });

      await expect(
        service.updateTeamMember(MERCHANT_ID, MEMBER_ID, { email: 'taken@jitplus.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
