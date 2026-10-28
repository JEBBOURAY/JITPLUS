import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { JitLock } from '@/components/icons';
import { LinearGradient } from 'expo-linear-gradient';
import { palette, useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { font } from '@/constants/design';

const GOLD_FG = '#B45309';
const GOLD_GRADIENT = [palette.gold, palette.goldDeep] as const;
const GRADIENT_START = { x: 0, y: 0 };
const GRADIENT_END = { x: 1, y: 0 };

type Variant = 'gold' | 'premium' | 'primary' | 'goldGradient';

interface Props {
  /** Show a lock: the feature is not available on the current plan. */
  locked?: boolean;
  /**
   * `premium`: violet badge for the dark premium surfaces. `primary`: theme accent.
   * `goldGradient`: gold pill for dark cards.
   */
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
}

/** The single "Pro" marker used everywhere a feature belongs to the Pro plan. */
export function ProBadge({ locked = false, variant = 'gold', style }: Props) {
  const { t } = useLanguage();
  const theme = useTheme();
  const primary = variant === 'primary';
  return (
    <View style={[styles.badge, BADGE[variant], primary && { backgroundColor: theme.primaryBg }, style]}>
      {variant === 'goldGradient' && (
        <LinearGradient colors={GOLD_GRADIENT} start={GRADIENT_START} end={GRADIENT_END} style={StyleSheet.absoluteFill} />
      )}
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
  clip: { overflow: 'hidden' },
  label: { fontSize: 11, fontFamily: font.semibold },
  labelGold: { color: GOLD_FG },
  labelPremium: { color: palette.violetLight },
  labelCharbon: { color: palette.charbon },
});

const BADGE = { gold: styles.gold, premium: styles.premium, primary: undefined, goldGradient: styles.clip };
const LABEL = { gold: styles.labelGold, premium: styles.labelPremium, primary: undefined, goldGradient: styles.labelCharbon };
const LOCK_FG = { gold: GOLD_FG, premium: palette.violetLight, goldGradient: palette.charbon };
