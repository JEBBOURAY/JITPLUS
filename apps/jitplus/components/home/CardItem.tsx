import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, I18nManager } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, ChevronRight, Gift } from 'lucide-react-native';
import { palette, type ThemeColors } from '@/contexts/ThemeContext';
import { LoyaltyCard } from '@/types';
import GlassCard from '@/components/GlassCard';
import MerchantLogo from '@/components/MerchantLogo';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { resolveImageUrl } from '@/utils/imageUrl';
import { timeAgo } from '@/utils/date';
import { getFontFamily } from '@/utils/fonts';
import { getCardProgress } from '@/utils/cardProgress';

/** Above this goal, individual stamps get too small to read: show a progress bar instead. */
const MAX_DOT_STAMPS = 12;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const GOLD_GRADIENT = [palette.goldLight, palette.gold] as const;
/** Fallback mark shown inside a stamp when the merchant has no logo. */
const STAMP_LOGO = require('@/assets/images/jitpluslogo-app.png');
const TINT_START = { x: 0, y: 0 } as const;
const TINT_END = { x: 1, y: 1 } as const;
const GRADIENT_H_START = { x: 0, y: 0 } as const;
const GRADIENT_H_END = { x: 1, y: 0 } as const;

const CardItem = React.memo(function CardItem({
  card,
  onPress,
  t,
  isClosest,
  locale,
  searchHighlight,
  theme,
}: {
  card: LoyaltyCard;
  onPress: (merchantId: string) => void;
  t: (scope: string, options?: Record<string, unknown>) => string;
  isClosest?: boolean;
  locale?: string;
  searchHighlight?: string;
  theme: ThemeColors;
}) {
  const isMerchantUnavailable = !card.merchant?.id || !card.merchant?.nomBoutique;
  const isDark = theme.mode === 'dark';
  const logoUrl = card.merchant?.logoUrl;
  // Stamp mark: the merchant logo; the tinted JitPlus mark when missing or broken.
  const [stampLogoFailed, setStampLogoFailed] = useState(false);
  useEffect(() => setStampLogoFailed(false), [logoUrl]);
  const stampLogoUrl = logoUrl && !stampLogoFailed ? resolveImageUrl(logoUrl) : null;

  const handlePress = useCallback(() => {
    if (isMerchantUnavailable) return;
    onPress(card.merchantId);
  }, [isMerchantUnavailable, onPress, card.merchantId]);

  const { goal, earned, remaining, ratio, isComplete } = getCardProgress(card);
  const useDots = goal <= MAX_DOT_STAMPS;

  // Gentle pulse on the reward pill only — the card itself stays calm.
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isComplete) { pulseAnim.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isComplete, pulseAnim]);
  const pulseScale = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });

  const lastVisitLabel = useMemo(
    () => timeAgo(card.updatedAt || card.createdAt, locale),
    [card.updatedAt, card.createdAt, locale],
  );

  const categoryLabel = card.merchant?.categorie
    ? t(`categories.${card.merchant.categorie}`, { defaultValue: '' })
    : '';

  // ── Merchant-controlled card customization ──
  const cardBgUrl = card.merchant?.cardBackgroundUrl ?? null;
  const cardBgColorRaw = card.merchant?.cardBackgroundColor ?? null;
  const cardBgColor = cardBgColorRaw && HEX_COLOR.test(cardBgColorRaw) ? cardBgColorRaw : null;
  const hasCustomBg = !!cardBgUrl || !!cardBgColor;
  const darkText = card.merchant?.cardTextColor === 'DARK';

  const accent = useMemo(() => {
    const c = card.merchant?.themeColor;
    if (c && HEX_COLOR.test(c)) return c;
    return isDark ? palette.violetLight : palette.violet;
  }, [card.merchant?.themeColor, isDark]);

  const colors = useMemo(() => {
    if (!hasCustomBg) {
      return {
        primary: theme.text,
        secondary: isDark ? '#94A3B8' : '#64748B',
        muted: theme.textMuted,
        count: accent,
        stampOn: accent,
        stampCheck: '#FFFFFF',
        stampOff: `${accent}14`,
        stampOffBorder: `${accent}30`,
        overlay: 'transparent',
      };
    }
    return darkText
      ? {
          primary: '#111827', secondary: '#374151', muted: '#4B5563', count: '#111827',
          stampOn: '#111827', stampCheck: '#FFFFFF',
          stampOff: 'rgba(17,24,39,0.10)', stampOffBorder: 'rgba(17,24,39,0.18)',
          overlay: 'rgba(255,255,255,0.28)',
        }
      : {
          primary: '#FFFFFF', secondary: 'rgba(255,255,255,0.82)', muted: 'rgba(255,255,255,0.7)', count: '#FFFFFF',
          stampOn: '#FFFFFF', stampCheck: cardBgColor ?? '#111827',
          stampOff: 'rgba(255,255,255,0.16)', stampOffBorder: 'rgba(255,255,255,0.28)',
          overlay: 'rgba(0,0,0,0.32)',
        };
  }, [hasCustomBg, darkText, theme.text, theme.textMuted, isDark, accent, cardBgColor]);

  const merchantName = card.merchant?.nomBoutique || t('common.shop');

  const renderName = () => {
    if (isMerchantUnavailable) return t('home.unavailableMerchantName');
    if (!searchHighlight) return merchantName;
    const idx = merchantName.toLowerCase().indexOf(searchHighlight.toLowerCase());
    if (idx < 0) return merchantName;
    return (
      <>
        {merchantName.slice(0, idx)}
        <Text style={{ color: hasCustomBg ? colors.primary : accent, textDecorationLine: hasCustomBg ? 'underline' : 'none' }}>
          {merchantName.slice(idx, idx + searchHighlight.length)}
        </Text>
        {merchantName.slice(idx + searchHighlight.length)}
      </>
    );
  };

  const a11yLabel = isMerchantUnavailable
    ? t('home.unavailableMerchantName')
    : [
        t('home.cardAccessibility', { name: merchantName }),
        t('home.stampsEarned', { earned, total: goal }),
        isComplete ? t('home.rewardReadyShort') : '',
      ].filter(Boolean).join(', ');

  const borderColor = isComplete && !isMerchantUnavailable
    ? `${palette.gold}AA`
    : hasCustomBg ? 'transparent' : theme.border;

  const fontBold = getFontFamily(locale ?? 'fr', 'bold');
  const fontSemi = getFontFamily(locale ?? 'fr', 'semibold');
  const fontMedium = getFontFamily(locale ?? 'fr', 'medium');

  return (
    <GlassCard
      onPress={isMerchantUnavailable ? undefined : handlePress}
      haptic={false}
      radius={radius.xl}
      style={styles.wrapper}
      accessibilityLabel={a11yLabel}
    >
      <View style={[styles.shadow, !isDark && styles.shadowLight, isMerchantUnavailable && styles.dimmed]}>
        <View style={[styles.card, { backgroundColor: cardBgColor ?? theme.bgCard, borderColor }]}>
          {cardBgUrl ? (
            <Image
              source={resolveImageUrl(cardBgUrl)}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={cardBgUrl}
              transition={200}
            />
          ) : null}
          {hasCustomBg ? (
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]} />
          ) : (
            <LinearGradient
              pointerEvents="none"
              colors={[`${accent}${isDark ? '26' : '14'}`, `${accent}00`]}
              start={TINT_START}
              end={TINT_END}
              style={StyleSheet.absoluteFill}
            />
          )}

          {/* ── Header: logo · name · progress count ── */}
          <View style={styles.header}>
            <View style={[styles.logoWrap, { backgroundColor: hasCustomBg ? 'rgba(255,255,255,0.92)' : '#FFFFFF' }]}>
              <MerchantLogo logoUrl={logoUrl} merchantName={card.merchant?.nomBoutique} style={styles.logo} />
            </View>

            <View style={styles.headerText}>
              <Text style={[styles.name, { color: colors.primary, fontFamily: fontBold }]} numberOfLines={1}>
                {renderName()}
              </Text>
              <View style={styles.metaRow}>
                {!!categoryLabel && (
                  <Text style={[styles.meta, { color: colors.secondary, fontFamily: fontMedium }]} numberOfLines={1}>
                    {categoryLabel}
                  </Text>
                )}
                {isClosest && (
                  <View style={[styles.nearPill, { backgroundColor: hasCustomBg ? 'rgba(255,255,255,0.9)' : `${palette.emerald}18` }]}>
                    <Text style={[styles.nearText, { fontFamily: fontSemi }]} numberOfLines={1}>{t('home.nearestBadge')}</Text>
                  </View>
                )}
              </View>
            </View>

            {!isMerchantUnavailable && (
              <View style={styles.countWrap}>
                <Text style={[styles.countValue, { color: isComplete ? palette.goldDark : colors.count, fontFamily: fontBold }]}>
                  {earned}
                  <Text style={[styles.countTotal, { color: colors.muted, fontFamily: fontMedium }]}>/{goal}</Text>
                </Text>
                <ChevronRight
                  size={ms(18)}
                  color={colors.muted}
                  strokeWidth={2}
                  style={I18nManager.isRTL ? styles.flip : undefined}
                />
              </View>
            )}
          </View>

          {isMerchantUnavailable ? (
            <View style={[styles.unavailable, { backgroundColor: `${theme.danger}12` }]}>
              <AlertCircle size={ms(14)} color={theme.danger} strokeWidth={2} />
              <Text style={[styles.unavailableText, { color: theme.danger, fontFamily: fontMedium }]}>
                {t('home.unavailableMerchantMessage')}
              </Text>
            </View>
          ) : (
            <>
              {/* ── Progress ── */}
              {useDots ? (
                <View style={styles.dots} accessible={false}>
                  {Array.from({ length: goal }, (_, i) => {
                    const filled = i < earned;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.dot,
                          filled
                            ? { backgroundColor: colors.stampOn, borderColor: colors.stampOn }
                            : { backgroundColor: colors.stampOff, borderColor: colors.stampOffBorder },
                        ]}
                      >
                        {stampLogoUrl ? (
                          <Image
                            source={stampLogoUrl}
                            style={[styles.dotLogoFull, !filled && styles.dotLogoDim]}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            recyclingKey={logoUrl}
                            transition={150}
                            onError={() => setStampLogoFailed(true)}
                          />
                        ) : (
                          <Image
                            source={STAMP_LOGO}
                            style={styles.dotLogo}
                            contentFit="contain"
                            tintColor={filled ? colors.stampCheck : colors.stampOffBorder}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={[styles.barTrack, { backgroundColor: colors.stampOff }]}>
                  <View style={[styles.barFill, { width: `${Math.max(ratio * 100, ratio > 0 ? 4 : 0)}%`, backgroundColor: colors.stampOn }]} />
                </View>
              )}

              {/* ── Footer: status · last visit ── */}
              <View style={styles.footer}>
                {isComplete ? (
                  <Animated.View style={[styles.rewardPillWrap, { transform: [{ scale: pulseScale }] }]}>
                    <LinearGradient colors={GOLD_GRADIENT} start={GRADIENT_H_START} end={GRADIENT_H_END} style={styles.rewardPill}>
                      <Gift size={ms(13)} color="#FFFFFF" strokeWidth={2.2} />
                      <Text style={[styles.rewardPillText, { fontFamily: fontBold }]} numberOfLines={1}>
                        {t('home.rewardReadyShort')}
                      </Text>
                    </LinearGradient>
                  </Animated.View>
                ) : (
                  <Text style={[styles.status, { color: colors.secondary, fontFamily: fontMedium }]} numberOfLines={1}>
                    {t('home.stampsLeft', { count: remaining })}
                  </Text>
                )}
                {!!lastVisitLabel && (
                  <Text style={[styles.lastVisit, { color: colors.muted, fontFamily: fontMedium }]} numberOfLines={1}>
                    {lastVisitLabel}
                  </Text>
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </GlassCard>
  );
});

export default CardItem;

const styles = StyleSheet.create({
  wrapper: { marginBottom: hp(12) },
  shadow: { borderRadius: radius.xl },
  shadowLight: {
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.07, shadowRadius: 16, elevation: 2,
  },
  dimmed: { opacity: 0.6 },
  card: {
    borderRadius: radius.xl, borderWidth: 1,
    paddingHorizontal: wp(16), paddingTop: hp(16), paddingBottom: hp(14),
    overflow: 'hidden',
  },

  // Header
  header: { flexDirection: 'row', alignItems: 'center' },
  logoWrap: {
    width: ms(48), height: ms(48), borderRadius: ms(14),
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  logo: { width: '100%', height: '100%' },
  headerText: { flex: 1, marginHorizontal: wp(12) },
  name: { fontSize: fontSize.md, letterSpacing: -0.2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: wp(6), marginTop: hp(3) },
  meta: { fontSize: fontSize.xs, flexShrink: 1 },
  nearPill: { paddingHorizontal: wp(7), paddingVertical: hp(2), borderRadius: ms(8) },
  nearText: { fontSize: ms(10), color: '#047857' },
  countWrap: { flexDirection: 'row', alignItems: 'center', gap: wp(2) },
  countValue: { fontSize: fontSize.xl, letterSpacing: -0.5 },
  countTotal: { fontSize: fontSize.sm, letterSpacing: 0 },
  flip: { transform: [{ scaleX: -1 }] },

  // Progress
  dots: { flexDirection: 'row', gap: wp(6), marginTop: hp(16) },
  dot: {
    flex: 1, maxWidth: ms(30), aspectRatio: 1, borderRadius: 999, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  dotLogo: { width: '58%', height: '58%' },
  dotLogoFull: { width: '100%', height: '100%' },
  dotLogoDim: { opacity: 0.3 },
  barTrack: { height: ms(8), borderRadius: ms(4), overflow: 'hidden', marginTop: hp(18), marginBottom: hp(2) },
  barFill: { height: '100%', borderRadius: ms(4) },

  // Footer
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: wp(10), marginTop: hp(12), minHeight: ms(24),
  },
  status: { fontSize: fontSize.xs, flexShrink: 1 },
  lastVisit: { fontSize: ms(11) },
  rewardPillWrap: { flexShrink: 1 },
  rewardPill: {
    flexDirection: 'row', alignItems: 'center', gap: wp(5),
    paddingHorizontal: wp(10), paddingVertical: hp(4), borderRadius: 999,
  },
  rewardPillText: { color: '#FFFFFF', fontSize: fontSize.xs },

  // Unavailable
  unavailable: {
    flexDirection: 'row', alignItems: 'center', gap: wp(8),
    marginTop: hp(12), paddingVertical: hp(8), paddingHorizontal: wp(12), borderRadius: ms(10),
  },
  unavailableText: { fontSize: fontSize.xs, flex: 1 },
});
