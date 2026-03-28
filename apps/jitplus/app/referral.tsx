import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl, StyleSheet, Pressable,
  TouchableOpacity, Platform, Share, ActivityIndicator, Linking,
} from 'react-native';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, Copy, Share2, Gift, Clock, CheckCircle, Users,
  Smartphone, UserPlus, CreditCard, BadgeCheck, Mail, MessageCircle,
} from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme, palette } from '@/contexts/ThemeContext';
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

  const [stats, setStats] = useState<ClientReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      setError(false);
      const data = await api.getReferralStats();
      setStats(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchStats();
    }, [fetchStats]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchStats();
  }, [fetchStats]);

  const handleCopy = useCallback(async () => {
    if (!stats?.referralCode) return;
    try {
      await Clipboard.setStringAsync(stats.referralCode);
      haptic(HapticStyle.Light);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access failed – ignore
    }
  }, [stats?.referralCode]);

  const handleShare = useCallback(async () => {
    if (!stats?.referralCode) return;
    try {
      const message = t('referral.shareMessage', { code: stats.referralCode });
      await Share.share({ message });
    } catch {
      // User dismissed the share dialog or share failed – ignore
    }
  }, [stats?.referralCode, t]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-GB' : 'fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const isRTL = locale === 'ar';

  return (
    <View style={[styles.gradient, { backgroundColor: theme.bg }]}>
      <SafeAreaView style={styles.container}>
        {/* ── Header ── */}
        <View style={[styles.header, isRTL && styles.headerRTL]}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <ArrowLeft
              size={ms(22)}
              color={theme.text}
              strokeWidth={1.5}
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
              {/* ── Balance card ── */}
              <View style={[styles.balanceCard, { backgroundColor: palette.violet }]}>
                <Text style={styles.balanceLabel}>{t('referral.balance')}</Text>
                <Text style={styles.balanceAmount}>
                  {stats.referralBalance.toFixed(0)} {t('referral.balanceUnit')}
                </Text>
                <Text style={styles.balanceHint}>{t('referral.earnPerReferral')}</Text>
              </View>

              {/* ── Referral code ── */}
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
                      <CheckCircle size={ms(16)} color={palette.emerald} strokeWidth={1.5} />
                    ) : (
                      <Copy size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                    )}
                    <Text style={[styles.codeBtnText, { color: copied ? palette.emerald : palette.violet }]}>
                      {copied ? t('referral.codeCopied') : t('referral.copyCode')}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleShare}
                    style={({ pressed }) => [
                      styles.codeBtn,
                      { backgroundColor: `${palette.gold}15` },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Share2 size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                    <Text style={[styles.codeBtnText, { color: palette.gold }]}>
                      {t('referral.shareCode')}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* ── Referral list ── */}
              <View style={styles.listSection}>
                <View style={[styles.listHeader, isRTL && styles.listHeaderRTL]}>
                  <Users size={ms(18)} color={theme.text} strokeWidth={1.5} />
                  <Text style={[styles.listTitle, { color: theme.text }]}>
                    {t('referral.referralList')} ({stats.referredCount})
                  </Text>
                </View>

                {stats.referrals.length === 0 ? (
                  <View style={[styles.emptyCard, { backgroundColor: theme.bgCard }]}>
                    <Gift size={ms(40)} color={theme.textMuted} strokeWidth={1} />
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('referral.noReferrals')}</Text>
                    <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>{t('referral.noReferralsDesc')}</Text>
                  </View>
                ) : (
                  <View style={[styles.listCard, { backgroundColor: theme.bgCard }]}>
                    {stats.referrals.map((ref, idx) => (
                      <View
                        key={ref.id}
                        style={[
                          styles.referralRow,
                          isRTL && styles.referralRowRTL,
                          idx === stats.referrals.length - 1 && { borderBottomWidth: 0 },
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
                            <CheckCircle size={ms(12)} color={palette.emerald} strokeWidth={1.5} />
                          ) : (
                            <Clock size={ms(12)} color={palette.gold} strokeWidth={1.5} />
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

              {/* ── How it works ── */}
              <View style={[styles.howCard, { backgroundColor: theme.bgCard }]}> 
                <Text style={[styles.howTitle, { color: theme.text }]}>{t('referral.howTitle')}</Text>

                <View style={[styles.howStep, isRTL && styles.howStepRTL]}>
                  <View style={[styles.howStepIcon, { backgroundColor: `${palette.violet}12` }]}>
                    <View style={styles.howStepNumber}>
                      <Text style={styles.howStepNumberText}>1</Text>
                    </View>
                    <Share2 size={ms(16)} color={palette.violet} strokeWidth={1.5} />
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
                    <Smartphone size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                  </View>
                  <View style={styles.howStepContent}>
                    <Text style={[styles.howStepTitle, { color: theme.text }]}>{t('referral.howStep2Title')}</Text>
                    <Text style={[styles.howStepDesc, { color: theme.textMuted }]}>{t('referral.howStep2Desc')}</Text>
                  </View>
                </View>

                <View style={[styles.howStep, isRTL && styles.howStepRTL]}>
                  <View style={[styles.howStepIcon, { backgroundColor: `${palette.emerald}12` }]}>
                    <View style={styles.howStepNumber}>
                      <Text style={styles.howStepNumberText}>3</Text>
                    </View>
                    <BadgeCheck size={ms(16)} color={palette.emerald} strokeWidth={1.5} />
                  </View>
                  <View style={styles.howStepContent}>
                    <Text style={[styles.howStepTitle, { color: theme.text }]}>{t('referral.howStep3Title')}</Text>
                    <Text style={[styles.howStepDesc, { color: theme.textMuted }]}>{t('referral.howStep3Desc')}</Text>
                  </View>
                </View>

                <View style={[styles.howStep, isRTL && styles.howStepRTL, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                  <View style={[styles.howStepIcon, { backgroundColor: `${palette.violet}12` }]}>
                    <View style={styles.howStepNumber}>
                      <Text style={styles.howStepNumberText}>4</Text>
                    </View>
                    <CreditCard size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                  </View>
                  <View style={styles.howStepContent}>
                    <Text style={[styles.howStepTitle, { color: theme.text }]}>{t('referral.howStep4Title')}</Text>
                    <Text style={[styles.howStepDesc, { color: theme.textMuted }]}>{t('referral.howStep4Desc')}</Text>
                  </View>
                </View>
              </View>

              {/* ── Contact support ── */}
              <View style={[styles.contactCard, { backgroundColor: theme.bgCard }]}>
                <Text style={[styles.contactText, { color: theme.textMuted }, isRTL && styles.textRTL]}>
                  {t('referral.contactSupportDesc')}
                </Text>
                <View style={[styles.contactActions, isRTL && styles.codeActionsRTL]}>
                  <Pressable
                    onPress={() => Linking.openURL('https://wa.me/33767471397?text=Bonjour%2C%20je%20souhaite%20d%C3%A9clencher%20le%20paiement%20de%20mon%20parrainage')}
                    style={({ pressed }) => [
                      styles.contactBtn,
                      { backgroundColor: '#25D36615' },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <MessageCircle size={ms(16)} color="#25D366" strokeWidth={1.5} />
                    <Text style={[styles.contactBtnText, { color: '#25D366' }]}>WhatsApp</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => Linking.openURL('mailto:contact@jitplus.com?subject=Paiement%20parrainage')}
                    style={({ pressed }) => [
                      styles.contactBtn,
                      { backgroundColor: `${palette.violet}15` },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Mail size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                    <Text style={[styles.contactBtnText, { color: palette.violet }]}>Email</Text>
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
                onPress={() => { setLoading(true); fetchStats(); }}
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

  // ── Balance card ──
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

  // ── Code card ──
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

  // ── List ──
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

  // ── Referral row ──
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

  // ── Contact support ──
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

  // ── How it works ──
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
