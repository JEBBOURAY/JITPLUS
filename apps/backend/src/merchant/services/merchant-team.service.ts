import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  TEAM_MEMBER_REPOSITORY, type ITeamMemberRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
  TRANSACTION_RUNNER, type ITransactionRunner,
} from '../../common/repositories';
import { AuditLogService, AuditAction, AuditTargetType } from '../../admin/audit-log.service';
import { CreateTeamMemberDto } from '../dto/create-team-member.dto';
import { UpdateTeamMemberDto } from '../dto/update-team-member.dto';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_SALT_ROUNDS } from '../../common/constants';
import { stripUndefined } from '../../common/utils';
import { withRetry } from '../../common/utils/retry-transaction.helper';

@Injectable()
export class MerchantTeamService {
  constructor(
    @Inject(TEAM_MEMBER_REPOSITORY) private teamMemberRepo: ITeamMemberRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
    @Inject(TRANSACTION_RUNNER) private txRunner: ITransactionRunner,
    private auditLogService: AuditLogService,
  ) {}

  async getTeamMembers(merchantId: string) {
    const members = await this.teamMemberRepo.findMany({
      where: { merchantId },
      select: {
        id: true,
        nom: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { transactions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return members.map((m: any) => ({
      ...m,
      transactionsCount: m._count.transactions,
      _count: undefined,
    }));
  }

  async createTeamMember(merchantId: string, dto: CreateTeamMemberDto) {
    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    // Wrap uniqueness checks + insert in a Serializable transaction so two
    // concurrent invocations can't both pass the SELECT and then collide on
    // the INSERT (which would surface as an opaque 500 P2002 to the second
    // caller). The unique constraint is the real safety net; the SELECTs are
    // kept for friendly error messages.
    const member = await withRetry(() =>
      this.txRunner.run(async (tx) => {
        const [existingMerchant, existingMember] = await Promise.all([
          tx.merchant.findUnique({ where: { email: dto.email }, select: { id: true } }),
          tx.teamMember.findUnique({ where: { email: dto.email }, select: { id: true } }),
        ]);
        if (existingMerchant) {
          throw new ConflictException('Cet email est déjà utilisé par un commerçant');
        }
        if (existingMember) {
          throw new ConflictException("Cet email est déjà utilisé par un membre d'équipe");
        }

        try {
          return await tx.teamMember.create({
            data: {
              merchantId,
              nom: dto.nom,
              email: dto.email,
              password: hashedPassword,
            },
            select: {
              id: true,
              nom: true,
              email: true,
              role: true,
              isActive: true,
              createdAt: true,
            },
          });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            throw new ConflictException('Cet email est déjà utilisé');
          }
          throw err;
        }
      }, { isolationLevel: 'Serializable' }),
    );

    this.auditLogService.log({
      ctx: { actorType: 'MERCHANT', merchantId },
      action: AuditAction.CREATE_TEAM_MEMBER,
      targetType: AuditTargetType.MERCHANT,
      targetId: member.id,
      targetLabel: `${dto.nom} (${dto.email})`,
    });

    return member;
  }

  async updateTeamMember(merchantId: string, memberId: string, dto: UpdateTeamMemberDto) {
    const member = await this.teamMemberRepo.findUnique({
      where: { id: memberId },
      select: { id: true, merchantId: true, email: true },
    });

    if (!member || member.merchantId !== merchantId) {
      throw new NotFoundException("Membre d'équipe non trouvé");
    }

    if (dto.email && dto.email !== member.email) {
      const [existingMerchant, existingMember] = await Promise.all([
        this.merchantRepo.findUnique({
          where: { email: dto.email },
          select: { id: true },
        }),
        this.teamMemberRepo.findFirst({
          where: { email: dto.email, id: { not: memberId } },
          select: { id: true },
        }),
      ]);
      if (existingMerchant) {
        throw new ConflictException('Cet email est déjà utilisé');
      }
      if (existingMember) {
        throw new ConflictException('Cet email est déjà utilisé');
      }
    }

    const data: Record<string, unknown> = stripUndefined(
      Object.fromEntries(
        Object.entries(dto).filter(([key]) => key !== 'password'),
      ),
    );
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    }

    return this.teamMemberRepo.update({
      where: { id: memberId },
      data,
      select: {
        id: true,
        nom: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteTeamMember(merchantId: string, memberId: string) {
    const member = await this.teamMemberRepo.findUnique({
      where: { id: memberId },
      select: { id: true, merchantId: true },
    });

    if (!member || member.merchantId !== merchantId) {
      throw new NotFoundException("Membre d'équipe non trouvé");
    }

    await this.teamMemberRepo.delete({ where: { id: memberId } });

    this.auditLogService.log({
      ctx: { actorType: 'MERCHANT', merchantId },
      action: AuditAction.DELETE_TEAM_MEMBER,
      targetType: AuditTargetType.MERCHANT,
      targetId: memberId,
    });

    return { success: true, message: "Membre d'équipe supprimé" };
  }
}
