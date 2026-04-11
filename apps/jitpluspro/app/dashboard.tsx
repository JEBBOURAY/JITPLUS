import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { Users, TrendingUp, RefreshCw, Repeat, ArrowLeft, Eye, Gift, Shield } from 'lucide-react-native';
import PremiumLockCard from '@/components/PremiumLockCard';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useTheme, brandGradient } from '@/contexts/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDashboardStats, useDashboardTrends } from '@/hooks/useQueryHooks';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useQueryClient } from '@tanstack/react-query';

type TrendPeriod = 'day' | 'week' | 'month' | 'year';

interface TrendPoint {
  bucket: string;
  count: number;
}

const StatCard = React.memo(function StatCard({
  icon, label, value, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.statCard,
        { borderLeftColor: color, backgroundColor: theme.bgCard, borderColor: theme.borderLight },
      ]}
    >
      <View style={[styles.statIconContainer, { backgroundColor: color + '20' }]}>
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
          {typeof value === 'number' ? value.toLocaleString('fr-FR') : value}
        </Text>
      </View>
    </View>
  );
});

const TrendChart = React.memo(function TrendChart({
  data, color, formatLabel,
}: {
  data: TrendPoint[];
  color: string;
  formatLabel: (bucket: string) => string;
}) {
  const theme = useTheme();
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
}: {
  loading: boolean;
  charts: { key: string; title: string; color: string; data: TrendPoint[] }[];
  formatLabel: (bucket: string) => string;
}) {
  const theme = useTheme();
  const { t } = useLanguage();

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
          {t('dashboard.noData')}
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
          <TrendChart data={chart.data} color={chart.color} formatLabel={formatLabel} />
        </View>
      ))}
    </View>
  );
});

const RewardDistributionSection = React.memo(function RewardDistributionSection({
  distribution,
}: {
  distribution: { rewardId: string | null; title: string; count: number }[];
}) {
  const theme = useTheme();
  const { t } = useLanguage();

  if (!distribution.length) {
    return (
      <View style={styles.distributionEmpty}>
        <Text style={[styles.distributionEmptyText, { color: theme.textMuted }]}>
          {t('dashboard.noGifts')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.distributionList}>
      {distribution.map((reward) => (
        <View
          key={reward.rewardId || reward.title}
          style={[
            styles.distributionRow,
            { borderColor: theme.borderLight, backgroundColor: theme.bgCard },
          ]}
        >
          <Text style={[styles.distributionTitle, { color: theme.text }]}>
            {reward.title}
          </Text>
          <Text style={[styles.distributionCount, { color: theme.textSecondary }]}>
            {t('dashboard.giftCount', { count: reward.count })}
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

  if (shouldWait) return null;

  const isPremium = merchant?.plan === 'PREMIUM';

  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('day');

  const periodTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const debouncedSetPeriod = useCallback((p: TrendPeriod) => {
    clearTimeout(periodTimerRef.current);
    periodTimerRef.current = setTimeout(() => setTrendPeriod(p), 300);
  }, []);

  const {
    data: stats,
    isLoading: loadingStats,
    isRefetching: refreshingStats,
  } = useDashboardStats(trendPeriod);

  const {
    data: trendResponse,
    isLoading: loadingTrends,
    isRefetching: refreshingTrends,
  } = useDashboardTrends(trendPeriod);

  const trendData = useMemo(
    () => trendResponse
      ? { transactions: trendResponse.transactions, newClients: trendResponse.newClients, rewardsGiven: trendResponse.rewardsGiven }
      : null,
    [trendResponse],
  );

  const refreshing = refreshingStats || refreshingTrends;

  const onRefresh = useGuardedCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats', trendPeriod] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-trends', trendPeriod] }),
    ]);
  }, [trendPeriod, queryClient]);

  const unitLabel = stats?.loyaltyType === 'STAMPS' ? t('common.stamps') : t('common.points');

  const formatTrendLabel = useCallback((bucket: string) => {
    const date = new Date(bucket);
    if (isNaN(date.getTime())) return bucket;
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = String(date.getFullYear()).slice(2);

    if (trendPeriod === 'day') {
      return `${day}/${month}`;
    }
    if (trendPeriod === 'week') {
      return `${day}/${month}`;
    }
    if (trendPeriod === 'month') {
      return `${month}/${year}`;
    }
    // year: show month name abbreviated using locale-aware formatter
    return date.toLocaleDateString(locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-US' : 'fr-FR', { month: 'short' });
  }, [trendPeriod, locale]);

  const primaryColor = theme.primary;
  const trendCharts = useMemo<{ key: string; title: string; color: string; data: TrendPoint[] }[]>(
    () => trendData
      ? [
          { key: 'transactions', title: t('dashboard.transactions'), color: primaryColor, data: trendData.transactions },
          { key: 'newClients', title: t('dashboard.trendNewClients'), color: '#7C3AED', data: trendData.newClients },
          { key: 'rewardsGiven', title: t('dashboard.trendGifts'), color: primaryColor, data: trendData.rewardsGiven },
        ]
      : [],
    [trendData, t, primaryColor],
  );

  if (isTeamMember) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <Shield size={48} color={theme.textMuted} strokeWidth={1.5} />
        <Text style={[styles.loadingText, { color: theme.text, fontWeight: '600', fontSize: 16, fontFamily: 'Lexend_600SemiBold' }]}>{t('common.ownerOnly')}</Text>
        <Text style={[styles.loadingText, { color: theme.textMuted, fontFamily: 'Lexend_400Regular' }]}>{t('common.ownerOnlyMsg')}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: theme.primary, borderRadius: 10 }}>
          <Text style={{ color: '#fff', fontWeight: '600', fontFamily: 'Lexend_600SemiBold' }}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loadingStats) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textMuted }]}>{t('common.loading')}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* En-tete */}
      <View collapsable={false}>
        <LinearGradient
          colors={[...brandGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <BlurView
            intensity={Platform.OS === 'ios' ? 40 : 20}
            tint={theme.mode === 'dark' ? 'dark' : 'default'}
            style={[styles.headerBlur, { paddingTop: insets.top + 16 }]}
          >
            <View style={styles.glassOverlay} />
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                <ArrowLeft size={22} color="#fff" />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle}>{t('dashboard.title')}</Text>
              </View>
              <TouchableOpacity style={styles.refreshButton} onPress={onRefresh}>
                <RefreshCw size={20} color="rgba(255,255,255,0.85)" strokeWidth={1.5} />
              </TouchableOpacity>
            </View>
          </BlurView>
        </LinearGradient>
        <LinearGradient
          colors={['rgba(124,58,237,0.3)', 'transparent']}
          style={styles.headerFade}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.statsContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* ── Guide text ── */}
        <View style={[styles.guideContainer, { backgroundColor: theme.primaryBg || (theme.primary + '10'), borderLeftColor: theme.primary }]}>
          <Text style={[styles.guideText, { color: theme.textSecondary }]}>
            {t('dashboard.guideText')}
          </Text>
        </View>

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

        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('dashboard.kpis')}</Text>
        <View style={styles.statsRow}>
          <StatCard
            icon={<Users size={22} color={theme.primary} strokeWidth={1.5} />}
            label={t('dashboard.volumeClients')}
            value={stats?.totalClients || 0}
            color={theme.primary}
          />
          <StatCard
            icon={<TrendingUp size={22} color={theme.primary} strokeWidth={1.5} />}
            label={t('dashboard.loyaltyLabel', { unit: unitLabel })}
            value={stats?.totalPoints || 0}
            color={theme.primary}
          />
        </View>
        <View style={[styles.statsRow, { marginTop: 15 }]}>
          <StatCard
            icon={<TrendingUp size={22} color={theme.primary} strokeWidth={1.5} />}
            label={t('dashboard.consumedLabel', { unit: unitLabel })}
            value={stats?.totalRedeemedPoints || 0}
            color={theme.primary}
          />
          <StatCard
            icon={<Repeat size={22} color={theme.primary} strokeWidth={1.5} />}
            label={t('dashboard.transactions')}
            value={stats?.totalTransactions || 0}
            color={theme.primary}
          />
        </View>
        <View style={[styles.statsRow, { marginTop: 15 }]}>
          <StatCard
            icon={<Eye size={22} color={theme.primary} strokeWidth={1.5} />}
            label={t('dashboard.profileViews')}
            value={stats?.profileViews || 0}
            color={theme.primary}
          />
          <StatCard
            icon={<Gift size={22} color={theme.primary} strokeWidth={1.5} />}
            label={t('dashboard.trendGifts')}
            value={stats?.totalRewardsGiven || 0}
            color={theme.primary}
          />
        </View>

        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 10 }]}>{t('dashboard.evolution')}</Text>
        <TrendsSection loading={loadingTrends} charts={trendCharts} formatLabel={formatTrendLabel} />

        <Text style={[styles.sectionTitle, { marginTop: 20, color: theme.text }]}>{t('dashboard.giftDistribution')}</Text>
        <RewardDistributionSection distribution={stats?.rewardsDistribution ?? []} />
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

  // Header — glassmorphism
  headerGradient: { overflow: 'hidden' },
  headerBlur: { overflow: 'hidden' },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 20,
    paddingHorizontal: 24,
    gap: 10,
  },
  backBtn: {
    padding: 4,
    marginRight: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    marginTop: 2,
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'Lexend_400Regular',
  },
  headerFade: { height: 4 },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 15,
    fontFamily: 'Lexend_700Bold',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 15,
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
