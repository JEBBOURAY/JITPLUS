import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, RefreshControl, StyleSheet, Pressable,
  TouchableOpacity, Platform, Share, ActivityIndicator, Linking, Alert,
} from 'react-native';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, Copy, Share2, Gift, Clock, CheckCircle, Users,
  Smartphone, UserPlus, CreditCard, BadgeCheck, Mail, MessageCircle, AlertCircle, Banknote,
} from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// Lazy-loaded to avoid native crash if the module isn't linked
let Clipboard: typeof import('expo-clipboard') | null = null;
try { Clipboard = require('expo-clipboard'); } catch { /* module not available */ }
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/services/api';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { haptic, HapticStyle } from '@/utils/haptics';
import type { ClientReferralStats } from '@/types';
import { useFocusEffect } from 'expo-router';

export default function ReferralScreen() {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: stats = null, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useQuery<ClientReferralStats>({
    queryKey: ['referralStats'],
    queryFn: () => api.getReferralStats(),
    staleTime: 2 * 60 * 1000, // 2 min
  });

  const { data: payoutHistory = [], refetch: refetchHistory } = useQuery<Array<{
    id: string; amount: number; status: string; method: string; createdAt: string;
  }>>({
    queryKey: ['payoutHistory'],
    queryFn: () => api.getPayoutHistory().catch(() => []),
    staleTime: 2 * 60 * 1000,
  });

  const loading = statsLoading;
  const error = statsError;

  const [copied, setCopied] = useState(false);
  const [requestingPayout, setRequestingPayout] = useState(false);

  // Refetch on focus only if data is stale
  useFocusEffect(
    useCallback(() => {
      refetchStats();
      refetchHistory();
    }, [refetchStats, refetchHistory]),
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchStats(), refetchHistory()]);
    setRefreshing(false);
  }, [refetchStats, refetchHistory]);

  const handleCopy = useCallback(async () => {
    if (!stats?.referralCode) return;
    try {
      if (Clipboard?.setStringAsync) {
        await Clipboard.setStringAsync(stats.referralCode);
      }
      haptic(HapticStyle.Light);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access failed - ignore
    }
  }, [stats?.referralCode]);

  const handleShare = useCallback(async () => {
    if (!stats?.referralCode) return;
    try {
      const message = t('referral.shareMessage', { code: stats.referralCode });
      await Share.share({ message });
    } catch {
      // User dismissed the share dialog or share failed - ignore
    }
  }, [stats?.referralCode, t]);

  const canRequestPayout = (stats?.referralBalance ?? 0) >= 100;

  const handlePayoutRequest = useCallback(() => {
    if (!stats || !canRequestPayout) return;
    const balance = (stats.referralBalance || 0).toFixed(0);
    const submitPayout = async (method: 'CASH' | 'BANK_TRANSFER') => {
      try {
        setRequestingPayout(true);
        await api.requestPayout(stats.referralBalance || 0, method);
        Alert.alert('Succ\u00e8s', 'Votre demande de retrait a \u00e9t\u00e9 envoy\u00e9e. Vous serez contact\u00e9 pour finaliser le paiement.');
        refetchStats();
        refetchHistory();
      } catch (err: any) {
        Alert.alert('Erreur', err?.response?.data?.message || 'Une erreur est survenue.');
      } finally {
        setRequestingPayout(false);
      }
    };
    Alert.alert(
      'Demander le retrait',
      `Retirer ${balance} DH \u2014 choisissez la m\u00e9thode :`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: '\ud83d\udcb5 Cash', onPress: () => submitPayout('CASH') },
        { text: '\ud83c\udfe6 Virement', onPress: () => submitPayout('BANK_TRANSFER') },
      ],
    );
  }, [stats, canRequestPayout, refetchStats, refetchHistory, t]);

  const formatDate = (dateStr: string | null | undefined) => {
    try {
      if (!dateStr) return '\u2014';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '\u2014';
      return d.toLocaleDateString(locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-GB' : 'fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '\u2014';
    }
  };

  const isRTL = locale === 'ar';

  return (
    <View style={[styles.gradient, { backgroundColor: theme.bg }]}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={[styles.header, isRTL && styles.headerRTL]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <ArrowLeft
              size={ms(22)}
              color={theme.text}
              strokeWidth={2}
              style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{t('referral.title')}</Text>
          <View style={{ width: ms(24) }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.violet} />}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <ActivityIndicator size="large" color={palette.violet} style={{ marginTop: hp(60) }} />
          ) : stats ? (
            <>
              {/* Balance card */}
              <View style={[styles.balanceCard, { backgroundColor: palette.violet }]}>
                <Text style={styles.balanceLabel}>{t('referral.balance')}</Text>
                <Text style={styles.balanceAmount}>
                  {(stats.referralBalance ?? 0).toFixed(0)} {t('referral.balanceUnit')}
                </Text>
                  <TouchableOpacity
                    onPress={handlePayoutRequest}
                    disabled={requestingPayout || !canRequestPayout}
                    activeOpacity={canRequestPayout ? 0.7 : 1}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: canRequestPayout ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                      paddingHorizontal: wp(16),
                      paddingVertical: hp(8),
                      borderRadius: radius.md,
                      marginTop: hp(12),
                      opacity: canRequestPayout ? 1 : 0.6,
                    }}
                  >
                    {requestingPayout ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Banknote size={ms(18)} color="#fff" />
                        <Text style={{ color: '#fff', marginLeft: wp(8), fontWeight: '600' }}>
                          Demander le paiement
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {!canRequestPayout && (
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: FS.xs, marginTop: hp(6), textAlign: 'center' }}>
                      Minimum 100 DH requis pour demander le paiement
                    </Text>
                  )}
              </View>

              {/* Referral code */}
              <View style={[styles.codeCard, { backgroundColor: theme.bgCard }]}>
                <Text style={[styles.codeLabel, { color: theme.textMuted }]}>{t('referral.yourCode')}</Text>
                <Text style={[styles.codeValue, { color: theme.text }]}>{stats.referralCode}</Text>
                <View style={[styles.codeActions, isRTL && styles.codeActionsRTL]}>
                  <Pressable
                    onPress={handleCopy}
                    style={({ pressed }) => [
                      styles.codeBtn,
                      { backgroundColor: copied ? `${palette.emerald}15` : `${palette.violet}15` },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    {copied ? (
                      <CheckCircle size={ms(16)} color={palette.emerald} strokeWidth={2} />
                    ) : (
                      <Copy size={ms(16)} color={palette.violet} strokeWidth={2} />
                    )}
                    <Text style={[styles.codeBtnText, { color: copied ? palette.emerald : palette.violet }]}>
                      {copied ? t('referral.codeCopied') : t('referral.copyCode')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleShare}
                    style={({ pressed }) => [
                      styles.codeBtn,
                      { backgroundColor: `${palette.violet}15` },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Share2 size={ms(16)} color={palette.violet} strokeWidth={2} />
                    <Text style={[styles.codeBtnText, { color: palette.violet }]}>
                      {t('referral.shareCode')}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Referral list */}
              <View style={styles.listSection}>
                <View style={[styles.listHeader, isRTL && styles.listHeaderRTL]}>
                  <Users size={ms(18)} color={theme.text} strokeWidth={2} />
                  <Text style={[styles.listTitle, { color: theme.text }]}>
                    {t('referral.referralList')} ({stats.referredCount ?? 0})
                  </Text>
                </View>

                {!stats.referrals?.length ? (
                  <View style={[styles.emptyCard, { backgroundColor: theme.bgCard }]}>
                    <Gift size={ms(40)} color={theme.textMuted} strokeWidth={1} />
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('referral.noReferrals')}</Text>
                    <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>{t('referral.noReferralsDesc')}</Text>
                  </View>
                ) : (
                  <View style={[styles.listCard, { backgroundColor: theme.bgCard }]}>
                    {(stats.referrals ?? []).map((ref, idx, arr) => (
                      <View
                        key={ref.id}
                        style={[
                          styles.referralRow,
                          isRTL && styles.referralRowRTL,
                          idx === arr.length - 1 && { borderBottomWidth: 0 },
                          { borderBottomColor: theme.border },
                        ]}
                      >
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: ref.status === 'VALIDATED' ? palette.emerald : palette.gold },
                          ]}
                        />
                        <View style={styles.referralInfo}>
                          <Text style={[styles.referralName, { color: theme.text }, isRTL && styles.textRTL]}>
                            {ref.merchantName}
                          </Text>
                          <Text style={[styles.referralMeta, { color: theme.textMuted }, isRTL && styles.textRTL]}>
                            {ref.status === 'VALIDATED' && ref.validatedAt
                              ? t('referral.validatedOn', { date: formatDate(ref.validatedAt) })
                              : t('referral.referredOn', { date: formatDate(ref.createdAt) })}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor:
                                ref.status === 'VALIDATED' ? `${palette.emerald}15` : `${palette.gold}15`,
                            },
                          ]}
                        >
                          {ref.status === 'VALIDATED' ? (
                            <CheckCircle size={ms(12)} color={palette.emerald} strokeWidth={2} />
                          ) : (
                            <Clock size={ms(12)} color={palette.gold} strokeWidth={2} />
                          )}
                          <Text
                            style={[
                              styles.statusText,
                              { color: ref.status === 'VALIDATED' ? palette.emerald : palette.gold },
                            ]}
                          >
                            {ref.status === 'VALIDATED'
                              ? t('referral.statusValidated')
                              : t('referral.statusPending')}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {/* Payout history */}
              {payoutHistory.length > 0 && (
                <View style={styles.listSection}>
                  <View style={[styles.listHeader, isRTL && styles.listHeaderRTL]}>
                    <Banknote size={ms(18)} color={theme.text} strokeWidth={2} />
                    <Text style={[styles.listTitle, { color: theme.text }]}>
                      Historique des retraits
                    </Text>
                  </View>
                  <View style={[styles.listCard, { backgroundColor: theme.bgCard }]}>
                    {payoutHistory.map((p, idx) => {
                      const statusConfig: Record<string, { color: string; label: string }> = {
                        PENDING: { color: palette.gold, label: 'En attente' },
                        APPROVED: { color: palette.emerald, label: 'Approuv\u00e9' },
                        REJECTED: { color: palette.red, label: 'Rejet\u00e9' },
                        PAID: { color: palette.violet, label: 'Pay\u00e9' },
                      };
                      const sc = statusConfig[p.status] ?? { color: palette.gold, label: p.status };
                      return (
                        <View
                          key={p.id}
                          style={[
                            styles.referralRow,
                            isRTL && styles.referralRowRTL,
                            idx === payoutHistory.length - 1 && { borderBottomWidth: 0 },
                            { borderBottomColor: theme.border },
                          ]}
                        >
                          <View style={[styles.statusDot, { backgroundColor: sc.color }]} />
                          <View style={styles.referralInfo}>
                            <Text style={[styles.referralName, { color: theme.text }, isRTL && styles.textRTL]}>
                              {p.amount} DH \u2014 {p.method === 'CASH' ? 'Cash' : 'Virement'}
                            </Text>
                            <Text style={[styles.referralMeta, { color: theme.textMuted }, isRTL && styles.textRTL]}>
                              {formatDate(p.createdAt)}
                            </Text>
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: `${sc.color}15` }]}>
                            {p.status === 'PAID' || p.status === 'APPROVED' ? (
                              <CheckCircle size={ms(12)} color={sc.color} strokeWidth={2} />
                            ) : p.status === 'REJECTED' ? (
                              <AlertCircle size={ms(12)} color={sc.color} strokeWidth={2} />
                            ) : (
                              <Clock size={ms(12)} color={sc.color} strokeWidth={2} />
                            )}
                            <Text style={[styles.statusText, { color: sc.color }]}>
                              {sc.label}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* How it works */}
              <View style={[styles.howCard, { backgroundColor: theme.bgCard }]}>
                <Text style={[styles.howTitle, { color: theme.text }]}>{t('referral.howTitle')}</Text>

                <View style={[styles.howStep, isRTL && styles.howStepRTL]}>
                  <View style={[styles.howStepIcon, { backgroundColor: `${palette.gold}12` }]}>
                    <View style={styles.howStepNumber}>
                      <Text style={styles.howStepNumberText}>1</Text>
                    </View>
                    <Share2 size={ms(16)} color={palette.gold} strokeWidth={2} />
                  </View>
                  <View style={styles.howStepContent}>
                    <Text style={[styles.howStepTitle, { color: theme.text }]}>{t('referral.howStep1Title')}</Text>
                    <Text style={[styles.howStepDesc, { color: theme.textMuted }]}>{t('referral.howStep1Desc')}</Text>
                  </View>
                </View>

                <View style={[styles.howStep, isRTL && styles.howStepRTL]}>
                  <View style={[styles.howStepIcon, { backgroundColor: `${palette.gold}12` }]}>
                    <View style={styles.howStepNumber}>
                      <Text style={styles.howStepNumberText}>2</Text>
                    </View>
                    <Smartphone size={ms(16)} color={palette.gold} strokeWidth={2} />
                  </View>
                  <View style={styles.howStepContent}>
                    <Text style={[styles.howStepTitle, { color: theme.text }]}>{t('referral.howStep2Title')}</Text>
                    <Text style={[styles.howStepDesc, { color: theme.textMuted }]}>{t('referral.howStep2Desc')}</Text>
                  </View>
                </View>

                <View style={[styles.howStep, isRTL && styles.howStepRTL]}>
                  <View style={[styles.howStepIcon, { backgroundColor: `${palette.gold}12` }]}>
                    <View style={styles.howStepNumber}>
                      <Text style={styles.howStepNumberText}>3</Text>
                    </View>
                    <BadgeCheck size={ms(16)} color={palette.gold} strokeWidth={2} />
                  </View>
                  <View style={styles.howStepContent}>
                    <Text style={[styles.howStepTitle, { color: theme.text }]}>{t('referral.howStep3Title')}</Text>
                    <Text style={[styles.howStepDesc, { color: theme.textMuted }]}>{t('referral.howStep3Desc')}</Text>
                  </View>
                </View>

                <View style={[styles.howStep, isRTL && styles.howStepRTL, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                  <View style={[styles.howStepIcon, { backgroundColor: `${palette.gold}12` }]}>
                    <View style={styles.howStepNumber}>
                      <Text style={styles.howStepNumberText}>4</Text>
                    </View>
                    <CreditCard size={ms(16)} color={palette.gold} strokeWidth={2} />
                  </View>
                  <View style={styles.howStepContent}>
                    <Text style={[styles.howStepTitle, { color: theme.text }]}>{t('referral.howStep4Title')}</Text>
                    <Text style={[styles.howStepDesc, { color: theme.textMuted }]}>{t('referral.howStep4Desc')}</Text>
                  </View>
                </View>
              </View>

              {/* Contact support */}
              <View style={[styles.contactCard, { backgroundColor: theme.bgCard }]}>
                <Text style={[styles.contactText, { color: theme.textMuted }, isRTL && styles.textRTL]}>
                  {t('referral.contactSupportDesc')}
                </Text>
                <View style={[styles.contactActions, isRTL && styles.codeActionsRTL]}>
                  <Pressable
                    onPress={() => {
                      const phone = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || '212675346486';
                      Linking.openURL(`whatsapp://send?phone=${phone}&text=Bonjour%2C%20je%20souhaite%20d%C3%A9clencher%20le%20paiement%20de%20mon%20parrainage`).catch(() => {
                        Linking.openURL(`https://wa.me/${phone}?text=Bonjour%2C%20je%20souhaite%20d%C3%A9clencher%20le%20paiement%20de%20mon%20parrainage`);
                      });
                    }}
                    style={({ pressed }) => [
                      styles.contactBtn,
                      { backgroundColor: '#25D36615' },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <MessageCircle size={ms(16)} color="#25D366" strokeWidth={2} />
                    <Text style={[styles.contactBtnText, { color: '#25D366' }]}>WhatsApp</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => Linking.openURL('mailto:contact@jitplus.com?subject=Paiement%20parrainage')}
                    style={({ pressed }) => [
                      styles.contactBtn,
                      { backgroundColor: `${palette.red}15` },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Mail size={ms(16)} color={palette.red} strokeWidth={2} />
                    <Text style={[styles.contactBtnText, { color: palette.red }]}>Email</Text>
                  </Pressable>
                </View>
              </View>
            </>
          ) : error ? (
            <View style={{ alignItems: 'center', marginTop: hp(60), paddingHorizontal: wp(24) }}>
              <Text style={{ color: theme.text, fontSize: FS.md, fontWeight: '600', marginBottom: hp(8) }}>
                {t('common.genericError')}
              </Text>
              <Pressable
                onPress={() => { refetchStats(); refetchHistory(); }}
                style={{ backgroundColor: palette.violet, paddingHorizontal: wp(24), paddingVertical: hp(10), borderRadius: radius.md }}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: FS.sm }}>{t('common.retry')}</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(16),
    paddingVertical: hp(12),
  },
  headerRTL: { flexDirection: 'row-reverse' },
  headerTitle: {
    fontSize: FS.lg,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: wp(16),
    paddingBottom: hp(40),
  },

  // Balance card
  balanceCard: {
    borderRadius: radius.xl,
    padding: wp(20),
    alignItems: 'center',
    marginBottom: hp(16),
  },
  balanceLabel: {
    fontSize: FS.sm,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
    marginBottom: hp(4),
  },
  balanceAmount: {
    fontSize: ms(32),
    fontWeight: '800',
    color: '#fff',
    marginBottom: hp(6),
  },
  balanceHint: {
    fontSize: FS.xs,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  },

  // Code card
  codeCard: {
    borderRadius: radius.xl,
    padding: wp(20),
    alignItems: 'center',
    marginBottom: hp(20),
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  codeLabel: {
    fontSize: FS.sm,
    fontWeight: '500',
    marginBottom: hp(8),
  },
  codeValue: {
    fontSize: ms(26),
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: hp(16),
  },
  codeActions: {
    flexDirection: 'row',
    gap: wp(12),
  },
  codeActionsRTL: { flexDirection: 'row-reverse' },
  codeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(6),
    paddingHorizontal: wp(14),
    paddingVertical: hp(10),
    borderRadius: radius.lg,
  },
  codeBtnText: {
    fontSize: FS.sm,
    fontWeight: '600',
  },

  // List
  listSection: {
    marginBottom: hp(20),
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
    marginBottom: hp(12),
  },
  listHeaderRTL: { flexDirection: 'row-reverse' },
  listTitle: {
    fontSize: FS.md,
    fontWeight: '700',
  },
  listCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  emptyCard: {
    borderRadius: radius.xl,
    padding: wp(32),
    alignItems: 'center',
    gap: hp(10),
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  emptyTitle: {
    fontSize: FS.md,
    fontWeight: '600',
  },
  emptyDesc: {
    fontSize: FS.sm,
    textAlign: 'center',
  },

  // Referral row
  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(16),
    paddingVertical: hp(14),
    gap: wp(10),
    borderBottomWidth: 0.5,
  },
  referralRowRTL: { flexDirection: 'row-reverse' },
  statusDot: {
    width: ms(8),
    height: ms(8),
    borderRadius: ms(4),
  },
  referralInfo: {
    flex: 1,
  },
  referralName: {
    fontSize: FS.md,
    fontWeight: '500',
  },
  referralMeta: {
    fontSize: FS.xs,
    marginTop: hp(2),
  },
  textRTL: { textAlign: 'right' },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(4),
    paddingHorizontal: wp(8),
    paddingVertical: hp(4),
    borderRadius: radius.md,
  },
  statusText: {
    fontSize: FS.xs,
    fontWeight: '600',
  },

  // Contact support
  contactCard: {
    borderRadius: radius.xl,
    padding: wp(20),
    marginBottom: hp(20),
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  contactText: {
    fontSize: FS.sm,
    lineHeight: ms(20),
    textAlign: 'center',
    marginBottom: hp(14),
  },
  contactActions: {
    flexDirection: 'row',
    gap: wp(12),
  },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(6),
    paddingHorizontal: wp(16),
    paddingVertical: hp(10),
    borderRadius: radius.lg,
  },
  contactBtnText: {
    fontSize: FS.sm,
    fontWeight: '600',
  },

  // How it works
  howCard: {
    borderRadius: radius.xl,
    padding: wp(20),
    marginBottom: hp(20),
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  howTitle: {
    fontSize: FS.md,
    fontWeight: '700',
    marginBottom: hp(16),
  },
  howStep: {
    flexDirection: 'row',
    gap: wp(12),
    paddingBottom: hp(14),
    marginBottom: hp(14),
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(128,128,128,0.15)',
  },
  howStepRTL: { flexDirection: 'row-reverse' },
  howStepIcon: {
    width: ms(40),
    height: ms(40),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  howStepNumber: {
    position: 'absolute',
    top: -ms(4),
    right: -ms(4),
    width: ms(16),
    height: ms(16),
    borderRadius: ms(8),
    backgroundColor: palette.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  howStepNumberText: {
    fontSize: ms(9),
    fontWeight: '800',
    color: '#fff',
  },
  howStepContent: {
    flex: 1,
  },
  howStepTitle: {
    fontSize: FS.sm,
    fontWeight: '600',
    marginBottom: hp(3),
  },
  howStepDesc: {
    fontSize: FS.xs,
    lineHeight: ms(17),
  },
});