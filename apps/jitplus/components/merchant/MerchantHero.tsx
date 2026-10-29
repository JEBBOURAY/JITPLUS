import { memo, useMemo, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Text } from '@/components/AppText';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  MIN_MEMBERS_SHOWN, describeOpenStatus, formatCompactCount, type OpenStatus,
} from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { resolveImageUrl } from '@/utils/imageUrl';
import { MERCHANT_ICON_MAP } from '@/utils/merchantIcons';
import { getCategoryEmoji } from '@/utils/categories';
import { formatDistance } from '@/utils/distance';
import { wp, hp, ms } from '@/utils/responsive';
import type { Merchant } from '@/types';

export const HERO_HEIGHT = hp(170);
const LOGO_SIZE = ms(84);
const LOGO_BORDER = 3;
const TOP_SCRIM = ['rgba(0,0,0,0.30)', 'rgba(0,0,0,0)'] as const;

interface Props {
  merchant: Merchant;
  scrollY: Animated.Value;
  openStatus: OpenStatus | null;
  distanceKm: number | null;
}

/** Cover, logo and the key facts, laid out like a social or maps profile. */
function MerchantHero({ merchant, scrollY, openStatus, distanceKm }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const [coverError, setCoverError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const ThemeIcon = merchant.themeIcon ? MERCHANT_ICON_MAP[merchant.themeIcon] : undefined;
  const coverUrl = coverError ? null : merchant.coverUrl;

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
    const category = merchant.categorie ? t(`categories.${merchant.categorie}`, { defaultValue: merchant.categorie }) : null;
    return [category, merchant.ville].filter(Boolean).join(' · ');
  }, [merchant.categorie, merchant.ville, t]);

  const members = merchant.clientCount ?? 0;
  const facts = [
    distanceKm != null ? formatDistance(distanceKm) : null,
    members >= MIN_MEMBERS_SHOWN ? t('merchant.members', { count: formatCompactCount(members) }) : null,
  ].filter(Boolean).join(' · ');

  return (
    <View>
      <View style={[styles.cover, { backgroundColor: theme.bgInput }]}>
        {!!coverUrl && (
          <Animated.View style={[StyleSheet.absoluteFill, coverMotion]}>
            <Image
              source={resolveImageUrl(coverUrl)}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={coverUrl}
              transition={200}
              onError={() => setCoverError(true)}
            />
          </Animated.View>
        )}
        {/* Keeps the floating header buttons readable over a photo. */}
        {!!coverUrl && <LinearGradient pointerEvents="none" colors={TOP_SCRIM} style={styles.topScrim} />}
      </View>

      <View style={styles.identity}>
        <View style={[styles.logoFrame, { backgroundColor: theme.bg }]}>
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
            <View style={[styles.logo, styles.logoFallback, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
              {ThemeIcon
                ? <ThemeIcon size={ms(36)} color={theme.textSecondary} strokeWidth={1.75} />
                : <Text style={styles.emoji}>{getCategoryEmoji(merchant.categorie ?? undefined)}</Text>}
            </View>
          )}
        </View>

        <Text style={[styles.name, { color: theme.text, fontFamily: fonts.bold }]} numberOfLines={2} accessibilityRole="header">
          {merchant.nomBoutique}
        </Text>
        {!!subtitle && (
          <Text style={[styles.line, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
        {!!merchant.tagline && (
          <Text style={[styles.tagline, { color: theme.textSecondary, fontFamily: fonts.regular }]} numberOfLines={3}>
            {merchant.tagline}
          </Text>
        )}
        {/* Last, right above the directions/call buttons it goes with. */}
        {(openStatus || !!facts) && (
          <Text style={[styles.line, { color: theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={2}>
            {openStatus && (
              <Text style={{ color: openStatus.isOpen ? theme.success : theme.danger, fontFamily: fonts.semibold }}>
                {describeOpenStatus(openStatus, t, 'merchant')}
              </Text>
            )}
            {openStatus && !!facts ? ' · ' : ''}
            {facts}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { height: HERO_HEIGHT, overflow: 'hidden' },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0, height: hp(100) },

  identity: { paddingHorizontal: wp(16) },
  logoFrame: {
    alignSelf: 'flex-start',
    marginTop: -LOGO_SIZE / 2,
    padding: LOGO_BORDER,
    borderRadius: ms(18) + LOGO_BORDER,
  },
  logo: { width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: ms(18) },
  logoFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  emoji: { fontSize: ms(34) },

  name: { fontSize: ms(22), lineHeight: ms(28), letterSpacing: -0.4, marginTop: hp(10) },
  line: { fontSize: ms(14), lineHeight: ms(20), marginTop: hp(3) },
  tagline: { fontSize: ms(14), lineHeight: ms(20), marginTop: hp(6) },
});

export default memo(MerchantHero);
