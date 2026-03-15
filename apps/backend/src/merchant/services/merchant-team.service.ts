import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  TEAM_MEMBER_REPOSITORY, type ITeamMemberRepository,
  MERCHANT_REPOSITORY, type IMerchantRepository,
} from '../../common/repositories';
import { CreateTeamMemberDto } from '../dto/create-team-member.dto';
import { UpdateTeamMemberDto } from '../dto/update-team-member.dto';
import * as bcrypt from 'bcryptjs';
import { BCRYPT_SALT_ROUNDS } from '../../common/constants';
import { stripUndefined } from '../../common/utils';

@Injectable()
export class MerchantTeamService {
  constructor(
    @Inject(TEAM_MEMBER_REPOSITORY) private teamMemberRepo: ITeamMemberRepository,
    @Inject(MERCHANT_REPOSITORY) private merchantRepo: IMerchantRepository,
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

    return members.map((m) => ({
      ...m,
      transactionsCount: m._count.transactions,
      _count: undefined,
    }));
  }

  async createTeamMember(merchantId: string, dto: CreateTeamMemberDto) {
    const [existingMerchant, existingMember] = await Promise.all([
      this.merchantRepo.findUnique({
        where: { email: dto.email },
        select: { id: true },
      }),
      this.teamMemberRepo.findUnique({
        where: { email: dto.email },
        select: { id: true },
      }),
    ]);
    if (existingMerchant) {
      throw new ConflictException('Cet email est déjà utilisé par un commerçant');
    }
    if (existingMember) {
      throw new ConflictException("Cet email est déjà utilisé par un membre d'équipe");
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    return this.teamMemberRepo.create({
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
    return { success: true, message: "Membre d'équipe supprimé" };
  }
}
