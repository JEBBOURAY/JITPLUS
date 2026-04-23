import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, RefreshControl, Pressable,
  TouchableOpacity, Platform, Share, ActivityIndicator, Linking, Alert,
} from 'react-native';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, Users, Gift, Clock, CheckCircle,
  MessageCircle, Mail, AlertCircle, Banknote,
} from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useQuery } from '@tanstack/react-query';

let Clipboard: typeof import('expo-clipboard') | null = null;
try { Clipboard = require('expo-clipboard'); } catch { /* module not available */ }
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/services/api';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { haptic, HapticStyle } from '@/utils/haptics';
import { extractErrorMessage } from '@/utils/errorMessage';
import type { ClientReferralStats } from '@/types';
import { useFocusEffect } from 'expo-router';
import {
  referralStyles as styles,
  ReferralBalanceCard, ReferralCodeCard, HowItWorks,
  MyReferralsList, PayoutHistoryList, ReferralContactCard,
} from '@/components/referral';
import Skeleton from '@/components/Skeleton';

export default function ReferralScreen() {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const router = useRouter();

  const { data: stats = null, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useQuery<ClientReferralStats>({
    queryKey: ['referralStats'],
    queryFn: () => api.getReferralStats(),
    staleTime: 2 * 60 * 1000,
  });

  const { data: payoutHistory = [], refetch: refetchHistory } = useQuery<Array<{
    id: string; amount: number; status: string; method: string; createdAt: string;
  }>>({
    queryKey: ['payoutHistory'],
    queryFn: () => api.getPayoutHistory(),
    staleTime: 2 * 60 * 1000,
  });

  const loading = statsLoading;
  const error = statsError;
  const [copied, setCopied] = useState(false);
  const [requestingPayout, setRequestingPayout] = useState(false);

  useFocusEffect(useCallback(() => { refetchStats(); refetchHistory(); }, [refetchStats, refetchHistory]));

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchStats(), refetchHistory()]);
    setRefreshing(false);
  }, [refetchStats, refetchHistory]);

  const handleCopy = useCallback(async () => {
    if (!stats?.referralCode) return;
    try {
      if (Clipboard?.setStringAsync) await Clipboard.setStringAsync(stats.referralCode);
      haptic(HapticStyle.Light);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [stats?.referralCode]);

  const handleShare = useCallback(async () => {
    if (!stats?.referralCode) return;
    try {
      await Share.share({ message: t('referral.shareMessage', { code: stats.referralCode }) });
    } catch { /* ignore */ }
  }, [stats?.referralCode, t]);

  const canRequestPayout = (stats?.referralBalance ?? 0) >= 100;

  const handlePayoutRequest = useCallback(() => {
    if (!stats || !canRequestPayout) return;
    const balance = (stats.referralBalance || 0).toFixed(0);
    const submitPayout = async (method: 'CASH' | 'BANK_TRANSFER') => {
      try {
        setRequestingPayout(true);
        await api.requestPayout(stats.referralBalance || 0, method);
        Alert.alert(t('common.success'), t('referral.payoutSuccess'));
        refetchStats(); refetchHistory();
      } catch (err: unknown) {
        Alert.alert(t('common.error'), extractErrorMessage(err) || t('referral.payoutError'));
      } finally { setRequestingPayout(false); }
    };
    Alert.alert(t('referral.payoutTitle'), t('referral.payoutConfirm', { amount: balance }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('referral.payoutCash'), onPress: () => submitPayout('CASH') },
      { text: t('referral.payoutTransfer'), onPress: () => submitPayout('BANK_TRANSFER') },
    ]);
  }, [stats, canRequestPayout, refetchStats, refetchHistory, t]);

  const formatDate = (dateStr: string | null | undefined) => {
    try {
      if (!dateStr) return '\u2014';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '\u2014';
      return d.toLocaleDateString(locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return '\u2014'; }
  };

  const isRTL = locale === 'ar';

  return (
    <View style={[styles.gradient, { backgroundColor: theme.bg }]}>
      <SafeAreaView style={styles.container}>
        <View style={[styles.header, isRTL && styles.headerRTL]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <ArrowLeft size={ms(22)} color={theme.text} strokeWidth={2} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{t('referral.title')}</Text>
          <View style={{ width: ms(24) }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.violet} />} showsVerticalScrollIndicator={false}>
          {loading ? (
            <View style={{ gap: hp(16) }}>
              <Skeleton width="100%" height={hp(140)} borderRadius={radius.xl} />
              <Skeleton width="100%" height={hp(100)} borderRadius={radius.xl} />
              <Skeleton width="100%" height={hp(180)} borderRadius={radius.xl} />
              <Skeleton width="100%" height={hp(220)} borderRadius={radius.xl} />
            </View>
          ) : stats ? (
            <>
              <ReferralBalanceCard balance={stats.referralBalance ?? 0} canRequestPayout={canRequestPayout} requestingPayout={requestingPayout} onRequestPayout={handlePayoutRequest} t={t} />
              <ReferralCodeCard code={stats.referralCode} copied={copied} isRTL={isRTL} onCopy={handleCopy} onShare={handleShare} theme={theme} t={t} />

              <MyReferralsList stats={stats} isRTL={isRTL} theme={theme} t={t} formatDate={formatDate} />
              
              <PayoutHistoryList payoutHistory={payoutHistory} isRTL={isRTL} theme={theme} t={t} formatDate={formatDate} />

              <HowItWorks isRTL={isRTL} theme={theme} t={t} />

              <ReferralContactCard isRTL={isRTL} theme={theme} t={t} />
              
              {/* Footer Terms & Disclaimer */}
              <View style={{ marginTop: hp(24), marginBottom: hp(40), paddingHorizontal: wp(24), alignItems: 'center' }}>
                <Pressable onPress={() => Linking.openURL('https://jitplus.com/terms')}>
                  <Text style={{ color: theme.textMuted, fontSize: FS.xs, textDecorationLine: 'underline', marginBottom: hp(12) }}>
                    {t('referral.termsLink')}
                  </Text>
                </Pressable>
                {Platform.OS === 'ios' && (
                  <Text style={{ color: theme.textMuted, fontSize: ms(11), textAlign: 'center', opacity: 0.7 }}>
                    {t('referral.appleDisclaimer')}
                  </Text>
                )}
              </View>
            </>
          ) : error ? (
            <View style={{ alignItems: 'center', marginTop: hp(60), paddingHorizontal: wp(24) }}>
              <Text style={{ color: theme.text, fontSize: FS.md, fontWeight: '600', marginBottom: hp(8) }}>{t('common.genericError')}</Text>
              <Pressable onPress={() => { refetchStats(); refetchHistory(); }} style={{ backgroundColor: palette.violet, paddingHorizontal: wp(24), paddingVertical: hp(10), borderRadius: radius.md }}>
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: FS.sm }}>{t('common.retry')}</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
