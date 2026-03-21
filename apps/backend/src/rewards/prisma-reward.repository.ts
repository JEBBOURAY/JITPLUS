import { Injectable } from '@nestjs/common';
import { Prisma, Reward } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IRewardRepository } from './reward.repository.interface';
import { MAX_REWARD_RESULTS } from '../common/constants';

@Injectable()
export class PrismaRewardRepository implements IRewardRepository {
  constructor(private prisma: PrismaService) {}

  async findMany(filter: Record<string, unknown>): Promise<Reward[]> {
    return this.prisma.reward.findMany({ where: filter as Prisma.RewardWhereInput });
  }

  async findById(id: string): Promise<Reward | null> {
    return this.prisma.reward.findUnique({ where: { id } });
  }

  async create(data: Partial<Reward>): Promise<Reward> {
    return this.prisma.reward.create({ data: data as Prisma.RewardUncheckedCreateInput });
  }

  async update(id: string, data: Partial<Reward>): Promise<Reward> {
    return this.prisma.reward.update({ where: { id }, data });
  }

  async delete(id: string): Promise<Reward> {
    return this.prisma.reward.delete({ where: { id } });
  }

  async findAllByMerchant(merchantId: string, limit = MAX_REWARD_RESULTS): Promise<Reward[]> {
    return this.prisma.reward.findMany({
      where: { merchantId },
      orderBy: { cout: 'asc' },
      take: limit,
    });
  }

  async findOneByMerchant(id: string, merchantId: string): Promise<Reward | null> {
    return this.prisma.reward.findFirst({ where: { id, merchantId } });
  }
}
