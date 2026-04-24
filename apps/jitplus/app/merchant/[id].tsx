import { useState, useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, Pressable, Share, Alert, ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { useLocalSearchParams, useRouter, Redirect } from 'expo-router';
import { ArrowLeft, AlertCircle, Eye, Users, Send, Flag } from 'lucide-react-native';
import { haptic } from '@/utils/haptics';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import Skeleton from '@/components/Skeleton';
import { getCategoryEmoji } from '@/utils/categories';
import { useMerchantById } from '@/hooks/useQueryHooks';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { getServerBaseUrl } from '@/services/api';
import { wp, hp, ms } from '@/utils/responsive';
import { resolveImageUrl } from '@/utils/imageUrl';
import * as Location from 'expo-location';
import {
  merchantStyles as styles,
  MerchantSocialLinks, MerchantLoyaltyRewards,
  MerchantLuckyWheel, MerchantLocations, MerchantBottomBar,
} from '@/components/merchant';

export default function MerchantDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAuthenticated } = useAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();

  const { data: merchant, isLoading: loading, refetch } = useMerchantById(id, isAuthenticated);
  const queryClient = useQueryClient();

  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const [joinLoading, setJoinLoading] = useState(false);
  const [justJoined, setJustJoined] = useState(false);
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [justLeft, setJustLeft] = useState(false);
  const joiningRef = useRef(false);
  const leavingRef = useRef(false);
  const [logoError, setLogoError] = useState(false);
  const [coverError, setCoverError] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 10000 });
          if (mounted) setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      } catch { /* location unavailable */ }
    })();
    return () => { mounted = false; };
  }, []);

  const handleJoinMerchant = useCallback(async () => {
    if (!id || joiningRef.current || merchant?.hasCard || justJoined) return;
    joiningRef.current = true;
    setJoinLoading(true);
    try {
      await api.joinMerchant(id);
      setJustJoined(true);
      setJustLeft(false);
      haptic();
      queryClient.invalidateQueries({ queryKey: ['merchant', id] });
      queryClient.invalidateQueries({ queryKey: ['points'] });
    } catch (e) {
      if (__DEV__) console.warn('Join merchant error:', e);
      Alert.alert(t('common.error'), t('merchant.joinError'));
    } finally {
      joiningRef.current = false;
      setJoinLoading(false);
    }
  }, [id, merchant?.hasCard, justJoined, queryClient, t]);

  const handleLeaveMerchant = useCallback(() => {
    if (!id || !merchant || leaveLoading) return;
    const balanceLabel = merchant.loyaltyType === 'STAMPS'
      ? t('merchant.leaveStampsWarning', { count: merchant.cardBalance ?? 0 })
      : t('merchant.leavePointsWarning', { count: merchant.cardBalance ?? 0 });
    Alert.alert(t('merchant.leaveTitle'), `${balanceLabel}\n\n${t('merchant.leaveMessage')}`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('merchant.leaveConfirm'), style: 'destructive',
        onPress: async () => {
          if (leavingRef.current) return;
          leavingRef.current = true;
          setLeaveLoading(true);
          try {
            await api.leaveMerchant(id);
            setJustLeft(true);
            setJustJoined(false);
            haptic();
            queryClient.invalidateQueries({ queryKey: ['merchant', id] });
            queryClient.invalidateQueries({ queryKey: ['points'] });
          } catch (e) {
            if (__DEV__) console.warn('Leave merchant error:', e);
            Alert.alert(t('common.error'), t('merchant.leaveError'));
          } finally {
            leavingRef.current = false;
            setLeaveLoading(false);
          }
        },
      },
    ]);
  }, [id, merchant, leaveLoading, queryClient, t]);

  // ─────────────────────────────────────────────────────────────────────────
  // Content reporting (App Store 1.2 / Play UGC compliance)
  // ─────────────────────────────────────────────────────────────────────────
  const reportingRef = useRef(false);
  const submitReport = useCallback(async (
    reason: 'inappropriate' | 'spam' | 'fraud' | 'closed' | 'wrong_info' | 'other',
  ) => {
    if (!id || reportingRef.current) return;
    reportingRef.current = true;
    try {
      await api.reportMerchant(id, reason);
      haptic();
      Alert.alert(t('merchant.reportThanksTitle'), t('merchant.reportThanksBody'));
    } catch (e) {
      if (__DEV__) console.warn('Report merchant error:', e);
      Alert.alert(t('common.error'), t('merchant.reportError'));
    } finally {
      reportingRef.current = false;
    }
  }, [id, t]);

  const handleReportMerchant = useCallback(() => {
    if (!id) return;
    Alert.alert(
      t('merchant.reportTitle'),
      t('merchant.reportBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('merchant.reportReasonInappropriate'), onPress: () => submitReport('inappropriate') },
        { text: t('merchant.reportReasonSpam'), onPress: () => submitReport('spam') },
        { text: t('merchant.reportReasonFraud'), onPress: () => submitReport('fraud') },
        { text: t('merchant.reportReasonClosed'), onPress: () => submitReport('closed') },
        { text: t('merchant.reportReasonWrongInfo'), onPress: () => submitReport('wrong_info') },
        { text: t('merchant.reportReasonOther'), onPress: () => submitReport('other') },
      ],
      { cancelable: true },
    );
  }, [id, submitReport, t]);

  // Block this merchant (Apple 1.2 requirement). Confirms then hides the
  // merchant everywhere and navigates back.
  const blockingRef = useRef(false);
  const handleBlockMerchant = useCallback(() => {
    if (!id || blockingRef.current) return;
    Alert.alert(
      t('merchant.blockTitle'),
      t('merchant.blockBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('merchant.blockConfirm'),
          style: 'destructive',
          onPress: async () => {
            blockingRef.current = true;
            try {
              await api.blockMerchant(id);
              haptic();
              queryClient.invalidateQueries({ queryKey: ['merchants'] });
              queryClient.invalidateQueries({ queryKey: ['merchant', id] });
              Alert.alert(
                t('merchant.blockedTitle'),
                t('merchant.blockedBody'),
                [{ text: t('common.ok'), onPress: () => router.back() }],
              );
            } catch (e) {
              if (__DEV__) console.warn('Block merchant error:', e);
              Alert.alert(t('common.error'), t('merchant.blockError'));
            } finally {
              blockingRef.current = false;
            }
          },
        },
      ],
      { cancelable: true },
    );
  }, [id, queryClient, router, t]);

  // Combined moderation action sheet: Report + Block.
  const handleModerationSheet = useCallback(() => {
    Alert.alert(
      t('merchant.moderationTitle'),
      t('merchant.moderationBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('merchant.reportTitle'), onPress: () => handleReportMerchant() },
        { text: t('merchant.blockTitle'), style: 'destructive', onPress: () => handleBlockMerchant() },
      ],
      { cancelable: true },
    );
  }, [handleReportMerchant, handleBlockMerchant, t]);

  if (!isAuthenticated) return <Redirect href="/welcome" />;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bgCard }]} edges={['top', 'bottom']}>
        <View style={styles.loadingWrap}>
          <Skeleton width={wp(80)} height={hp(30)} borderRadius={ms(18)} />
          <Skeleton width={ms(80)} height={ms(80)} borderRadius={ms(40)} />
          <Skeleton width={wp(200)} height={hp(24)} borderRadius={ms(8)} />
          <Skeleton width={wp(120)} height={hp(18)} borderRadius={ms(9)} />
          <Skeleton width="100%" height={hp(100)} borderRadius={ms(16)} />
          <Skeleton width="100%" height={hp(80)} borderRadius={ms(16)} />
          <Skeleton width="100%" height={hp(50)} borderRadius={ms(14)} />
        </View>
      </SafeAreaView>
    );
  }

  if (!merchant) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bgCard }]} edges={['top', 'bottom']}>
        <View style={styles.errorContainer}>
          <View style={[styles.errorIcon, { backgroundColor: theme.borderLight }]}>
            <AlertCircle size={28} color={theme.textMuted} strokeWidth={2} />
          </View>
          <Text style={[styles.errorTitle, { color: theme.text }]}>{t('merchant.notFound')}</Text>
          <Text style={[styles.errorText, { color: theme.textMuted }]}>{t('merchant.notFoundDesc')}</Text>
          <Pressable onPress={() => router.back()} style={[styles.errorButton, { backgroundColor: theme.primary }]}>
            <Text style={styles.errorButtonText}>{t('common.back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero section */}
        <View style={styles.heroSection}>
          {merchant.coverUrl && !coverError ? (
            <Image source={resolveImageUrl(merchant.coverUrl)} style={styles.coverImage} contentFit="cover" cachePolicy="disk" recyclingKey={merchant.coverUrl} onError={() => setCoverError(true)} />
          ) : (
            <LinearGradient colors={[`${palette.violet}18`, `${palette.violet}08`, theme.bg]} style={styles.coverImage} />
          )}
          <LinearGradient colors={['transparent', theme.bg]} style={styles.coverFade} />
          <SafeAreaView edges={['top']} style={styles.floatingHeader}>
            <Pressable onPress={() => { haptic(); router.back(); }} style={[styles.floatingBtn, { backgroundColor: 'rgba(255,255,255,0.85)' }]} accessibilityRole="button" accessibilityLabel={t('common.back')} hitSlop={8}>
              <ArrowLeft size={20} color={palette.gray900} strokeWidth={2} />
            </Pressable>
            <Pressable onPress={async () => {
              haptic();
              try {
                const shareUrl = `${getServerBaseUrl()}/m/${merchant.id}`;
                await Share.share({ message: `${t('merchant.shareText', { name: merchant.nomBoutique })}\n\n${shareUrl}` });
              } catch { /* user cancelled */ }
            }} style={[styles.floatingBtn, { backgroundColor: 'rgba(255,255,255,0.85)' }]} accessibilityRole="button" accessibilityLabel={t('merchant.shareApp')} hitSlop={8}>
              <Send size={18} color={palette.gray900} strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={() => { haptic(); handleModerationSheet(); }}
              style={[styles.floatingBtn, { backgroundColor: 'rgba(255,255,255,0.85)' }]}
              accessibilityRole="button"
              accessibilityLabel={t('merchant.moderationTitle')}
              hitSlop={8}
            >
              <Flag size={18} color={palette.gray900} strokeWidth={2} />
            </Pressable>
          </SafeAreaView>
          <View style={styles.logoContainer}>
            <View style={[styles.logoRing, { backgroundColor: theme.bg }]}>
              {merchant.logoUrl && !logoError ? (
                <Image source={resolveImageUrl(merchant.logoUrl)} style={styles.logo} contentFit="cover" cachePolicy="disk" recyclingKey={merchant.logoUrl} onError={() => setLogoError(true)} />
              ) : (
                <View style={[styles.emojiWrap, { backgroundColor: `${palette.violet}10` }]}>
                  <Text style={styles.emoji}>{getCategoryEmoji(merchant.categorie)}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Identity */}
        <View style={styles.identitySection}>
          <Text style={[styles.merchantName, { color: theme.text }]} numberOfLines={2}>{merchant.nomBoutique}</Text>
          <View style={[styles.categoryBadge, { backgroundColor: `${palette.violet}10` }]}>
            <Text style={[styles.categoryText, { color: palette.violet }]} numberOfLines={1}>{getCategoryEmoji(merchant.categorie)} {merchant.categorie}</Text>
          </View>
          <View style={styles.statsRow}>
            <View style={[styles.statChip, { backgroundColor: theme.bgCard }]}>
              <Eye size={15} color={palette.violet} strokeWidth={2} />
              <Text style={[styles.statValue, { color: theme.text }]}>{(merchant.profileViews ?? 0).toLocaleString('fr-MA')}</Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>{t('merchant.views')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={[styles.statChip, { backgroundColor: theme.bgCard }]}>
              <Users size={15} color={palette.violet} strokeWidth={2} />
              <Text style={[styles.statValue, { color: theme.text }]}>{(merchant.clientCount ?? 0).toLocaleString('fr-MA')}</Text>
              <Text style={[styles.statLabel, { color: theme.textMuted }]}>{t('merchant.clients')}</Text>
            </View>
          </View>
        </View>

        <MerchantSocialLinks merchant={merchant} t={t} />

        <View style={styles.contentArea}>
          {!!merchant.description && (
            <LinearGradient colors={[theme.bgCard, `${palette.violet}10`, `${palette.violet}18`]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.descriptionCard, { backgroundColor: theme.bgCard }]}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('merchant.aboutUs')}</Text>
              <Text style={[styles.descriptionText, { color: theme.textSecondary }]}>{merchant.description}</Text>
            </LinearGradient>
          )}
          {merchant.activeLuckyWheel && <MerchantLuckyWheel merchant={merchant} theme={theme} t={t} />}
          <MerchantLoyaltyRewards merchant={merchant} justJoined={justJoined} theme={theme} t={t} />
          <MerchantLocations merchant={merchant} userLocation={userLocation} theme={theme} t={t} />
        </View>
      </ScrollView>

      <MerchantBottomBar
        merchant={merchant} justJoined={justJoined} justLeft={justLeft}
        joinLoading={joinLoading} leaveLoading={leaveLoading}
        handleJoinMerchant={handleJoinMerchant} handleLeaveMerchant={handleLeaveMerchant}
        theme={theme} t={t}
      />
    </View>
  );
}
