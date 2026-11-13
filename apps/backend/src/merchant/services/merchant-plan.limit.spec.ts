import { ForbiddenException } from '@nestjs/common';
import { MerchantPlanService } from './merchant-plan.service';
import { FREE_MAX_CLIENTS } from '../../common/constants';

function setup() {
  const merchantRepo = { findUniqueOrThrow: jest.fn().mockResolvedValue({ plan: 'FREE', planExpiresAt: null, planActivatedByAdmin: false, trialStartedAt: null }) };
  const loyaltyCardRepo = { count: jest.fn().mockResolvedValue(0) };
  const cache = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), del: jest.fn() };
  const service = new MerchantPlanService(
    merchantRepo as never, loyaltyCardRepo as never, cache as never,
    {} as never, {} as never, {} as never, {} as never, {} as never,
  );
  return { service, merchantRepo, loyaltyCardRepo };
}

describe('MerchantPlanService.assertCanAddClient', () => {
  it('inside a transaction: counts with the tx client and trusts the given plan (no second connection)', async () => {
    const { service, merchantRepo, loyaltyCardRepo } = setup();
    const tx = { loyaltyCard: { count: jest.fn().mockResolvedValue(3) } };
    await service.assertCanAddClient('m1', { tx, plan: 'FREE' });
    expect(tx.loyaltyCard.count).toHaveBeenCalledWith({ where: { merchantId: 'm1', deactivatedAt: null } });
    expect(loyaltyCardRepo.count).not.toHaveBeenCalled();
    expect(merchantRepo.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('skips the count for PREMIUM and blocks FREE at the limit', async () => {
    const { service } = setup();
    const tx = { loyaltyCard: { count: jest.fn().mockResolvedValue(FREE_MAX_CLIENTS) } };
    await expect(service.assertCanAddClient('m1', { tx, plan: 'PREMIUM' })).resolves.toBeUndefined();
    expect(tx.loyaltyCard.count).not.toHaveBeenCalled();
    await expect(service.assertCanAddClient('m1', { tx, plan: 'FREE' })).rejects.toThrow(ForbiddenException);
  });

  it('outside a transaction: resolves the plan and uses the global repository', async () => {
    const { service, merchantRepo, loyaltyCardRepo } = setup();
    await service.assertCanAddClient('m1');
    expect(merchantRepo.findUniqueOrThrow).toHaveBeenCalled();
    expect(loyaltyCardRepo.count).toHaveBeenCalled();
  });
});
