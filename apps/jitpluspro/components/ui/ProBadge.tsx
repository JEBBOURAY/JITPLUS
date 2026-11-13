import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { JitLock } from '@/components/icons';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { font } from '@/constants/design';
import { useAuthStore } from '@/stores/authStore';
import { getPlanStatus } from '@/utils/plan';

const GOLD_FG = '#B45309';

type Variant = 'gold' | 'premium' | 'primary' | 'goldGradient';

interface Props {
  /** Show a lock: the feature is not available on the current plan. */
  locked?: boolean;
  /**
   * `premium`: violet badge for the dark premium surfaces. `primary`: theme accent.
   * `goldGradient`: solid gold pill for dark cards (name kept for callers).
   */
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
}

/** The single "Pro" marker used everywhere a feature belongs to the Pro plan. */
export function ProBadge({ locked = false, variant = 'gold', style }: Props) {
  const { t } = useLanguage();
  const theme = useTheme();
  // Founding members never see the Pro marker: every feature is simply theirs.
  const hidePlan = useAuthStore((s) => getPlanStatus(s.merchant).hidePlan);
  if (hidePlan) return null;
  const primary = variant === 'primary';
  return (
    <View style={[styles.badge, BADGE[variant], primary && { backgroundColor: theme.primaryBg }, style]}>
      {locked && <JitLock size={10} color={primary ? theme.primary : LOCK_FG[variant]} strokeWidth={2} />}
      <Text style={[styles.label, LABEL[variant], primary && { color: theme.primary }]} maxFontSizeMultiplier={1.3}>
        {t('common.pro')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  gold: { backgroundColor: palette.gold + '2E' },
  premium: {
    backgroundColor: palette.premiumBadgeBg,
    borderWidth: 1,
    borderColor: palette.premiumBadgeBorder,
  },
  goldSolid: { backgroundColor: palette.gold },
  label: { fontSize: 11, fontFamily: font.semibold },
  labelGold: { color: GOLD_FG },
  labelPremium: { color: palette.violetLight },
  labelCharbon: { color: palette.charbon },
});

const BADGE = { gold: styles.gold, premium: styles.premium, primary: undefined, goldGradient: styles.goldSolid };
const LABEL = { gold: styles.labelGold, premium: styles.labelPremium, primary: undefined, goldGradient: styles.labelCharbon };
const LOCK_FG = { gold: GOLD_FG, premium: palette.violetLight, goldGradient: palette.charbon };
