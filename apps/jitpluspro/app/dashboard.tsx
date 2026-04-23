import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Users, TrendingUp, Repeat, ArrowLeft, Eye, Gift, Shield, Dices, Trophy, ChevronDown, ChevronUp } from 'lucide-react-native';
import PremiumLockCard from '@/components/PremiumLockCard';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useTheme, palette } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import { ms } from '@/utils/responsive';
import { useLanguage } from '@/contexts/LanguageContext';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDashboardKpis, useDashboardTrends, useDashboardDistribution } from '@/hooks/useQueryHooks';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useQueryClient } from '@tanstack/react-query';

type TrendPeriod = 'day' | 'week' | 'month' | 'year';

interface TrendPoint {
  bucket: string;
  count: number;
}

const LOCALE_MAP = { ar: 'ar-MA', en: 'en-US', fr: 'fr-FR' } as const;
const getLocaleTag = (locale: string) => LOCALE_MAP[locale as keyof typeof LOCALE_MAP] ?? 'fr-FR';

const StatCard = React.memo(function StatCard({
  icon, label, value, color, theme, locale,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
  theme: ThemeColors;
  locale: string;
}) {
  return (
    <View
      style={[
        styles.statCard,
        { borderLeftColor: color, backgroundColor: theme.bgCard, borderColor: theme.borderLight },
      ]}
    >
      <View style={[styles.statIconContainer, { backgroundColor: `${palette.charbon}12` }]}>
        {icon}
      </View>
      <View style={styles.statContent}>
        <Text
          style={[styles.statLabel, { color: theme.textSecondary }]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {label}
        </Text>
        <Text
          style={[styles.statValue, { color: theme.text }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {typeof value === 'number' ? value.toLocaleString(getLocaleTag(locale)) : value}
        </Text>
      </View>
    </View>
  );
});

const TrendChart = React.memo(function TrendChart({
  data, color, formatLabel, theme,
}: {
  data: TrendPoint[];
  color: string;
  formatLabel: (bucket: string) => string;
  theme: ThemeColors;
}) {
  const maxCount = Math.max(...(data ?? []).map((item) => item.count), 1);
  return (
    <View style={styles.trendChart}>
      {(data ?? []).map((item) => {
        const height = Math.max(8, Math.round((item.count / maxCount) * 90));
        return (
          <View key={item.bucket} style={styles.trendBarGroup}>
            <View style={styles.trendBarValueWrap}>
              <Text style={[styles.trendBarValue, { color: theme.text }]}>
                {item.count}
              </Text>
            </View>
            <View
              style={[
                styles.trendBar,
                { height, backgroundColor: color },
              ]}
            />
            <Text
              style={[styles.trendLabel, { color: theme.textMuted }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {formatLabel(item.bucket)}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

const TrendsSection = React.memo(function TrendsSection({
  loading,
  charts,
  formatLabel,
  theme,
  noDataLabel,
}: {
  loading: boolean;
  charts: { key: string; title: string; color: string; data: TrendPoint[] }[];
  formatLabel: (bucket: string) => string;
  theme: ThemeColors;
  noDataLabel: string;
}) {
  if (loading) {
    return (
      <View style={styles.trendEmpty}>
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    );
  }

  if (!charts.length) {
    return (
      <View style={styles.trendEmpty}>
        <Text style={[styles.trendEmptyText, { color: theme.textMuted }]}>
          {noDataLabel}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.trendsContainer}>
      {charts.map((chart) => (
        <View
          key={chart.key}
          style={[styles.trendCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
        >
          <View style={styles.trendCardHeader}>
            <View style={[styles.trendColorDot, { backgroundColor: chart.color }]} />
            <Text style={[styles.trendCardTitle, { color: theme.text }]}>{chart.title}</Text>
          </View>
          <TrendChart data={chart.data} color={chart.color} formatLabel={formatLabel} theme={theme} />
        </View>
      ))}
    </View>
  );
});

const RewardDistributionSection = React.memo(function RewardDistributionSection({
  distribution, theme, noGiftsLabel, giftCountFn,
}: {
  distribution: { rewardId: string | null; title: string; count: number }[];
  theme: ThemeColors;
  noGiftsLabel: string;
  giftCountFn: (count: number) => string;
}) {
  if (!distribution.length) {
    return (
      <View style={styles.distributionEmpty}>
        <Text style={[styles.distributionEmptyText, { color: theme.textMuted }]}>
          {noGiftsLabel}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.distributionList}>
      {distribution.map((reward, index) => (
        <View
          key={reward.rewardId ?? `dist-${index}`}
          style={[
            styles.distributionRow,
            { borderColor: theme.borderLight, backgroundColor: theme.bgCard },
          ]}
        >
          <Text style={[styles.distributionTitle, { color: theme.text }]}>
            {reward.title}
          </Text>
          <Text style={[styles.distributionCount, { color: theme.textSecondary }]}>
            {giftCountFn(reward.count)}
          </Text>
        </View>
      ))}
    </View>
  );
});

export default function DashboardScreen() {
  const shouldWait = useRequireAuth();
  const { merchant, isTeamMember } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useLanguage();
  const queryClient = useQueryClient();

  const isPremium = merchant?.plan === 'PREMIUM';

  // -- Section visibility (on-demand loading) --
  const [showTrends, setShowTrends] = useState(false);
  const [showDistribution, setShowDistribution] = useState(false);

  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('day');

  const periodTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const debouncedSetPeriod = useCallback((p: TrendPeriod) => {
    clearTimeout(periodTimerRef.current);
    periodTimerRef.current = setTimeout(() => setTrendPeriod(p), 300);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => clearTimeout(periodTimerRef.current);
  }, []);

  // -- 1. KPIs — always loaded (lightweight) --
  const {
    data: kpis,
    isLoading: loadingKpis,
    isRefetching: refreshingKpis,
    isError: kpiError,
  } = useDashboardKpis();

  // -- 2. Trends — loaded only when section is expanded --
  const {
    data: trendResponse,
    isLoading: loadingTrends,
  } = useDashboardTrends(trendPeriod, showTrends);

  // -- 3. Distribution — loaded only when section is expanded --
  const {
    data: distribution,
    isLoading: loadingDistribution,
  } = useDashboardDistribution(showDistribution);

  const onRefresh = useGuardedCallback(async () => {
    const promises = [
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] }),
    ];
    if (showTrends) promises.push(queryClient.invalidateQueries({ queryKey: ['dashboard-trends', trendPeriod] }));
    if (showDistribution) promises.push(queryClient.invalidateQueries({ queryKey: ['dashboard-distribution'] }));
    await Promise.all(promises);
  }, [trendPeriod, showTrends, showDistribution, queryClient]);

  const unitLabel = kpis?.loyaltyType === 'STAMPS' ? t('common.stamps') : t('common.points');

  const formatTrendLabel = useCallback((bucket: string) => {
    const date = new Date(bucket);
    if (isNaN(date.getTime())) return bucket;
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = String(date.getFullYear()).slice(2);

    if (trendPeriod === 'day' || trendPeriod === 'week') {
      return `${day}/${month}`;
    }
    if (trendPeriod === 'month') {
      return `${month}/${year}`;
    }
    return date.toLocaleDateString(getLocaleTag(locale), { month: 'short' });
  }, [trendPeriod, locale]);

  const primaryColor = theme.primary;
  const trendCharts = useMemo<{ key: string; title: string; color: string; data: TrendPoint[] }[]>(
    () => trendResponse
      ? [
          { key: 'transactions', title: t('dashboard.transactions'), color: primaryColor, data: trendResponse.transactions },
          { key: 'newClients', title: t('dashboard.trendNewClients'), color: '#7C3AED', data: trendResponse.newClients },
          { key: 'rewardsGiven', title: t('dashboard.trendGifts'), color: primaryColor, data: trendResponse.rewardsGiven },
        ]
      : [],
    [trendResponse, t, primaryColor],
  );

  const giftCountFn = useCallback((count: number) => t('dashboard.giftCount', { count }), [t]);

  if (shouldWait) return null;

  if (isTeamMember) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <View style={styles.ownerOnlyIcon}>
          <Shield size={ms(36)} color={palette.charbon} strokeWidth={1.5} />
        </View>
        <Text style={[styles.loadingText, styles.ownerOnlyTitle, { color: theme.text }]}>{t('common.ownerOnly')}</Text>
        <Text style={[styles.loadingText, { color: theme.textMuted }]}>{t('common.ownerOnlyMsg')}</Text>
        <TouchableOpacity onPress={() => router.back()} style={[styles.ownerOnlyBackBtn, { backgroundColor: theme.primary }]}>
          <Text style={styles.ownerOnlyBackText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loadingKpis) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textMuted }]}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (kpiError) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <Text style={[styles.loadingText, { color: theme.textMuted }]}>{t('common.error')}</Text>
        <TouchableOpacity onPress={() => queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] })} style={[styles.ownerOnlyBackBtn, { backgroundColor: theme.primary, marginTop: 12 }]}>
          <Text style={styles.ownerOnlyBackText}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* -- Simple header — matches activity style -- */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{t('dashboard.title')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.statsContainer}
        refreshControl={<RefreshControl refreshing={refreshingKpis} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* -- Guide text -- */}
        <View style={[styles.guideContainer, { backgroundColor: theme.primaryBg || (theme.primary + '10'), borderLeftColor: theme.primary }]}>
          <Text style={[styles.guideText, { color: theme.textSecondary }]}>
            {t('dashboard.guideText')}
          </Text>
        </View>

        {/* --- Section 1: KPIs (always loaded) --- */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('dashboard.kpis')}</Text>
        <View style={styles.statsRow}>
          <StatCard
            icon={<Users size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
            label={t('dashboard.volumeClients')}
            value={kpis?.totalClients || 0}
            color={theme.primary}
            theme={theme}
            locale={locale}
          />
          <StatCard
            icon={<TrendingUp size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
            label={t('dashboard.loyaltyLabel', { unit: unitLabel })}
            value={kpis?.totalPoints || 0}
            color={theme.primary}
            theme={theme}
            locale={locale}
          />
        </View>
        <View style={[styles.statsRow, styles.statsRowGap]}>
          <StatCard
            icon={<TrendingUp size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
            label={t('dashboard.consumedLabel', { unit: unitLabel })}
            value={kpis?.totalRedeemedPoints || 0}
            color={theme.primary}
            theme={theme}
            locale={locale}
          />
          <StatCard
            icon={<Repeat size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
            label={t('dashboard.transactions')}
            value={kpis?.totalTransactions || 0}
            color={theme.primary}
            theme={theme}
            locale={locale}
          />
        </View>
        <View style={[styles.statsRow, styles.statsRowGap]}>
          <StatCard
            icon={<Eye size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
            label={t('dashboard.profileViews')}
            value={kpis?.profileViews || 0}
            color={theme.primary}
            theme={theme}
            locale={locale}
          />
          <StatCard
            icon={<Gift size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
            label={t('dashboard.trendGifts')}
            value={kpis?.totalRewardsGiven || 0}
            color={theme.primary}
            theme={theme}
            locale={locale}
          />
        </View>
        <View style={[styles.statsRow, styles.statsRowGap]}>
          <StatCard
            icon={<Dices size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
            label={t('dashboard.luckyWheelPlays')}
            value={kpis?.luckyWheelPlays || 0}
            color={theme.primary}
            theme={theme}
            locale={locale}
          />
          <StatCard
            icon={<Trophy size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
            label={t('dashboard.luckyWheelWins')}
            value={kpis?.luckyWheelWins || 0}
            color={theme.primary}
            theme={theme}
            locale={locale}
          />
        </View>

        {/* --- Section 2: Evolution (on-demand) --- */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => setShowTrends((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>{t('dashboard.evolution')}</Text>
          {showTrends ? <ChevronUp size={20} color={theme.textSecondary} /> : <ChevronDown size={20} color={theme.textSecondary} />}
        </TouchableOpacity>

        {showTrends && (
          <View>
            {/* Period filter tabs */}
            <View style={styles.periodHeader}>
              <View style={styles.trendTabs}>
                {([
                  { id: 'day', label: t('dashboard.periodDay') },
                  { id: 'week', label: t('dashboard.periodWeek') },
                  { id: 'month', label: t('dashboard.periodMonth') },
                  { id: 'year', label: t('dashboard.periodYear') },
                ] as const).map((item) => {
                  const isActive = trendPeriod === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.trendTab,
                        {
                          backgroundColor: isActive ? theme.primary : theme.bgCard,
                          borderColor: isActive ? theme.primary : theme.borderLight,
                        },
                      ]}
                      onPress={() => debouncedSetPeriod(item.id)}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.trendTabText,
                          { color: isActive ? '#fff' : theme.textSecondary },
                        ]}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <TrendsSection loading={loadingTrends} charts={trendCharts} formatLabel={formatTrendLabel} theme={theme} noDataLabel={t('dashboard.noData')} />
          </View>
        )}

        {/* --- Section 3: Gift Distribution (on-demand) --- */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => setShowDistribution((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]}>{t('dashboard.giftDistribution')}</Text>
          {showDistribution ? <ChevronUp size={20} color={theme.textSecondary} /> : <ChevronDown size={20} color={theme.textSecondary} />}
        </TouchableOpacity>

        {showDistribution && (
          loadingDistribution ? (
            <View style={styles.trendEmpty}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : (
            <RewardDistributionSection distribution={distribution ?? []} theme={theme} noGiftsLabel={t('dashboard.noGifts')} giftCountFn={giftCountFn} />
          )
        )}
      </ScrollView>

      {/* â”€â”€ Premium lock overlay â”€â”€ */}
      {!isPremium && (
        <View style={styles.premiumOverlay}>
          <View style={styles.premiumCard}>
            <PremiumLockCard
              titleKey="dashboard.premiumTitle"
              descriptionKey="dashboard.premiumDesc"
            />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  guideContainer: {
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderLeftWidth: 3,
  },
  guideText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Lexend_400Regular',
  },
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    fontFamily: 'Lexend_400Regular',
  },

  // Header — simple bar (activity style)
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 10,
  },
  backBtn: {
    padding: 4,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 15,
    fontFamily: 'Lexend_700Bold',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    marginTop: 20,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 15,
  },
  statsRowGap: {
    marginTop: 15,
  },
  ownerOnlyIcon: {
    width: ms(88),
    height: ms(88),
    borderRadius: ms(24),
    backgroundColor: `${palette.charbon}12`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ownerOnlyTitle: {
    fontWeight: '600',
    fontSize: 16,
    fontFamily: 'Lexend_600SemiBold',
  },
  ownerOnlyBackBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
  },
  ownerOnlyBackText: {
    color: '#fff',
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },
  periodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  trendTabs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  trendTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  trendTabText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  trendChart: {
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 8,
  },
  trendsContainer: {
    gap: 14,
  },
  trendCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  trendCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  trendColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  trendCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  trendBarGroup: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 0,
  },
  trendBarValueWrap: {
    minHeight: 16,
    justifyContent: 'flex-end',
  },
  trendBarValue: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  trendBar: {
    width: '100%',
    borderRadius: 8,
    marginTop: 6,
  },
  trendLabel: {
    fontSize: 10,
    marginTop: 6,
    fontFamily: 'Lexend_400Regular',
  },
  trendEmpty: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  trendEmptyText: {
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderWidth: 1,
  },
  statIconContainer: {
    width: ms(36),
    height: ms(36),
    borderRadius: ms(12),
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  statContent: {
    flex: 1,
    justifyContent: 'center',
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 4,
    fontFamily: 'Lexend_500Medium',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  distributionList: {
    gap: 12,
    marginTop: 4,
  },
  distributionRow: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  distributionInfo: { marginBottom: 10 },
  distributionTitle: { fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  distributionCount: { fontSize: 12, marginTop: 4, fontFamily: 'Lexend_400Regular' },
  distributionBarTrack: {
    height: 8,
    borderRadius: 6,
    overflow: 'hidden',
  },
  distributionBarFill: { height: 8, borderRadius: 6 },
  distributionEmpty: {
    paddingVertical: 12,
  },
  distributionEmptyText: { fontSize: 13, fontFamily: 'Lexend_400Regular' },
  statsContainer: {
    padding: 20,
    paddingBottom: 30,
  },

  // â”€â”€ Premium lock overlay â”€â”€
  premiumOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  premiumCard: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
  },
});
