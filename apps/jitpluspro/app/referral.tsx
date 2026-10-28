import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
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
  Check,
  Infinity,
  Clock,
} from 'lucide-react-native';
import {
  JitClients,
  JitGift,
  JitPersonAdd,
  JitPin,
  JitPremium,
  JitStore,
} from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useReferral } from '@/hooks/useQueryHooks';
import { formatDate } from '@/utils/date';
import { ActionButton } from '@/components/ui/ActionButton';
import { font, icon } from '@/constants/design';
import { useDir } from '@/hooks/useDir';

const PRO_ANDROID_URL = 'https://play.google.com/store/apps/details?id=com.jitplus.pro';
const PRO_IOS_APP_ID = process.env.EXPO_PUBLIC_IOS_APP_ID ?? '';
const PRO_IOS_URL = PRO_IOS_APP_ID
  ? `https://apps.apple.com/app/id${PRO_IOS_APP_ID}`
  : 'https://apps.apple.com/search?term=jitplus+pro';

export default function ReferralScreen() {
  const theme = useTheme();
  const dir = useDir();
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
      <View style={[styles.headerBar, { flexDirection: dir.row, paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={22} color={theme.text} strokeWidth={icon.stroke} style={dir.flip} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text, textAlign: dir.textAlign }]}>{t('referral.title')}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textMuted }]}>{t('referral.loadingCode')}</Text>
        </View>
      ) : isError || !stats ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: theme.danger }]}>{t('referralScreen.loadError')}</Text>
          <ActionButton
            label={t('common.retry')}
            variant="ghost"
            onPress={() => refetch()}
            style={[styles.retryBtn, { backgroundColor: theme.primaryBg }]}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('referral.subtitle')}
          </Text>

          <View style={[styles.codeCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            <View style={[styles.codeIconWrap, { backgroundColor: theme.primaryBg }]}>
              <JitGift size={24} color={theme.primary} strokeWidth={icon.stroke} />
            </View>
            <Text style={[styles.codeLabel, { color: theme.textMuted }]}>{t('referral.yourCode')}</Text>
            <Text
              style={[styles.codeValue, { color: theme.primary }]}
              selectable
              accessibilityLabel={`${t('referral.yourCode')}: ${stats.referralCode}`}
            >
              {stats.referralCode}
            </Text>

            <View style={[styles.codeActions, { flexDirection: dir.row }]}>
              <Pressable
                style={[
                  styles.codeActionBtn,
                  { flexDirection: dir.row, backgroundColor: copied ? theme.success + '20' : theme.primaryBg },
                ]}
                onPress={handleCopy}
                accessibilityRole="button"
                accessibilityLabel={copied ? t('referral.codeCopied') : t('referral.copyCode')}
              >
                {copied ? (
                  <Check size={18} color={theme.success} strokeWidth={icon.stroke} />
                ) : (
                  <Copy size={18} color={theme.primary} strokeWidth={icon.stroke} />
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
                style={[styles.codeActionBtn, { flexDirection: dir.row, backgroundColor: theme.primary + '20' }]}
                onPress={handleShare}
                accessibilityRole="button"
                accessibilityLabel={t('referral.shareCode')}
              >
                <Share2 size={18} color={theme.primary} strokeWidth={icon.stroke} />
                <Text style={[styles.codeActionText, { color: theme.primary }]}>
                  {t('referral.shareCode')}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={[styles.statsBanner, { flexDirection: dir.row, backgroundColor: theme.primaryBg, borderColor: theme.borderLight }]}>
            <JitClients size={20} color={theme.primary} strokeWidth={icon.stroke} />
            <Text style={[styles.statsBannerText, { color: theme.primary, textAlign: dir.textAlign }]}>
              {referredCountLabel}
            </Text>
          </View>

          <View style={[styles.rewardCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            <View style={[styles.rewardHeader, { flexDirection: dir.row }]}>
              <View style={[styles.rewardIconWrap, { backgroundColor: theme.accent + '20' }]}>
                <JitGift size={20} color={theme.accent} strokeWidth={icon.stroke} />
              </View>
              <Text style={[styles.rewardTitle, { color: theme.text, textAlign: dir.textAlign }]}>{t('referral.rewardTitle')}</Text>
            </View>
            <Text style={[styles.rewardDesc, { color: theme.textMuted, textAlign: dir.textAlign }]}>
              {t('referral.rewardAutoDesc')}
            </Text>
            {(stats?.referralMonthsEarned ?? 0) > 0 && (
              <View style={[styles.statsBanner, styles.monthsBanner, { flexDirection: dir.row, backgroundColor: theme.accent + '15', borderColor: theme.borderLight }]}>
                <JitPremium size={16} color={theme.accent} strokeWidth={icon.stroke} />
                <Text style={[styles.statsBannerText, styles.monthsBannerText, { color: theme.accent, textAlign: dir.textAlign }]}>
                  {stats?.referralMonthsEarned === 1
                    ? t('referral.rewardMonthsEarned_one', { count: 1 })
                    : t('referral.rewardMonthsEarned_other', { count: stats?.referralMonthsEarned ?? 0 })}
                </Text>
              </View>
            )}
          </View>

          {stats.referrals.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('referral.noReferrals')}</Text>
              <Text style={[styles.emptyHint, { color: theme.textMuted }]}>{t('referral.noReferralsHint')}</Text>
            </View>
          ) : (
            <View style={[styles.listCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
              {stats.referrals.map((m, idx) => (
                <View key={m.id}>
                  <View style={[styles.merchantRow, { flexDirection: dir.row }]}>
                    <View style={[styles.merchantIconWrap, { backgroundColor: theme.primaryBg }]}>
                      <JitStore size={18} color={theme.primary} strokeWidth={icon.stroke} />
                    </View>
                    <View style={styles.merchantInfo}>
                      <View style={[styles.merchantNameRow, { flexDirection: dir.row }]}>
                        <Text style={[styles.merchantName, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1}>
                          {m.nom}
                        </Text>
                        <View style={[styles.statusBadge, { flexDirection: dir.row, backgroundColor: m.validated ? theme.success + '18' : theme.warning + '18' }]}>
                          {m.validated
                            ? <Check size={10} color={theme.success} strokeWidth={icon.strokeSmall} />
                            : <Clock size={10} color={theme.warning} strokeWidth={icon.strokeSmall} />}
                          <Text style={[styles.statusText, { color: m.validated ? theme.success : theme.warning }]}>
                            {m.validated ? t('referral.statusValidated') : t('referral.statusPending')}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.merchantMeta, { flexDirection: dir.row }]}>
                        {m.ville && (
                          <>
                            <JitPin size={12} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
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

          <View style={[styles.howItWorksCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
            <Text style={[styles.howItWorksTitle, { color: theme.text, textAlign: dir.textAlign }]}>
              {t('referral.howItWorksTitle')}
            </Text>

            {([
              { icon: Share2, titleKey: 'referral.step1Title', descKey: 'referral.step1Desc' },
              { icon: JitPersonAdd, titleKey: 'referral.step2Title', descKey: 'referral.step2Desc' },
              { icon: JitGift, titleKey: 'referral.step3Title', descKey: 'referral.step3Desc' },
              { icon: Infinity, titleKey: 'referral.step4Title', descKey: 'referral.step4Desc' },
            ] as const).map((step, idx) => {
              const Icon = step.icon;
              return (
                <View key={idx} style={[styles.stepRow, { flexDirection: dir.row }]}>
                  <View style={styles.stepLeft}>
                    <View style={[styles.stepIconWrap, { backgroundColor: theme.accent + '15' }]}>
                      <Icon size={18} color={theme.accent} strokeWidth={icon.stroke} />
                    </View>
                    {idx < 3 && <View style={[styles.stepLine, { backgroundColor: theme.border }]} />}
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={[styles.stepNumber, { color: theme.textMuted, textAlign: dir.textAlign }]}>
                      {t('onboarding.stepOf', { current: idx + 1, total: 4 })}
                    </Text>
                    <Text style={[styles.stepTitle, { color: theme.text, textAlign: dir.textAlign }]}>
                      {t(step.titleKey)}
                    </Text>
                    <Text style={[styles.stepDesc, { color: theme.textMuted, textAlign: dir.textAlign }]}>
                      {t(step.descKey)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>

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

const styles = StyleSheet.create({
  container: { flex: 1 },

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
    fontFamily: font.bold,
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
  loadingText: { fontSize: 14, marginTop: 8, fontFamily: font.regular },
  errorText: { fontSize: 15, textAlign: 'center', fontFamily: font.regular },
  retryBtn: { paddingHorizontal: 20, marginTop: 4 },

  scroll: { paddingHorizontal: 16, paddingTop: 20, gap: 16 },

  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 4,
    fontFamily: font.regular,
  },

  codeCard: {
    borderRadius: 16,
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
  codeLabel: { fontSize: 13, fontFamily: font.semibold },
  codeValue: {
    fontSize: 34,
    letterSpacing: 2,
    marginVertical: 4,
    fontFamily: font.bold,
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
    borderRadius: 12,
  },
  codeActionText: { fontSize: 14, fontFamily: font.semibold },

  statsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  statsBannerText: { fontSize: 15, fontFamily: font.semibold },
  monthsBanner: { marginTop: 4 },
  monthsBannerText: { fontSize: 13 },

  howItWorksCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  howItWorksTitle: {
    fontSize: 17,
    marginBottom: 18,
    fontFamily: font.bold,
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
    fontSize: 12,
    marginBottom: 2,
    fontFamily: font.medium,
  },
  stepTitle: {
    fontSize: 15,
    marginBottom: 4,
    fontFamily: font.bold,
  },
  stepDesc: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: font.regular,
  },

  rewardCard: {
    borderRadius: 16,
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
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardTitle: { fontSize: 15, fontFamily: font.bold },
  rewardDesc: { fontSize: 14, lineHeight: 21, fontFamily: font.regular },

  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontFamily: font.bold },
  emptyHint: { fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: font.regular },

  listCard: {
    borderRadius: 16,
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
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  merchantInfo: { flex: 1 },
  merchantNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  merchantName: { fontSize: 15, flexShrink: 1, fontFamily: font.semibold },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  statusText: { fontSize: 11, fontFamily: font.semibold },
  merchantMeta: { flexDirection: 'row', alignItems: 'center', gap: 3, flexWrap: 'wrap' },
  merchantMetaText: { fontSize: 12, fontFamily: font.regular },
  divider: { height: 1, marginHorizontal: 14 },

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
    fontFamily: font.regular,
  },
  termsLink: {
    fontSize: 12,
    textDecorationLine: 'underline',
    fontFamily: font.semibold,
  },
});
