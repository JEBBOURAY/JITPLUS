import type { Merchant, Reward } from '@/types';
import { countSocials } from '@/components/stores/brand';
import type { SetupStepId } from '@/components/setup/setupSteps';

/** What the recap page checks, from the merchant's saved data. */
export type SetupItemId = 'logo' | 'cover' | 'reward' | 'about' | 'social' | 'gallery';

export const SETUP_ITEMS: readonly SetupItemId[] = ['logo', 'cover', 'reward', 'about', 'social', 'gallery'];

/** Wizard page where each item is set. */
export const SETUP_ITEM_STEP: Record<SetupItemId, SetupStepId> = {
  logo: 'brand',
  cover: 'brand',
  reward: 'reward',
  about: 'about',
  social: 'social',
  gallery: 'gallery',
};

type SetupStatus = Record<SetupItemId, boolean>;

type StatusSource = Pick<Merchant, 'logoUrl' | 'coverUrl' | 'description' | 'tagline' | 'socialLinks' | 'gallery'>;

export function computeSetupStatus(merchant: StatusSource, rewards: readonly Reward[] | undefined): SetupStatus {
  return {
    logo: !!merchant.logoUrl,
    cover: !!merchant.coverUrl,
    reward: (rewards?.length ?? 0) > 0,
    about: !!merchant.description?.trim() || !!merchant.tagline?.trim(),
    social: countSocials(merchant.socialLinks) > 0,
    gallery: (merchant.gallery?.length ?? 0) > 0,
  };
}

export function countSetupDone(status: SetupStatus): { done: number; total: number } {
  const done = SETUP_ITEMS.filter((id) => status[id]).length;
  return { done, total: SETUP_ITEMS.length };
}
