import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { JitLock } from '@/components/icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ProBadge } from '@/components/ui/ProBadge';
import { ActionButton } from '@/components/ui/ActionButton';
import { font, icon } from '@/constants/design';
import { radius } from '@/utils/responsive';

interface PremiumLockContentProps {
  title: string;
  description: string;
  ctaLabel?: string;
  onPress?: () => void;
  ctaSize?: 'md' | 'lg';
  /** Surface the content sits on: the inline card or the bottom sheet. */
  tone?: 'card' | 'sheet';
}

const CARD_BG_GRADIENT = [palette.premiumBg, palette.premiumBgMid, palette.premiumBg] as const;
const CARD_ICON_GRADIENT = [palette.gold, palette.goldDeep] as const;
const VIOLET_GRADIENT = [palette.violetDark, palette.violet] as const;
const DIAGONAL_START = { x: 0, y: 0 };
const DIAGONAL_END = { x: 1, y: 1 };

/** Shared body of every Pro lock surface (inline card and bottom sheet). */
export function PremiumLockContent({ title, description, ctaLabel, onPress, ctaSize = 'md', tone = 'card' }: PremiumLockContentProps) {
  const theme = useTheme();
  const isSheet = tone === 'sheet';
  return (
    <View style={styles.content}>
      <LinearGradient
        colors={isSheet ? VIOLET_GRADIENT : CARD_ICON_GRADIENT}
        start={DIAGONAL_START}
        end={DIAGONAL_END}
        style={styles.iconTile}
      >
        <JitLock size={icon.lg} color={isSheet ? palette.gold : palette.premiumBg} strokeWidth={icon.stroke} />
      </LinearGradient>
      <ProBadge variant="premium" style={[styles.badge, !isSheet && styles.badgeCard]} />
      <Text style={styles.title} maxFontSizeMultiplier={1.4}>
        {title}
      </Text>
      <Text style={[styles.desc, { color: isSheet ? palette.charbonUltraLight : theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
        {description}
      </Text>
      {ctaLabel && onPress && (
        <ActionButton label={ctaLabel} onPress={onPress} size={ctaSize} gradient={VIOLET_GRADIENT} style={styles.cta} />
      )}
    </View>
  );
}

interface PremiumLockCardProps {
  descriptionKey: string;
  titleKey?: string;
  /** Adds an upgrade button when given together with `onPress`. */
  ctaLabelKey?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export default React.memo(function PremiumLockCard({ descriptionKey, titleKey, ctaLabelKey, onPress, style }: PremiumLockCardProps) {
  const { t } = useLanguage();

  return (
    <View style={[styles.wrapper, style]}>
      <LinearGradient
        colors={CARD_BG_GRADIENT}
        start={DIAGONAL_START}
        end={DIAGONAL_END}
        style={StyleSheet.absoluteFill}
      />
      <PremiumLockContent
        title={t(titleKey ?? 'messages.premiumFeatureTitle')}
        description={t(descriptionKey)}
        ctaLabel={ctaLabelKey ? t(ctaLabelKey) : undefined}
        onPress={onPress}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.premiumBorder,
    overflow: 'hidden',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  content: {
    alignItems: 'center',
    gap: 10,
  },
  iconTile: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  badge: {
    alignSelf: 'center',
  },
  badgeCard: {
    backgroundColor: palette.premiumBorder,
  },
  title: {
    fontSize: 17,
    color: '#fff',
    fontFamily: font.bold,
    textAlign: 'center',
  },
  desc: {
    fontSize: 13,
    fontFamily: font.regular,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 8,
  },
  cta: {
    alignSelf: 'stretch',
    marginTop: 6,
  },
});
