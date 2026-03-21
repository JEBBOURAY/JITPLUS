import { Injectable, Logger, Inject } from '@nestjs/common';
import { AuditAction, AuditTargetType, Prisma } from '@prisma/client';
import { AUDIT_LOG_REPOSITORY, type IAuditLogRepository } from '../common/repositories';

export { AuditAction, AuditTargetType };

export interface AuditLogContext {
  adminId: string;
  adminEmail: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface LogEntryInput {
  ctx: AuditLogContext;
  action: AuditAction;
  targetType: AuditTargetType;
  targetId?: string;
  targetLabel?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @Inject(AUDIT_LOG_REPOSITORY) private readonly auditLogRepo: IAuditLogRepository,
  ) {}

  /**
   * Write a single audit log entry.
   * Errors are caught and only logged — never thrown — so they can never
   * interrupt a business transaction.
   */
  async log(input: LogEntryInput): Promise<void> {
    try {
      await this.auditLogRepo.create({
        data: {
          adminId: input.ctx.adminId,
          adminEmail: input.ctx.adminEmail,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          targetLabel: input.targetLabel ?? null,
          metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
          ipAddress: input.ctx.ipAddress ?? null,
          userAgent: input.ctx.userAgent ?? null,
        },
      });
    } catch (err) {
      // Non-blocking: log the failure but never propagate it
      this.logger.error(
        `Failed to write audit log [${input.action}] for target ${input.targetId}: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Retrieve paginated audit logs with optional filters.
   */
  async findAll(opts: {
    page?: number;
    limit?: number;
    action?: AuditAction;
    adminId?: string;
    targetType?: AuditTargetType;
    targetId?: string;
    from?: Date;
    to?: Date;
  }) {
    const page = opts.page ?? 1;
    const limit = Math.min(opts.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      ...(opts.action && { action: opts.action }),
      ...(opts.adminId && { adminId: opts.adminId }),
      ...(opts.targetType && { targetType: opts.targetType }),
      ...(opts.targetId && { targetId: opts.targetId }),
      ...((opts.from || opts.to) && {
        createdAt: {
          ...(opts.from && { gte: opts.from }),
          ...(opts.to && { lte: opts.to }),
        },
      }),
    };

    const [logs, total] = await Promise.all([
      this.auditLogRepo.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.auditLogRepo.count({ where }),
    ]);

    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
