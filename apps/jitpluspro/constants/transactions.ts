import { X, RefreshCw, Gift, SlidersHorizontal, TrendingUp, Disc3 } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import type { TransactionType } from '@/types';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface TransactionTypeConfig {
  icon: LucideIcon;
  color: (theme: ThemeColors) => string;
  sign: '+' | '-' | '';
}

export const TRANSACTION_TYPE_CONFIG: Record<TransactionType, TransactionTypeConfig> = {
  EARN_POINTS: {
    icon: TrendingUp,
    color: (theme) => theme.primary,
    sign: '+',
  },
  REDEEM_REWARD: {
    icon: Gift,
    color: (theme) => theme.accent,
    sign: '-',
  },
  ADJUST_POINTS: {
    icon: SlidersHorizontal,
    color: (theme) => theme.textMuted,
    sign: '',
  },
  LOYALTY_PROGRAM_CHANGE: {
    icon: RefreshCw,
    color: (theme) => theme.primary,
    sign: '',
  },
  LUCKY_WHEEL_WIN: {
    icon: Disc3,
    color: (theme) => theme.accent,
    sign: '',
  },
};

/** Returns the config for a transaction type, with cancelled override */
export function getTransactionConfig(
  type: TransactionType,
  isCancelled: boolean,
  theme: ThemeColors,
) {
  const config = TRANSACTION_TYPE_CONFIG[type];
  return {
    icon: isCancelled ? X : config.icon,
    color: isCancelled ? theme.danger : config.color(theme),
    sign: isCancelled ? '' : config.sign,
  };
}
