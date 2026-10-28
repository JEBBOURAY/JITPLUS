import { useCallback, useMemo, useState } from 'react';
import {
  Image, Pressable, RefreshControl, ScrollView, StyleSheet, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { Text } from '@/components/AppText';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import Constants from 'expo-constants';
import { useAuth } from '@/contexts/AuthContext';
import { useAuthStore } from '@/stores/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import FadeInView from '@/components/FadeInView';
import GuestGuard from '@/components/GuestGuard';
import {
  AccountActions, PreferencesSection, ProfileCompletionCard, ProfileHeader,
  ReferralBanner, SecuritySection, SupportSection,
} from '@/components/profile';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useAppFonts } from '@/utils/fonts';
import { haptic, HapticStyle } from '@/utils/haptics';
import { getProfileCompletion } from '@/utils/profileCompletion';
import { fontSize as FS, hp, ms, wp } from '@/utils/responsive';

export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

const SCROLLED_THRESHOLD = 4;
const APP_VERSION = Constants.expoConfig?.version || '1.0.0';

export default function ProfileScreen() {
  const theme = useTheme();
  const fonts = useAppFonts();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, isRTL } = useLanguage();
  const { client, refreshProfile, isGuest } = useAuth();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useFocusEffect(useCallback(() => {
    if (isGuest) return;
    if (!useAuthStore.getState().client) refreshProfile().catch(() => {});
  }, [isGuest, refreshProfile]));

  const handleRefresh = useGuardedCallback(async () => {
    setIsRefreshing(true);
    haptic(HapticStyle.Light);
    await refreshProfile().catch(() => {});
    setIsRefreshing(false);
  });

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrolled = e.nativeEvent.contentOffset.y > SCROLLED_THRESHOLD;
    setIsScrolled((prev) => (prev === scrolled ? prev : scrolled));
  }, []);

  const completion = useMemo(() => getProfileCompletion(client, t), [client, t]);

  const openEdit = useCallback(() => { haptic(HapticStyle.Light); router.push('/edit-profile'); }, [router]);
  const openReferral = useCallback(() => { haptic(HapticStyle.Light); router.push('/referral'); }, [router]);
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  if (isGuest) return <GuestGuard />;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + hp(10), backgroundColor: theme.bg, borderBottomColor: isScrolled ? theme.border : 'transparent' },
          isScrolled && !theme.isDark && styles.headerShadow,
        ]}
      >
        <View style={styles.titleRow}>
          <Pressable
            onPress={goBack}
            hitSlop={12}
            style={[styles.backBtn, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <ArrowLeft size={ms(20)} color={theme.text} strokeWidth={2} style={isRTL ? styles.flip : undefined} />
          </Pressable>
          <Text style={[styles.title, { color: theme.text, fontFamily: fonts.bold }]} accessibilityRole="header" numberOfLines={1}>
            {t('tabs.profile')}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + hp(24) }]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.primaryLight}
            colors={[theme.primary]}
          />
        }
      >
        <FadeInView duration={280} distance={hp(10)}>
          <ProfileHeader
            client={client}
            isLoading={!client}
            onEdit={openEdit}
          />

          {!!client && completion.percent < 100 && (
            <ProfileCompletionCard
              percent={completion.percent}
              missingLabels={completion.missingLabels}
              onPress={openEdit}
            />
          )}

          <ReferralBanner onPress={openReferral} />
        </FadeInView>

        <FadeInView delay={80} duration={280} distance={hp(10)}>
          <PreferencesSection />
          <SecuritySection />
          <SupportSection />
          <AccountActions />

          <View style={styles.footer}>
            <Image source={require('@/assets/images/jitpluslogo-app.png')} style={styles.logo} resizeMode="contain" />
            <Text style={[styles.footerText, { color: theme.textMuted, fontFamily: fonts.medium }]}>{t('profile.footer')}</Text>
            <Text style={[styles.version, { color: theme.textMuted, fontFamily: fonts.regular }]}>v{APP_VERSION}</Text>
          </View>
        </FadeInView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: wp(20),
    paddingBottom: hp(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  headerShadow: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  titleRow: { minHeight: ms(46), flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  backBtn: { width: ms(40), height: ms(40), borderRadius: ms(20), borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  flip: { transform: [{ scaleX: -1 }] },
  title: { flex: 1, fontSize: FS['3xl'], letterSpacing: -0.6, textAlign: 'left' },
  content: { paddingHorizontal: wp(16), paddingTop: hp(8) },
  footer: { alignItems: 'center', paddingTop: hp(20) },
  logo: { width: ms(48), height: ms(48), borderRadius: ms(12), opacity: 0.9 },
  footerText: { fontSize: FS.xs, marginTop: hp(8), letterSpacing: 0.2 },
  version: { fontSize: FS.xs, marginTop: hp(2), opacity: 0.6 },
});
