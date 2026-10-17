import React, { memo, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { resolveImageUrl } from '@/utils/imageUrl';
import { getMerchantAccent } from '@/utils/merchantAccent';
import { MERCHANT_ICON_MAP } from '@/utils/merchantIcons';
import { getCategoryEmoji } from '@/utils/categories';
import { formatDistance } from '@/utils/distance';
import { describeOpenStatus, type OpenStatus } from '@/utils/openingHours';
import { wp, hp, ms } from '@/utils/responsive';
import type { Merchant } from '@/types';

export const HERO_HEIGHT = hp(240);
const LOGO_SIZE = ms(96);
const TOP_SCRIM = ['rgba(0,0,0,0.38)', 'rgba(0,0,0,0)'] as const;
const DIAG_START = { x: 0, y: 0 } as const;
const DIAG_END = { x: 1, y: 1 } as const;

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
  }
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

interface Props {
  merchant: Merchant;
  scrollY: Animated.Value;
  pageBg: string;
  openStatus: OpenStatus | null;
  distanceKm: number | null;
}

function MerchantHero({ merchant, scrollY, pageBg, openStatus, distanceKm }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const [coverError, setCoverError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const accent = getMerchantAccent(merchant.themeColor);
  const ThemeIcon = merchant.themeIcon ? MERCHANT_ICON_MAP[merchant.themeIcon] : undefined;

  // Stretches the cover on pull-down (iOS bounce) so no gap opens above it; native driver only.
  const coverMotion = useMemo(() => ({
    transform: [
      {
        translateY: scrollY.interpolate({
          inputRange: [-HERO_HEIGHT, 0],
          outputRange: [-HERO_HEIGHT / 2, 0],
          extrapolateRight: 'clamp',
        }),
      },
      { scale: scrollY.interpolate({ inputRange: [-HERO_HEIGHT, 0], outputRange: [2, 1], extrapolateRight: 'clamp' }) },
    ],
  }), [scrollY]);

  const subtitle = useMemo(() => {
    const categories = [merchant.categorie, ...(merchant.secondaryCategories ?? [])]
      .filter(Boolean)
      .map((c) => t(`categories.${c}`, { defaultValue: c }))
      .join(' · ');
    return [categories, merchant.ville].filter(Boolean).join('  •  ');
  }, [merchant.categorie, merchant.secondaryCategories, merchant.ville, t]);

  const rewardCount = merchant.rewards?.length ?? 0;
  const stats = [
    { key: 'clients', value: merchant.clientCount ?? 0, label: t('merchant.clients') },
    ...(rewardCount > 0 ? [{ key: 'rewards', value: rewardCount, label: t('merchant.rewardsLabel') }] : []),
    { key: 'views', value: merchant.profileViews ?? 0, label: t('merchant.views') },
  ];

  const statusColor = openStatus?.isOpen ? theme.success : theme.danger;

  return (
    <View>
      <View style={styles.cover}>
        <Animated.View style={[StyleSheet.absoluteFill, coverMotion]}>
          {merchant.coverUrl && !coverError ? (
            <Image
              source={resolveImageUrl(merchant.coverUrl)}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={merchant.coverUrl}
              transition={200}
              onError={() => setCoverError(true)}
            />
          ) : (
            <LinearGradient colors={[accent, `${accent}B3`, `${accent}59`]} start={DIAG_START} end={DIAG_END} style={StyleSheet.absoluteFill}>
              <View style={[styles.orb, styles.orbA]} />
              <View style={[styles.orb, styles.orbB]} />
            </LinearGradient>
          )}
        </Animated.View>
        <LinearGradient pointerEvents="none" colors={TOP_SCRIM} style={styles.topScrim} />
        <LinearGradient pointerEvents="none" colors={[`${pageBg}00`, pageBg]} style={styles.bottomFade} />
      </View>

      <View style={styles.identity}>
        <View style={[styles.logoFrame, { backgroundColor: pageBg }]}>
          {merchant.logoUrl && !logoError ? (
            <Image
              source={resolveImageUrl(merchant.logoUrl)}
              style={styles.logo}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={merchant.logoUrl}
              onError={() => setLogoError(true)}
              accessibilityLabel={merchant.nomBoutique}
            />
          ) : (
            <View style={[styles.logo, styles.logoFallback, { backgroundColor: theme.bgCard, borderColor: `${accent}30` }]}>
              {ThemeIcon
                ? <ThemeIcon size={ms(44)} color={accent} strokeWidth={1.75} />
                : <Text style={styles.emoji}>{getCategoryEmoji(merchant.categorie)}</Text>}
            </View>
          )}
        </View>

        <Text style={[styles.name, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={2} accessibilityRole="header">
          {merchant.nomBoutique}
        </Text>
        {!!subtitle && (
          <Text style={[styles.subtitle, { color: theme.textMuted, fontFamily: fonts.medium }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
        {!!merchant.tagline && (
          <Text style={[styles.tagline, { color: theme.textSecondary, fontFamily: fonts.regular }]} numberOfLines={2}>
            {merchant.tagline}
          </Text>
        )}

        {(openStatus || distanceKm != null) && (
          <View style={styles.chips}>
            {openStatus && (
              <View style={[styles.chip, { backgroundColor: `${statusColor}14` }]}>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[styles.chipText, { color: statusColor, fontFamily: fonts.semibold }]} numberOfLines={1}>
                  {describeOpenStatus(openStatus, t)}
                </Text>
              </View>
            )}
            {distanceKm != null && (
              <View style={[styles.chip, { backgroundColor: theme.bgCard, borderColor: theme.border, borderWidth: StyleSheet.hairlineWidth }]}>
                <MapPin size={ms(12)} color={theme.textSecondary} strokeWidth={2} />
                <Text style={[styles.chipText, { color: theme.textSecondary, fontFamily: fonts.semibold }]}>
                  {formatDistance(distanceKm)}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={[styles.stats, { backgroundColor: theme.bgCard, borderColor: theme.border }]}>
          {stats.map((s, i) => (
            <View key={s.key} style={[styles.stat, i > 0 && { borderStartWidth: StyleSheet.hairlineWidth, borderColor: theme.border }]}>
              <Text style={[styles.statValue, { color: theme.text, fontFamily: fonts.bold }]}>{formatCount(s.value)}</Text>
              <Text style={[styles.statLabel, { color: theme.textMuted, fontFamily: fonts.medium }]} numberOfLines={1}>{s.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { height: HERO_HEIGHT },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: hp(120) },
  bottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: hp(90) },
  orb: { position: 'absolute', borderRadius: 9999, backgroundColor: 'rgba(255,255,255,0.10)' },
  orbA: { width: HERO_HEIGHT * 1.2, height: HERO_HEIGHT * 1.2, top: -HERO_HEIGHT * 0.5, right: -HERO_HEIGHT * 0.4 },
  orbB: { width: HERO_HEIGHT * 0.7, height: HERO_HEIGHT * 0.7, bottom: -HERO_HEIGHT * 0.3, left: -HERO_HEIGHT * 0.2 },

  identity: { alignItems: 'center', paddingHorizontal: wp(20) },
  logoFrame: {
    marginTop: -LOGO_SIZE / 2 - 4,
    padding: 4,
    borderRadius: ms(30),
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 18 },
      android: { elevation: 8 },
    }),
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: ms(26) },
  logoFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  emoji: { fontSize: ms(40) },

  name: { fontSize: ms(25), letterSpacing: -0.5, textAlign: 'center', marginTop: hp(14) },
  subtitle: { fontSize: ms(13), textAlign: 'center', marginTop: hp(4) },
  tagline: { fontSize: ms(14), lineHeight: ms(20), textAlign: 'center', marginTop: hp(8), maxWidth: '92%' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: wp(8), marginTop: hp(14) },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: wp(6),
    paddingHorizontal: wp(12), paddingVertical: hp(6), borderRadius: 999,
  },
  statusDot: { width: ms(7), height: ms(7), borderRadius: ms(4) },
  chipText: { fontSize: ms(12) },

  stats: {
    flexDirection: 'row', alignSelf: 'stretch', marginTop: hp(18),
    borderRadius: ms(18), borderWidth: StyleSheet.hairlineWidth, paddingVertical: hp(12),
  },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: wp(6) },
  statValue: { fontSize: ms(17) },
  statLabel: { fontSize: ms(11), marginTop: hp(2) },
});

export default memo(MerchantHero);
