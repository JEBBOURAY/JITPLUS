import React, { useRef, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Platform,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ticket, MapPin, QrCode, Bell, Gift, ArrowRight, Eye } from 'lucide-react-native';
import { useTheme, palette, brandGradient } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import BrandText from '@/components/BrandText';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const LANGS = [
  { code: 'fr' as const, flag: '\uD83C\uDDEB\uD83C\uDDF7' },
  { code: 'en' as const, flag: '\uD83C\uDDEC\uD83C\uDDE7' },
  { code: 'ar' as const, flag: '\uD83C\uDDF2\uD83C\uDDE6' },
] as const;

interface Slide {
  key: string;
  icon: React.ReactNode;
  titleKey: string;
  descKey: string;
}

export default function WelcomeScreen() {
  const theme = useTheme();
  const { t, locale, setLocale } = useLanguage();
  const { enterGuestMode } = useAuth();
  const { width: screenWidth } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const slides: Slide[] = [
    {
      key: 'cards',
      icon: <Ticket size={ms(56)} color={theme.text} strokeWidth={1.5} />,
      titleKey: 'welcome.featureCardsTitle',
      descKey: 'welcome.featureCardsDesc',
    },
    {
      key: 'discover',
      icon: <MapPin size={ms(56)} color={theme.text} strokeWidth={1.5} />,
      titleKey: 'welcome.featureDiscoverTitle',
      descKey: 'welcome.featureDiscoverDesc',
    },
    {
      key: 'qr',
      icon: <QrCode size={ms(56)} color={theme.text} strokeWidth={1.5} />,
      titleKey: 'welcome.featureQrTitle',
      descKey: 'welcome.featureQrDesc',
    },
    {
      key: 'notifications',
      icon: <Bell size={ms(56)} color={theme.text} strokeWidth={1.5} />,
      titleKey: 'welcome.featureNotifTitle',
      descKey: 'welcome.featureNotifDesc',
    },
    {
      key: 'rewards',
      icon: <Gift size={ms(56)} color={theme.text} strokeWidth={1.5} />,
      titleKey: 'welcome.featureRewardsTitle',
      descKey: 'welcome.featureRewardsDesc',
    },
  ];

  const isLast = activeIndex === slides.length - 1;

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / screenWidth);
    setActiveIndex(index);
  }, []);

  const handleNext = useCallback(() => {
    if (isLast) {
      router.replace('/login');
    } else {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    }
  }, [activeIndex, isLast]);

  const handleExplore = useCallback(() => {
    enterGuestMode();
    router.replace('/(tabs)/discover');
  }, [enterGuestMode]);

  const renderSlide = useCallback(({ item }: { item: Slide }) => (
    <View style={[styles.slide, { width: screenWidth }]}>
      {/* Brand */}
      <View style={styles.brandRow}>
        <BrandText size={24} />
      </View>

      {/* Icon */}
      <View style={[styles.iconCircle, { backgroundColor: theme.accentBg }]}>
        {item.icon}
      </View>

      {/* Text */}
      <Text style={[styles.slideTitle, { color: theme.text }]}>{t(item.titleKey)}</Text>
      <Text style={[styles.slideDesc, { color: theme.textSecondary }]}>{t(item.descKey)}</Text>
    </View>
  ), [theme, t, screenWidth]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Language picker */}
      <SafeAreaView edges={['top']} style={styles.langBar}>
        <View style={styles.langRow}>
          {LANGS.map(({ code, flag }) => {
            const active = locale === code;
            return (
              <TouchableOpacity
                key={code}
                activeOpacity={0.7}
                onPress={async () => {
                  if (code !== locale) {
                    await setLocale(code);
                    if (code === 'ar' || locale === 'ar') {
                      Alert.alert(
                        t('profile.language'),
                        t('profile.restartRequired'),
                        [{ text: t('common.ok') }],
                      );
                    }
                  }
                }}
                style={[
                  styles.langBtn,
                  active && { backgroundColor: `${palette.violet}15`, borderColor: palette.violet },
                ]}
              >
                <Text style={styles.langFlag}>{flag}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>

      <FlatList
        ref={flatListRef}
        data={slides}
        renderItem={renderSlide}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        bounces={false}
      />

      {/* Bottom: dots + button */}
      <SafeAreaView edges={['bottom']} style={styles.bottomSafe}>
        {/* Dots */}
        <View style={styles.dotsRow}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === activeIndex ? palette.violet : theme.border,
                  width: i === activeIndex ? wp(24) : wp(8),
                },
              ]}
            />
          ))}
        </View>

        {/* Next / Start button */}
        <TouchableOpacity activeOpacity={0.85} onPress={handleNext} style={styles.nextBtn}>
          <LinearGradient
            colors={[brandGradient[0], brandGradient[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientBtn}
          >
            <Text style={styles.nextBtnText}>
              {isLast ? t('welcome.start') : t('welcome.next')}
            </Text>
            <ArrowRight size={ms(20)} color="#FFFFFF" style={{ marginLeft: wp(8) }} />
          </LinearGradient>
        </TouchableOpacity>

        {/* Guest explore link */}
        <TouchableOpacity activeOpacity={0.7} onPress={handleExplore} style={styles.exploreBtn}>
          <Eye size={ms(16)} color={theme.textSecondary} strokeWidth={1.5} style={{ marginRight: wp(6) }} />
          <Text style={[styles.exploreBtnText, { color: theme.textSecondary }]}>
            {t('welcome.exploreGuest')}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.madeIn, { color: theme.textMuted }]}>Made in Morocco 🇲🇦</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: wp(32),
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: hp(32),
  },
  appName: {
    marginBottom: hp(32),
  },
  iconCircle: {
    width: wp(110),
    height: wp(110),
    borderRadius: wp(55),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: hp(28),
  },
  slideTitle: {
    fontFamily: 'Lexend_600SemiBold',
    fontSize: ms(24),
    textAlign: 'center',
    marginBottom: hp(12),
    lineHeight: ms(32),
  },
  slideDesc: {
    fontFamily: 'Lexend_400Regular',
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: ms(24),
    paddingHorizontal: wp(8),
  },
  bottomSafe: { paddingHorizontal: wp(24), paddingBottom: hp(12) },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: hp(16),
    gap: wp(6),
    marginBottom: hp(20),
  },
  dot: {
    height: wp(8),
    borderRadius: wp(4),
  },
  nextBtn: { borderRadius: radius.xl, overflow: 'hidden' },
  gradientBtn: {
    paddingVertical: hp(16),
    paddingHorizontal: wp(24),
    borderRadius: radius.xl,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  nextBtnText: {
    fontFamily: 'Lexend_600SemiBold',
    fontSize: fontSize.md,
    color: '#FFFFFF',
  },
  exploreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: hp(14),
    paddingVertical: hp(8),
  },
  exploreBtnText: {
    fontFamily: 'Lexend_500Medium',
    fontSize: fontSize.sm,
  },
  madeIn: {
    fontFamily: 'Lexend_400Regular',
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: hp(10),
  },
  langBar: { position: 'absolute', top: 0, right: 0, zIndex: 10, paddingRight: wp(16) },
  langRow: { flexDirection: 'row', gap: wp(6), paddingTop: hp(4) },
  langBtn: {
    paddingHorizontal: wp(10),
    paddingVertical: hp(6),
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  langFlag: { fontSize: ms(20) },
});
