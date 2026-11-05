import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StampCodesService, currentMonthWindow } from './stamp-codes.service';
import { StampCodeTokenService } from './stamp-code-token.service';
import { FREE_MAX_STAMP_CODES_PER_MONTH } from '../common/constants';

function setup(plan: 'FREE' | 'PREMIUM', usedThisMonth: number) {
  const created: any[] = [];
  const tx = {
    stampCode: {
      count: jest.fn().mockResolvedValue(usedThisMonth),
      createMany: jest.fn(({ data }) => { created.push(...data); return Promise.resolve({ count: data.length }); }),
    },
  };
  const prisma = {
    merchant: { findUnique: jest.fn().mockResolvedValue({ isActive: true, deletedAt: null, amountPerStamp: 50 }) },
    stampCode: {
      count: jest.fn().mockResolvedValue(usedThisMonth),
      findMany: jest.fn(() => Promise.resolve(created.map((c) => ({
        ...c, status: 'ACTIVE', createdAt: new Date(), redeemedAt: null, redeemedByClient: null,
      })))),
    },
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const planService = { resolveEffectivePlan: jest.fn().mockResolvedValue({ plan }) };
  const audit = { log: jest.fn() };
  const tokens = new StampCodeTokenService({ getOrThrow: () => 'a'.repeat(32) } as unknown as ConfigService);
  const service = new StampCodesService(prisma as any, planService as any, tokens, audit as any);
  return { service, tx, audit, created };
}

describe('StampCodesService', () => {
  it('creates a batch of codes with a printable link each', async () => {
    const { service, audit } = setup('PREMIUM', 0);
    const batch = await service.createBatch('m1', { label: 'Colis', quantity: 3, stamps: 2 });
    expect(batch).toMatchObject({ label: 'Colis', stamps: 2, total: 3, active: 3 });
    expect(batch.codes.every((c) => c.url?.includes('/q/sc1.'))).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE_STAMP_CODES' }));
  });

  it('converts an order amount into stamps with the merchant rule', async () => {
    const { service, created } = setup('PREMIUM', 0);
    await service.createBatch('m1', { label: 'Commande 1042', quantity: 1, amount: 180 });
    expect(created[0]).toMatchObject({ stamps: 3, amount: 180 });
  });

  it('requires exactly one of stamps or amount', async () => {
    const { service } = setup('PREMIUM', 0);
    await expect(service.createBatch('m1', { label: 'x', quantity: 1 })).rejects.toThrow(BadRequestException);
    await expect(service.createBatch('m1', { label: 'x', quantity: 1, stamps: 1, amount: 100 })).rejects.toThrow(BadRequestException);
    await expect(service.createBatch('m1', { label: 'x', quantity: 1, amount: 20 })).rejects.toThrow(BadRequestException);
  });

  it('enforces the FREE monthly allowance', async () => {
    const { service, tx } = setup('FREE', FREE_MAX_STAMP_CODES_PER_MONTH - 2);
    await expect(service.createBatch('m1', { label: 'x', quantity: 3, stamps: 1 })).rejects.toThrow(ForbiddenException);
    expect(tx.stampCode.createMany).not.toHaveBeenCalled();
    await expect(service.createBatch('m1', { label: 'x', quantity: 2, stamps: 1 })).resolves.toMatchObject({ total: 2 });
  });

  it('does not limit PREMIUM merchants', async () => {
    const { service, tx } = setup('PREMIUM', 10_000);
    await service.createBatch('m1', { label: 'x', quantity: 500, stamps: 1 });
    expect(tx.stampCode.count).not.toHaveBeenCalled();
  });

  it('reports the remaining FREE allowance', async () => {
    const { service } = setup('FREE', 4);
    await expect(service.getQuota('m1')).resolves.toMatchObject({ used: 4, limit: 10, remaining: 6 });
    const premium = setup('PREMIUM', 4);
    await expect(premium.service.getQuota('m1')).resolves.toMatchObject({ limit: null, remaining: null });
  });

  it('computes the calendar month in Morocco time', () => {
    // 31 Oct 23:30 UTC is already 1 Nov 00:30 in Morocco
    const { start, end } = currentMonthWindow(Date.UTC(2026, 9, 31, 23, 30));
    expect(start.toISOString()).toBe('2026-10-31T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-30T23:00:00.000Z');
  });
});
