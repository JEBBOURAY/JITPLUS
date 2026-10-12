import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Gift, Stamp, Clock } from 'lucide-react-native';
import { palette, type ThemeColors } from '@/contexts/ThemeContext';
import { resolveImageUrl } from '@/utils/imageUrl';
import type { Merchant } from '@/types';

/** Grids above this size are shown truncated, like the client app card. */
const MAX_VISIBLE_SLOTS = 30;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

interface Props {
  theme: ThemeColors;
  t: (key: string, params?: Record<string, unknown>) => string;
  merchant: Merchant;
  /** Slots on the card the client sees (cheapest reward, else stampsForReward). */
  total: number;
  /** Earning rule summary, e.g. "1 visite = 1 tampon". */
  ruleText: string;
  /** Validity summary; hidden when the rule is off. */
  validityText?: string | null;
}

function slotSize(total: number) {
  if (total <= 10) return 40;
  if (total <= 20) return 32;
  return 26;
}

function LoyaltyCardPreview({ theme, t, merchant, total, ruleText, validityText }: Props) {
  const visible = Math.max(1, Math.min(total, MAX_VISIBLE_SLOTS));
  const filled = Math.min(3, visible - 1);
  const size = slotSize(visible);
  const slots = useMemo(() => Array.from({ length: visible }, (_, i) => i), [visible]);

  const customBg = typeof merchant.cardBackgroundColor === 'string' && HEX_RE.test(merchant.cardBackgroundColor)
    ? merchant.cardBackgroundColor
    : null;
  const bgImage = merchant.cardBackgroundUrl ? resolveImageUrl(merchant.cardBackgroundUrl) : null;
  const hasCustomBg = !!customBg || !!bgImage;
  const darkText = merchant.cardTextColor === 'DARK';
  const textPrimary = hasCustomBg ? (darkText ? '#111827' : '#F9FAFB') : theme.text;
  const textSecondary = hasCustomBg ? (darkText ? '#374151' : '#E5E7EB') : theme.textMuted;
  const accent = typeof merchant.themeColor === 'string' && HEX_RE.test(merchant.themeColor) ? merchant.themeColor : palette.violet;
  const emptyBorder = hasCustomBg ? (darkText ? 'rgba(17,24,39,0.25)' : 'rgba(255,255,255,0.45)') : theme.border;
  const logo = merchant.logoUrl ? resolveImageUrl(merchant.logoUrl) : null;

  return (
    <View
      style={[styles.card, { backgroundColor: customBg ?? theme.bgCard, shadowColor: theme.mode === 'dark' ? '#000' : accent }]}
      accessible
      accessibilityLabel={t('settingsPage.previewA11y', { name: merchant.nom, total })}
    >
      {bgImage ? (
        <>
          <ExpoImage source={bgImage} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: darkText ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.28)' }]}
          />
        </>
      ) : null}

      <View style={styles.header}>
        <View style={[styles.logo, { backgroundColor: accent + '1A' }]}>
          {logo ? (
            <ExpoImage source={logo} style={styles.logoImg} contentFit="cover" cachePolicy="disk" />
          ) : (
            <Text style={[styles.logoInitial, { color: accent }]}>{(merchant.nom || '?').charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.name, { color: textPrimary }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {merchant.nom}
          </Text>
          <Text style={[styles.subtitle, { color: textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {t('settingsPage.previewSubtitle')}
          </Text>
        </View>
        <View style={[styles.previewBadge, { backgroundColor: hasCustomBg ? 'rgba(0,0,0,0.18)' : theme.bgInput }]}>
          <Text style={[styles.previewBadgeText, { color: hasCustomBg ? textPrimary : theme.textMuted }]} maxFontSizeMultiplier={1.1}>
            {t('settingsPage.previewBadge')}
          </Text>
        </View>
      </View>

      <View style={[styles.grid, { gap: size >= 40 ? 10 : 7 }]}>
        {slots.map((i) => {
          const isFilled = i < filled;
          const isLast = i === visible - 1;
          return (
            <View
              key={i}
              style={[
                styles.slot,
                { width: size, height: size, borderRadius: size / 2 },
                isFilled
                  ? { backgroundColor: accent, borderColor: accent }
                  : { borderColor: isLast ? accent : emptyBorder, borderStyle: isLast ? 'solid' : 'dashed' },
              ]}
            >
              {isFilled ? (
                logo ? (
                  <ExpoImage source={logo} style={{ width: size - 4, height: size - 4, borderRadius: (size - 4) / 2 }} contentFit="cover" cachePolicy="disk" />
                ) : (
                  <Stamp size={size * 0.46} color="#fff" strokeWidth={2} />
                )
              ) : isLast ? (
                <Gift size={size * 0.44} color={accent} strokeWidth={1.8} />
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text style={[styles.progress, { color: textPrimary }]} maxFontSizeMultiplier={1.2}>
          {filled}
          <Text style={[styles.progressTotal, { color: textSecondary }]}> / {total}</Text>
        </Text>
        <View style={[styles.ruleChip, { backgroundColor: hasCustomBg ? 'rgba(0,0,0,0.18)' : accent + '14' }]}>
          <Text style={[styles.ruleChipText, { color: hasCustomBg ? textPrimary : accent }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
            {ruleText}
          </Text>
        </View>
      </View>

      {validityText ? (
        <View style={styles.validityRow}>
          <Clock size={12} color={textSecondary} strokeWidth={2} />
          <Text style={[styles.validityText, { color: textSecondary }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {validityText}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default React.memo(LoyaltyCardPreview);

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 4,
    borderRadius: 22,
    padding: 18,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 4,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImg: { width: '100%', height: '100%' },
  logoInitial: { fontSize: 18, fontFamily: 'Lexend_700Bold' },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontFamily: 'Lexend_600SemiBold', letterSpacing: -0.2 },
  subtitle: { fontSize: 12, fontFamily: 'Lexend_400Regular', marginTop: 1 },
  previewBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  previewBadgeText: { fontSize: 10, fontFamily: 'Lexend_500Medium', letterSpacing: 0.3, textTransform: 'uppercase' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 18 },
  slot: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 18 },
  progress: { fontSize: 18, fontFamily: 'Lexend_700Bold' },
  progressTotal: { fontSize: 13, fontFamily: 'Lexend_500Medium' },
  ruleChip: { flexShrink: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  ruleChipText: { fontSize: 12, fontFamily: 'Lexend_500Medium' },
  validityRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  validityText: { flex: 1, fontSize: 11.5, fontFamily: 'Lexend_400Regular' },
});
