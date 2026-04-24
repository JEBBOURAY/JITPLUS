import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
  Pressable,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Copy,
  Share2,
  Users,
  Check,
  Gift,
  Store,
  MapPin,
  Star,
  Zap,
  Send,
  UserPlus,
  Crown,
  Infinity,
  Clock,
} from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useReferral } from '@/hooks/useQueryHooks';
import { formatDate } from '@/utils/date';

// ── Store URLs for JitPlus Pro (merchant app) ──────────────────────────────
const PRO_ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.jitplus.pro';
const PRO_IOS_APP_ID = process.env.EXPO_PUBLIC_IOS_APP_ID ?? '';
const PRO_IOS_URL = PRO_IOS_APP_ID
  ? `https://apps.apple.com/app/id${PRO_IOS_APP_ID}`
  : 'https://apps.apple.com/search?term=jitplus+pro';

// ── Screen ─────────────────────────────────────────────────────────────────
export default function ReferralScreen() {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: stats, isLoading: loading, isError, refetch } = useReferral();
  const [copied, setCopied] = useState(false);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const handleCopy = useCallback(async () => {
    if (!stats?.referralCode) return;
    try {
      await Clipboard.setStringAsync(stats.referralCode);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert(t('common.error'), t('referralScreen.copyError'));
    }
  }, [stats?.referralCode, t]);

  const handleShare = useCallback(async () => {
    if (!stats?.referralCode) return;
    try {
      const links = `Android: ${PRO_ANDROID_URL}\niOS: ${PRO_IOS_URL}`;
      await Share.share({
        message: t('referralScreen.shareMessage', { code: stats.referralCode, links }),
        title: t('referral.shareCode'),
      });
    } catch {
      Alert.alert(t('common.error'), t('referralScreen.shareError'));
    }
  }, [stats?.referralCode, t]);

  const referredCountLabel = useMemo(() => {
    if (!stats) return '';
    const c = stats.referredCount;
    if (c === 0) return t('referral.referredCount_zero');
    if (c === 1) return t('referral.referredCount_one', { count: 1 });
    return t('referral.referredCount_other', { count: c });
  }, [stats, t]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Simple header — matches activity style ── */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('referral.title')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>{t('referral.loadingCode')}</Text>
        </View>
      ) : isError || !stats ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: theme.danger }]}>{t('referralScreen.loadError')}</Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: theme.primaryBg }]}
            onPress={() => refetch()}
            activeOpacity={0.7}
          >
            <Text style={[styles.retryBtnText, { color: theme.primary }]}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* ── Subtitle ── */}
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('referral.subtitle')}
          </Text>

          {/* ── Code card ── */}
          <View style={[styles.codeCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            <View style={[styles.codeIconWrap, { backgroundColor: theme.primaryBg }]}>
              <Gift size={24} color={theme.primary} />
            </View>
            <Text style={[styles.codeLabel, { color: theme.textMuted }]}>{t('referral.yourCode')}</Text>
            <Text
              style={[styles.codeValue, { color: theme.primary }]}
              selectable
              accessibilityLabel={`${t('referral.yourCode')}: ${stats.referralCode}`}
            >
              {stats.referralCode}
            </Text>

            <View style={styles.codeActions}>
              <Pressable
                style={[
                  styles.codeActionBtn,
                  { backgroundColor: copied ? theme.success + '20' : theme.primaryBg },
                ]}
                onPress={handleCopy}
                accessibilityRole="button"
                accessibilityLabel={copied ? t('referral.codeCopied') : t('referral.copyCode')}
              >
                {copied ? (
                  <Check size={18} color={theme.success} strokeWidth={2} />
                ) : (
                  <Copy size={18} color={theme.primary} />
                )}
                <Text
                  style={[
                    styles.codeActionText,
                    { color: copied ? theme.success : theme.primary },
                  ]}
                >
                  {copied ? t('referral.codeCopied') : t('referral.copyCode')}
                </Text>
              </Pressable>

              <Pressable
                style={[styles.codeActionBtn, { backgroundColor: theme.primary + '20' }]}
                onPress={handleShare}
                accessibilityRole="button"
                accessibilityLabel={t('referral.shareCode')}
              >
                <Share2 size={18} color={theme.primary} />
                <Text style={[styles.codeActionText, { color: theme.primary }]}>
                  {t('referral.shareCode')}
                </Text>
              </Pressable>
            </View>
          </View>

          {/* ── Stats banner ── */}
          <View style={[styles.statsBanner, { backgroundColor: theme.primaryBg, borderColor: theme.borderLight }]}>
            <Users size={20} color={theme.primary} />
            <Text style={[styles.statsBannerText, { color: theme.primary }]}>
              {referredCountLabel}
            </Text>
          </View>

          {/* ── Reward card ── */}
          <View style={[styles.rewardCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            <View style={styles.rewardHeader}>
              <View style={[styles.rewardIconWrap, { backgroundColor: theme.accent + '20' }]}>
                <Zap size={20} color={theme.accent} />
              </View>
              <Text style={[styles.rewardTitle, { color: theme.text }]}>{t('referral.rewardTitle')}</Text>
            </View>
            <Text style={[styles.rewardDesc, { color: theme.textMuted }]}>
              {t('referral.rewardAutoDesc')}
            </Text>
            {(stats?.referralMonthsEarned ?? 0) > 0 && (
              <View style={[styles.statsBanner, { backgroundColor: theme.accent + '15', borderColor: theme.borderLight, marginTop: 4 }]}>
                <Star size={16} color={theme.accent} />
                <Text style={[styles.statsBannerText, { color: theme.accent, fontSize: 13 }]}>
                  {stats?.referralMonthsEarned === 1
                    ? t('referral.rewardMonthsEarned_one', { count: 1 })
                    : t('referral.rewardMonthsEarned_other', { count: stats?.referralMonthsEarned ?? 0 })}
                </Text>
              </View>
            )}
          </View>

          {/* ── Referrals list ── */}
          {stats.referrals.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('referral.noReferrals')}</Text>
              <Text style={[styles.emptyHint, { color: theme.textMuted }]}>{t('referral.noReferralsHint')}</Text>
            </View>
          ) : (
            <View style={[styles.listCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
              {stats.referrals.map((m, idx) => (
                <View key={m.id}>
                  <View style={styles.merchantRow}>
                    <View style={[styles.merchantIconWrap, { backgroundColor: theme.primaryBg }]}>
                      <Store size={18} color={theme.primary} />
                    </View>
                    <View style={styles.merchantInfo}>
                      <View style={styles.merchantNameRow}>
                        <Text style={[styles.merchantName, { color: theme.text }]} numberOfLines={1}>
                          {m.nom}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: m.validated ? theme.success + '18' : theme.warning + '18' }]}>
                          {m.validated
                            ? <Check size={10} color={theme.success} strokeWidth={3} />
                            : <Clock size={10} color={theme.warning} strokeWidth={2} />}
                          <Text style={[styles.statusText, { color: m.validated ? theme.success : theme.warning }]}>
                            {m.validated ? t('referral.statusValidated') : t('referral.statusPending')}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.merchantMeta}>
                        {m.ville && (
                          <>
                            <MapPin size={12} color={theme.textMuted} />
                            <Text style={[styles.merchantMetaText, { color: theme.textMuted }]}>
                              {m.ville}
                            </Text>
                          </>
                        )}
                        <Text style={[styles.merchantMetaText, { color: theme.textMuted }]}>
                          {' · '}{t('referral.since', { date: formatDate(m.createdAt, locale) })}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {idx < stats.referrals.length - 1 && (
                    <View style={[styles.divider, { backgroundColor: theme.borderLight }]} />
                  )}
                </View>
              ))}
            </View>
          )}

          {/* ── How it works ── */}
          <View style={[styles.howItWorksCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            <Text style={[styles.howItWorksTitle, { color: theme.text }]}>
              {t('referral.howItWorksTitle')}
            </Text>

            {([
              { icon: Send, color: theme.accent, titleKey: 'referral.step1Title', descKey: 'referral.step1Desc' },
              { icon: UserPlus, color: theme.accent, titleKey: 'referral.step2Title', descKey: 'referral.step2Desc' },
              { icon: Crown, color: theme.accent, titleKey: 'referral.step3Title', descKey: 'referral.step3Desc' },
              { icon: Infinity, color: theme.accent, titleKey: 'referral.step4Title', descKey: 'referral.step4Desc' },
            ] as const).map((step, idx) => {
              const Icon = step.icon;
              return (
                <View key={idx} style={styles.stepRow}>
                  <View style={styles.stepLeft}>
                    <View style={[styles.stepIconWrap, { backgroundColor: step.color + '15' }]}>
                      <Icon size={18} color={step.color} strokeWidth={2} />
                    </View>
                    {idx < 3 && <View style={[styles.stepLine, { backgroundColor: theme.border }]} />}
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={[styles.stepNumber, { color: theme.textMuted }]}>
                      {t('onboarding.stepOf', { current: idx + 1, total: 4 }).toUpperCase()}
                    </Text>
                    <Text style={[styles.stepTitle, { color: theme.text }]}>
                      {t(step.titleKey)}
                    </Text>
                    <Text style={[styles.stepDesc, { color: theme.textMuted }]}>
                      {t(step.descKey)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* ── Program terms ── */}
          <View style={styles.termsBlock}>
            <Text style={[styles.termsNote, { color: theme.textMuted }]}>
              {t('referral.termsNote')}
            </Text>
            <TouchableOpacity onPress={() => router.push('/legal')} activeOpacity={0.7}>
              <Text style={[styles.termsLink, { color: theme.primary }]}>
                {t('referral.termsLink')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header — simple bar (activity style)
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
    flex: 1,
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  loadingText: { fontSize: 14, marginTop: 8, fontFamily: 'Lexend_400Regular' },
  errorText: { fontSize: 15, textAlign: 'center', fontFamily: 'Lexend_400Regular' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  retryBtnText: { fontWeight: '600', fontSize: 14, fontFamily: 'Lexend_600SemiBold' },

  scroll: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },

  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 4,
    fontFamily: 'Lexend_400Regular',
  },

  // Code card
  codeCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  codeIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  codeLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Lexend_600SemiBold' },
  codeValue: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 4,
    marginVertical: 4,
    fontFamily: 'Lexend_700Bold',
  },
  codeActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  codeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  codeActionText: { fontSize: 14, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // Stats banner
  statsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  statsBannerText: { fontSize: 15, fontWeight: '700', fontFamily: 'Lexend_700Bold' },

  // How it works
  howItWorksCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
  },
  howItWorksTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 18,
    fontFamily: 'Lexend_700Bold',
  },
  stepRow: {
    flexDirection: 'row',
    gap: 14,
  },
  stepLeft: {
    alignItems: 'center',
    width: 40,
  },
  stepIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: {
    width: 2,
    flex: 1,
    marginVertical: 4,
    borderRadius: 1,
  },
  stepContent: {
    flex: 1,
    paddingBottom: 18,
  },
  stepNumber: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 2,
    fontFamily: 'Lexend_700Bold',
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    fontFamily: 'Lexend_700Bold',
  },
  stepDesc: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: 'Lexend_400Regular',
  },

  // Reward card
  rewardCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 18,
    gap: 10,
  },
  rewardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  rewardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  rewardDesc: { fontSize: 14, lineHeight: 21, fontFamily: 'Lexend_400Regular' },

  // Empty
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  emptyHint: { fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: 'Lexend_400Regular' },

  // List
  listCard: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  merchantIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  merchantInfo: { flex: 1 },
  merchantNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  merchantName: { fontSize: 15, fontWeight: '600', flexShrink: 1, fontFamily: 'Lexend_600SemiBold' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  statusText: { fontSize: 10, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  merchantMeta: { flexDirection: 'row', alignItems: 'center', gap: 3, flexWrap: 'wrap' },
  merchantMetaText: { fontSize: 12, fontFamily: 'Lexend_400Regular' },
  divider: { height: 1, marginHorizontal: 14 },

  // Program terms
  termsBlock: {
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
    alignItems: 'center',
  },
  termsNote: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
    fontFamily: 'Lexend_400Regular',
  },
  termsLink: {
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
    fontFamily: 'Lexend_600SemiBold',
  },
});
