import { JitCard, JitGift, JitMessages, JitPoster, JitRoller, JitScan, JitStore } from '@/components/icons';
import type { LucideIcon } from '@/components/home/PromoSheet';
import type { GuideStepId } from '@/components/home/useGuideProgress';

/** Icon (step row and footer button) and i18n suffix (`home.guideStep<key><Title|Text|Cta>`) of each guide step. */
export const GUIDE_STEP_META: Record<GuideStepId, { Icon: LucideIcon; key: string }> = {
  program: { Icon: JitCard, key: 'Program' },
  logo: { Icon: JitStore, key: 'Logo' },
  shop: { Icon: JitRoller, key: 'Shop' },
  invite: { Icon: JitPoster, key: 'Invite' },
  scan: { Icon: JitScan, key: 'Scan' },
  reward: { Icon: JitGift, key: 'Reward' },
  message: { Icon: JitMessages, key: 'Message' },
};

export type GuideStepPart = 'Title' | 'Text' | 'Cta';

export const guideStepKey = (id: GuideStepId, part: GuideStepPart) =>
  `home.guideStep${GUIDE_STEP_META[id].key}${part}`;
