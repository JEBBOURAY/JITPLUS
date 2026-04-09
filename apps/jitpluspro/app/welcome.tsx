import React, { useRef, useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScanLine, Users, BarChart3, Bell, Gift, ArrowRight } from 'lucide-react-native';
import { useTheme, palette, brandGradient } from '@/contexts/ThemeContext';
import { useLanguage, LANGUAGES } from '@/contexts/LanguageContext';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

interface Slide {
  key: string;
  icon: React.ReactNode;
  titleKey: string;
  descKey: string;
}

export default function WelcomeScreen() {
  const theme = useTheme();
  const { t, locale, setLocale } = useLanguage();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const { width: SCREEN_WIDTH } = useWindowDimensions();

  const slides = useMemo<Slide[]>(() => [
    {
      key: 'scanner',
      icon: <ScanLine size={ms(56)} color={palette.violet} />,
      titleKey: 'welcome.featureScanTitle',
      descKey: 'welcome.featureScanDesc',
    },
    {
      key: 'clients',
      icon: <Users size={ms(56)} color={palette.cyan} />,
      titleKey: 'welcome.featureClientsTitle',
      descKey: 'welcome.featureClientsDesc',
    },
    {
      key: 'dashboard',
      icon: <BarChart3 size={ms(56)} color={palette.violet} />,
      titleKey: 'welcome.featureDashboardTitle',
      descKey: 'welcome.featureDashboardDesc',
    },
    {
      key: 'notifications',
      icon: <Bell size={ms(56)} color={palette.cyan} />,
      titleKey: 'welcome.featureNotifTitle',
      descKey: 'welcome.featureNotifDesc',
    },
    {
      key: 'rewards',
      icon: <Gift size={ms(56)} color={palette.violet} />,
      titleKey: 'welcome.featureRewardsTitle',
      descKey: 'welcome.featureRewardsDesc',
    },
  ], []);

  const isLast = activeIndex === slides.length - 1;

  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setActiveIndex(index);
  }, [SCREEN_WIDTH]);

  const handleNext = useCallback(() => {
    if (isLast) {
      router.replace('/login');
    } else {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    }
  }, [activeIndex, isLast]);

  const renderSlide = useCallback(({ item }: { item: Slide }) => (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      {/* Logo */}
      <Image
        source={require('@/assets/images/jitplusprologo.png')}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={[styles.appName, { color: theme.text }]}>JitPlus Pro</Text>

      {/* Icon */}
      <View style={[styles.iconCircle, { backgroundColor: theme.accentBg }]}>
        {item.icon}
      </View>

      {/* Text */}
      <Text style={[styles.slideTitle, { color: theme.text }]}>{t(item.titleKey)}</Text>
      <Text style={[styles.slideDesc, { color: theme.textSecondary }]}>{t(item.descKey)}</Text>
    </View>
  ), [theme, t]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Language picker */}
      <SafeAreaView edges={['top']} style={styles.langBar}>
        <View style={styles.langRow}>
          {LANGUAGES.map(({ code, flag }) => {
            const active = locale === code;
            return (
              <TouchableOpacity
                key={code}
                activeOpacity={0.7}
                onPress={async () => {
                  if (code !== locale) {
                    await setLocale(code);
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
        getItemLayout={(_data, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
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
            <ArrowRight size={ms(20)} color="#FFFFFF" style={styles.nextBtnIcon} />
          </LinearGradient>
        </TouchableOpacity>

        <Text style={[styles.madeIn, { color: theme.textMuted }]}>{t('welcome.madeIn')}</Text>
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
  logo: { width: wp(72), height: wp(72), borderRadius: wp(18), marginBottom: hp(6) },
  appName: {
    fontFamily: 'Lexend_700Bold',
    fontSize: fontSize.lg,
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
    marginBottom: hp(20),
    gap: wp(6),
  },
  dot: {
    height: wp(8),
    borderRadius: wp(4),
  },
  nextBtn: { borderRadius: radius.xl, overflow: 'hidden' },
  gradientBtn: {
    paddingVertical: hp(16),
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
  nextBtnIcon: { marginLeft: wp(8) },
  madeIn: {
    fontFamily: 'Lexend_400Regular',
    fontSize: fontSize.xs,
    textAlign: 'center',
    marginTop: hp(12),
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
