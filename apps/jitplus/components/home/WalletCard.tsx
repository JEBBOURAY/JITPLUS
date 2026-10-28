import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing, I18nManager } from 'react-native';
import { Text } from '@/components/AppText';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertCircle, Gift } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import MerchantLogo from '@/components/MerchantLogo';
import type { LoyaltyCard } from '@/types';
import { resolveImageUrl } from '@/utils/imageUrl';
import { timeAgo } from '@/utils/date';
import { getFontFamily } from '@/utils/fonts';
import { getCardProgress } from '@/utils/cardProgress';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const MAX_DOT_STAMPS = 20;
const DIAG_START = { x: 0, y: 0 } as const;
const DIAG_END = { x: 1, y: 1 } as const;
const H_START = { x: 0, y: 0 } as const;
const H_END = { x: 1, y: 0 } as const;
const SHINE_COLORS = ['rgba(255,255,255,0)', 'rgba(255,255,255,0.30)', 'rgba(255,255,255,0)'] as const;
const GOLD_GRADIENT = [palette.goldLight, palette.gold] as const;
const UNAVAILABLE_GRADIENT = ['#64748B', '#334155'] as const;
/** Fallback mark shown inside a stamp when the merchant has no logo. */
const STAMP_LOGO = require('@/assets/images/jitpluslogo-app.png');

/** Mix a #RRGGBB colour toward black (amount < 0) or white (amount > 0). */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const p = Math.abs(amount);
  const mix = (c: number) => Math.round((target - c) * p + c);
  const r = mix(n >> 16);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

interface Props {
  card: LoyaltyCard;
  width: number;
  height: number;
  t: (scope: string, options?: Record<string, unknown>) => string;
  locale: string;
  isActive: boolean;
  reduceMotion: boolean;
}

/** Full-bleed loyalty "pass" shown in the wallet carousel. */
export default memo(function WalletCard({ card, width, height, t, locale, isActive, reduceMotion }: Props) {
  const merchant = card.merchant;
  const isUnavailable = !merchant?.id || !merchant?.nomBoutique;
  const { goal, earned, remaining, isComplete } = getCardProgress(card);
  const logoUrl = merchant?.logoUrl;
  // Stamp mark: the merchant logo; the tinted JitPlus mark when missing or broken.
  const [stampLogoFailed, setStampLogoFailed] = useState(false);
  useEffect(() => setStampLogoFailed(false), [logoUrl]);
  const stampLogoUrl = logoUrl && !stampLogoFailed ? resolveImageUrl(logoUrl) : null;

  // ── Colours (merchant branding first, JitPlus violet otherwise) ──
  const cardBgUrl = merchant?.cardBackgroundUrl ?? null;
  const cardBgColor = merchant?.cardBackgroundColor && HEX_COLOR.test(merchant.cardBackgroundColor)
    ? merchant.cardBackgroundColor : null;
  const darkText = (!!cardBgUrl || !!cardBgColor) && merchant?.cardTextColor === 'DARK';
  const accent = merchant?.themeColor && HEX_COLOR.test(merchant.themeColor) ? merchant.themeColor : palette.violet;

  const gradient = useMemo<readonly [string, string, string]>(() => {
    if (isUnavailable) return [UNAVAILABLE_GRADIENT[0], UNAVAILABLE_GRADIENT[1], UNAVAILABLE_GRADIENT[1]];
    const base = cardBgColor ?? accent;
    return [shade(base, 0.12), base, shade(base, -0.38)];
  }, [isUnavailable, cardBgColor, accent]);

  const c = darkText
    ? {
        text: '#111827', sub: 'rgba(17,24,39,0.72)',
        on: '#111827', check: '#FFFFFF',
        off: 'rgba(17,24,39,0.10)', offBorder: 'rgba(17,24,39,0.22)',
        overlay: 'rgba(255,255,255,0.25)',
      }
    : {
        text: '#FFFFFF', sub: 'rgba(255,255,255,0.78)',
        on: '#FFFFFF', check: shade(cardBgColor ?? accent, -0.2),
        off: 'rgba(255,255,255,0.16)', offBorder: 'rgba(255,255,255,0.34)',
        overlay: 'rgba(0,0,0,0.30)',
      };

  // ── Stamp grid sizing: fit 1 row (≤10) or 2 rows (≤20) inside the card ──
  const pad = Math.round(width * 0.065);
  const innerW = width - pad * 2;
  const logoSize = Math.round(width * 0.15);
  const useDots = goal <= MAX_DOT_STAMPS;
  // Stamps always sit on two centred, balanced rows — it reads like a real loyalty card.
  const firstRow = Math.ceil(goal / 2);
  const dotGap = Math.max(4, Math.round(width * 0.018));
  const dotSize = Math.min(ms(26), Math.floor((innerW - dotGap * (firstRow - 1)) / firstRow));

  // ── Light sweep across the pass when it becomes the focused card ──
  const shine = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isActive || reduceMotion) return;
    shine.setValue(0);
    const anim = Animated.timing(shine, {
      toValue: 1, duration: 1100, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [isActive, reduceMotion, shine]);
  const shineX = shine.interpolate({ inputRange: [0, 1], outputRange: [-width * 0.9, width * 1.2] });

  const lastVisit = timeAgo(card.updatedAt || card.createdAt, locale);
  const categoryLabel = merchant?.categorie ? t(`categories.${merchant.categorie}`, { defaultValue: '' }) : '';
  const fontBold = getFontFamily(locale, 'bold');
  const fontSemi = getFontFamily(locale, 'semibold');
  const fontMedium = getFontFamily(locale, 'medium');

  return (
    <View style={[styles.shadow, { width, height, backgroundColor: gradient[1], shadowColor: shade(gradient[1], -0.4) }]}>
      <View style={[styles.card, isComplete && !isUnavailable && styles.cardReward]}>
        <LinearGradient colors={gradient} start={DIAG_START} end={DIAG_END} style={StyleSheet.absoluteFill} />
        {cardBgUrl && !isUnavailable ? (
          <>
            <Image
              source={resolveImageUrl(cardBgUrl)}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={cardBgUrl}
              transition={200}
            />
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]} />
          </>
        ) : (
          <>
            <View pointerEvents="none" style={[styles.orb, styles.orbA, { width: height * 1.1, height: height * 1.1 }]} />
            <View pointerEvents="none" style={[styles.orb, styles.orbB, { width: height * 0.7, height: height * 0.7 }]} />
          </>
        )}

        <View style={[styles.content, { padding: pad, direction: I18nManager.isRTL ? 'rtl' : 'ltr' }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.logoWrap, { width: logoSize, height: logoSize, borderRadius: Math.round(logoSize * 0.3) }]}>
              <MerchantLogo logoUrl={logoUrl} merchantName={merchant?.nomBoutique} style={styles.logo} />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.name, { color: c.text, fontFamily: fontBold }]} numberOfLines={1}>
                {isUnavailable ? t('home.unavailableMerchantName') : merchant?.nomBoutique}
              </Text>
              {!!categoryLabel && !isUnavailable && (
                <Text style={[styles.category, { color: c.sub, fontFamily: fontMedium }]} numberOfLines={1}>
                  {categoryLabel}
                </Text>
              )}
            </View>
            {!isUnavailable && (
              isComplete ? (
                <LinearGradient colors={GOLD_GRADIENT} start={H_START} end={H_END} style={styles.rewardPill}>
                  <Gift size={ms(13)} color="#fff" strokeWidth={2.4} />
                  <Text style={[styles.rewardPillText, { fontFamily: fontBold }]} numberOfLines={1}>
                    {t('home.rewardReadyShort')}
                  </Text>
                </LinearGradient>
              ) : (
                <Text style={[styles.count, { color: c.text, fontFamily: fontBold }]}>
                  {earned}
                  <Text style={[styles.countTotal, { color: c.sub, fontFamily: fontMedium }]}>/{goal}</Text>
                </Text>
              )
            )}
          </View>

          {/* Stamps */}
          {isUnavailable ? (
            <View style={styles.unavailable}>
              <AlertCircle size={ms(16)} color="#fff" strokeWidth={2} />
              <Text style={[styles.unavailableText, { fontFamily: fontMedium }]}>{t('home.unavailableMerchantMessage')}</Text>
            </View>
          ) : useDots ? (
            <View style={[styles.dots, { gap: dotGap }]}>
              {[firstRow, goal - firstRow].filter((n) => n > 0).map((rowCount, row) => (
                <View key={row} style={[styles.dotRow, { gap: dotGap }]}>
                  {Array.from({ length: rowCount }, (_, i) => {
                    const index = row === 0 ? i : firstRow + i;
                    const filled = index < earned;
                    return (
                      <View
                        key={index}
                        style={[
                          styles.dot,
                          { width: dotSize, height: dotSize, borderRadius: dotSize / 2 },
                          filled ? { backgroundColor: c.on, borderColor: c.on } : { backgroundColor: c.off, borderColor: c.offBorder },
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
                            style={{ width: Math.round(dotSize * 0.62), height: Math.round(dotSize * 0.62) }}
                            contentFit="contain"
                            tintColor={filled ? c.check : c.offBorder}
                          />
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          ) : (
            <View style={[styles.barTrack, { backgroundColor: c.off }]}>
              <View style={[styles.barFill, { width: `${Math.max((earned / goal) * 100, earned > 0 ? 4 : 0)}%`, backgroundColor: c.on }]} />
            </View>
          )}

          {/* Footer: progression discrète + dernière visite */}
          <View style={styles.footer}>
            {!isUnavailable && (
              <Text style={[styles.footerProgress, { color: c.sub, fontFamily: fontSemi }]} numberOfLines={1}>
                {isComplete ? t('home.rewardReadyHint') : t('home.stampsLeft', { count: remaining })}
              </Text>
            )}
            {!!lastVisit && !isUnavailable && (
              <Text style={[styles.footerValue, { color: c.sub, fontFamily: fontMedium }]} numberOfLines={1}>
                {lastVisit}
              </Text>
            )}
          </View>
        </View>

        {!reduceMotion && (
          <Animated.View
            pointerEvents="none"
            style={[styles.shine, { width: width * 0.45, height: height * 2, top: -height / 2, transform: [{ translateX: shineX }, { rotate: '18deg' }] }]}
          >
            <LinearGradient colors={SHINE_COLORS} start={H_START} end={H_END} style={StyleSheet.absoluteFill} />
          </Animated.View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  shadow: {
    borderRadius: radius['2xl'],
    shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.35, shadowRadius: 22, elevation: 10,
  },
  card: { flex: 1, borderRadius: radius['2xl'], overflow: 'hidden' },
  cardReward: { borderWidth: 2, borderColor: palette.goldLight },
  orb: { position: 'absolute', borderRadius: 999 },
  orbA: { top: '-45%', right: '-20%', backgroundColor: 'rgba(255,255,255,0.09)' },
  orbB: { bottom: '-35%', left: '-12%', backgroundColor: 'rgba(255,255,255,0.06)' },
  content: { flex: 1, justifyContent: 'space-between' },

  header: { flexDirection: 'row', alignItems: 'center' },
  logoWrap: {
    backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  logo: { width: '100%', height: '100%' },
  headerText: { flex: 1, marginHorizontal: wp(10) },
  name: { fontSize: fontSize.md, letterSpacing: -0.3 },
  category: { fontSize: fontSize.xs, marginTop: hp(1) },
  count: { fontSize: fontSize.xl, letterSpacing: -0.6 },
  countTotal: { fontSize: fontSize.xs, letterSpacing: 0 },
  rewardPill: {
    flexDirection: 'row', alignItems: 'center', gap: wp(5),
    paddingHorizontal: wp(8), paddingVertical: hp(4), borderRadius: 999, maxWidth: '46%',
  },
  rewardPillText: { color: '#fff', fontSize: fontSize.xs, flexShrink: 1 },

  dots: { alignItems: 'center' },
  dotRow: { flexDirection: 'row', justifyContent: 'center' },
  dot: { borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  dotLogoFull: { width: '100%', height: '100%' },
  dotLogoDim: { opacity: 0.3 },
  barTrack: { height: ms(10), borderRadius: ms(5), overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: ms(5) },

  unavailable: {
    flexDirection: 'row', alignItems: 'center', gap: wp(8),
    backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: radius.md, padding: wp(10),
  },
  unavailableText: { color: '#fff', fontSize: fontSize.xs, flex: 1 },

  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: wp(10) },
  footerProgress: { fontSize: ms(11), flexShrink: 1 },
  footerValue: { fontSize: ms(11) },

  shine: { position: 'absolute', left: 0 },
});
