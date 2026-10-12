import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CouponRewardType,
  CouponSource,
  CouponStatus,
  ScratchAudienceType,
  ScratchCampaignStatus,
  ScratchCardStatus,
} from '@prisma/client';
import { COUPON_REWARD_TYPES, SCRATCH_AUDIENCE_TYPES } from './dto';
import { SCRATCH_LIMITS } from './scratch-limits';

// The backend cannot import packages/shared (outside rootDir and the Docker
// image), so the shared source is read as text to detect drift.
const SHARED_DIR = join(__dirname, '../../../../packages/shared/src/scratch');
const sharedTypes = readFileSync(join(SHARED_DIR, 'types.ts'), 'utf8');
const sharedConstants = readFileSync(join(SHARED_DIR, 'constants.ts'), 'utf8');

function sharedArray(name: string): string[] {
  const match = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(sharedTypes);
  if (!match) throw new Error(`${name} not found in shared/scratch/types.ts`);
  return [...match[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
}

describe('scratch enums stay in sync (Prisma ↔ shared ↔ DTO)', () => {
  it.each([
    ['SCRATCH_CAMPAIGN_STATUSES', Object.values(ScratchCampaignStatus)],
    ['SCRATCH_CARD_STATUSES', Object.values(ScratchCardStatus)],
    ['SCRATCH_AUDIENCE_TYPES', Object.values(ScratchAudienceType)],
    ['COUPON_REWARD_TYPES', Object.values(CouponRewardType)],
    ['COUPON_STATUSES', Object.values(CouponStatus)],
    ['COUPON_SOURCES', Object.values(CouponSource)],
  ])('%s', (name, prismaValues) => {
    expect(sharedArray(name)).toEqual(prismaValues);
  });

  it('DTO lists match Prisma', () => {
    expect([...COUPON_REWARD_TYPES]).toEqual(Object.values(CouponRewardType));
    expect([...SCRATCH_AUDIENCE_TYPES]).toEqual(Object.values(ScratchAudienceType));
  });

  it('limits match the shared constants', () => {
    for (const [key, value] of Object.entries(SCRATCH_LIMITS)) {
      const match = new RegExp(`\\b${key}: ([\\d_]+)`).exec(sharedConstants);
      expect({ key, value: match ? Number(match[1].replace(/_/g, '')) : undefined }).toEqual({ key, value });
    }
  });
});
