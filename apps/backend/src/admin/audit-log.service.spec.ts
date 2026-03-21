import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogService, AuditLogContext } from './audit-log.service';
import { AuditAction } from '@prisma/client';
import { AUDIT_LOG_REPOSITORY } from '../common/repositories';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockCtx: AuditLogContext = {
  adminId: 'admin-uuid-1',
  adminEmail: 'admin@jitplus.com',
  ipAddress: '1.2.3.4',
  userAgent: 'Mozilla/5.0',
};

const mockAuditLog = {
  id: 'log-uuid-1',
  adminId: mockCtx.adminId,
  adminEmail: mockCtx.adminEmail,
  action: AuditAction.ADMIN_LOGIN,
  targetType: 'ADMIN',
  targetId: null,
  targetLabel: null,
  metadata: null,
  ipAddress: mockCtx.ipAddress,
  userAgent: mockCtx.userAgent,
  createdAt: new Date('2025-01-15'),
};

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockAuditLogRepo = {
  create: jest.fn(),
  findMany: jest.fn(),
  count: jest.fn(),
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('AuditLogService', () => {
  let service: AuditLogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: AUDIT_LOG_REPOSITORY, useValue: mockAuditLogRepo },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    jest.clearAllMocks();
  });

  // ── log ────────────────────────────────────────────────────────────────────

  describe('log()', () => {
    it('creates an audit log entry with full data', async () => {
      mockAuditLogRepo.create.mockResolvedValue(mockAuditLog);

      await service.log({
        ctx: mockCtx,
        action: AuditAction.ADMIN_LOGIN,
        targetType: 'ADMIN',
        targetId: undefined,
        targetLabel: undefined,
        metadata: { browser: 'Chrome' },
      });

      expect(mockAuditLogRepo.create).toHaveBeenCalledWith({
        data: {
          adminId: mockCtx.adminId,
          adminEmail: mockCtx.adminEmail,
          action: AuditAction.ADMIN_LOGIN,
          targetType: 'ADMIN',
          targetId: null,
          targetLabel: null,
          metadata: { browser: 'Chrome' },
          ipAddress: mockCtx.ipAddress,
          userAgent: mockCtx.userAgent,
        },
      });
    });

    it('creates an entry without optional fields', async () => {
      mockAuditLogRepo.create.mockResolvedValue(mockAuditLog);

      await service.log({
        ctx: { adminId: 'admin-1', adminEmail: 'a@a.com' },
        action: AuditAction.BAN_MERCHANT,
        targetType: 'MERCHANT',
        targetId: 'merchant-1',
        targetLabel: 'Test Commerce',
      });

      expect(mockAuditLogRepo.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ipAddress: null,
          userAgent: null,
        }),
      });
    });

    it('does NOT throw when prisma.create fails — swallows the error silently', async () => {
      mockAuditLogRepo.create.mockRejectedValue(new Error('DB connection lost'));

      await expect(
        service.log({
          ctx: mockCtx,
          action: AuditAction.ACTIVATE_PREMIUM,
          targetType: 'MERCHANT',
        }),
      ).resolves.not.toThrow();
    });
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('returns paginated logs with metadata', async () => {
      mockAuditLogRepo.findMany.mockResolvedValue([mockAuditLog]);
      mockAuditLogRepo.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.logs).toEqual([mockAuditLog]);
      expect(result.pagination).toEqual({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('uses default page=1 and limit=50 when not specified', async () => {
      mockAuditLogRepo.findMany.mockResolvedValue([]);
      mockAuditLogRepo.count.mockResolvedValue(0);

      await service.findAll({});

      expect(mockAuditLogRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 50 }),
      );
    });

    it('caps limit at 200 regardless of input', async () => {
      mockAuditLogRepo.findMany.mockResolvedValue([]);
      mockAuditLogRepo.count.mockResolvedValue(0);

      await service.findAll({ limit: 9999 });

      expect(mockAuditLogRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });

    it('calculates correct skip for page 2', async () => {
      mockAuditLogRepo.findMany.mockResolvedValue([]);
      mockAuditLogRepo.count.mockResolvedValue(0);

      await service.findAll({ page: 2, limit: 10 });

      expect(mockAuditLogRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('applies action filter when provided', async () => {
      mockAuditLogRepo.findMany.mockResolvedValue([]);
      mockAuditLogRepo.count.mockResolvedValue(0);

      await service.findAll({ action: AuditAction.BAN_MERCHANT });

      expect(mockAuditLogRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: AuditAction.BAN_MERCHANT }),
        }),
      );
    });

    it('applies date range filter when from and to are provided', async () => {
      mockAuditLogRepo.findMany.mockResolvedValue([]);
      mockAuditLogRepo.count.mockResolvedValue(0);

      const from = new Date('2025-01-01');
      const to = new Date('2025-01-31');
      await service.findAll({ from, to });

      expect(mockAuditLogRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: from, lte: to },
          }),
        }),
      );
    });

    it('calculates totalPages correctly', async () => {
      mockAuditLogRepo.findMany.mockResolvedValue([]);
      mockAuditLogRepo.count.mockResolvedValue(55);

      const result = await service.findAll({ limit: 20 });

      expect(result.pagination.totalPages).toBe(3); // ceil(55/20)
    });
  });
});
