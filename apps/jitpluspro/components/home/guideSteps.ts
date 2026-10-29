import { ImagePlus, Palette, Send } from 'lucide-react-native';
import { JitGift, JitScan, JitStamp } from '@/components/icons';
import type { LucideIcon } from '@/components/home/PromoSheet';
import type { PromoTone } from '@/components/home/promoTones';
import type { GuideStepId } from '@/components/home/useGuideProgress';

/** Icon, tone and i18n suffix (`home.guideStep<key><Title|Text|Cta>`) of each guide step. */
export const GUIDE_STEP_META: Record<GuideStepId, { Icon: LucideIcon; tone: PromoTone; key: string }> = {
  program: { Icon: JitStamp, tone: 'violet', key: 'Program' },
  logo: { Icon: ImagePlus, tone: 'blue', key: 'Logo' },
  shop: { Icon: Palette, tone: 'orange', key: 'Shop' },
  invite: { Icon: JitScan, tone: 'sky', key: 'Invite' },
  scan: { Icon: JitScan, tone: 'emerald', key: 'Scan' },
  reward: { Icon: JitGift, tone: 'amber', key: 'Reward' },
  message: { Icon: Send, tone: 'pink', key: 'Message' },
};

export type GuideStepPart = 'Title' | 'Text' | 'Cta';

export const guideStepKey = (id: GuideStepId, part: GuideStepPart) =>
  `home.guideStep${GUIDE_STEP_META[id].key}${part}`;
