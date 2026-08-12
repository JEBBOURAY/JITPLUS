import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  I18nManager,
  Animated,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, Shield, ChevronDown, AlertCircle } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import PremiumLockCard from '@/components/PremiumLockCard';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useTheme, palette, brandGradient } from '@/contexts/ThemeContext';
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
const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const TREND_BAR_MAX_HEIGHT = 90;
const TREND_BAR_MIN_HEIGHT = 8;
const hapticLight = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

interface OverviewGroup {
  key: string;
  label: string;
  dotColor: string;
  items: { key: string; label: string; value: number }[];
}

const Eyebrow = React.memo(function Eyebrow({ label, color }: { label: string; color: string }) {
  return (
    <Text style={[styles.eyebrow, { color }]} maxFontSizeMultiplier={1.3}>
      {label}
    </Text>
  );
});

const AnimatedChevron = React.memo(function AnimatedChevron({ expanded, color }: { expanded: boolean; color: string }) {
  const anim = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: expanded ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [expanded, anim]);
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <ChevronDown size={20} color={color} />
    </Animated.View>
  );
});

const OverviewPanel = React.memo(function OverviewPanel({
  groups, theme, hairline, localeTag,
}: {
  groups: OverviewGroup[];
  theme: ThemeColors;
  hairline: string;
  localeTag: string;
}) {
  return (
    <View style={[styles.overviewPanel, { backgroundColor: theme.bgCard, borderColor: hairline }]}>
      {groups.map((group, gi) => (
        <View
          key={group.key}
          style={[styles.overviewGroup, gi > 0 && { borderTopWidth: 1, borderTopColor: hairline }]}
        >
          <View style={styles.overviewGroupHeader}>
            <View style={[styles.overviewDot, { backgroundColor: group.dotColor }]} />
            <Text style={[styles.overviewGroupLabel, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
              {group.label}
            </Text>
          </View>
          <View style={styles.overviewRow}>
            {group.items.map((item, ii) => {
              const displayValue = item.value.toLocaleString(localeTag);
              return (
                <View
                  key={item.key}
                  style={[
                    styles.overviewItem,
                    ii > 0 && { borderLeftWidth: 1, borderLeftColor: hairline },
                  ]}
                  accessible
                  accessibilityLabel={`${item.label}: ${displayValue}`}
                >
                  <Text
                    style={[styles.overviewValue, { color: theme.text }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.6}
                    maxFontSizeMultiplier={1.3}
                  >
                    {displayValue}
                  </Text>
                  <Text
                    style={[styles.overviewLabel, { color: theme.textMuted }]}
                    numberOfLines={2}
                    maxFontSizeMultiplier={1.3}
                  >
                    {item.label}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
});

const TrendChart = React.memo(function TrendChart({
  data, color, formatLabel, theme, hairline,
}: {
  data: TrendPoint[];
  color: string;
  formatLabel: (bucket: string) => string;
  theme: ThemeColors;
  hairline: string;
}) {
  const points = data ?? [];
  const maxCount = points.reduce((acc, item) => (item.count > acc ? item.count : acc), 1);
  return (
    <View style={styles.trendChart}>
      <View style={[styles.trendBars, { borderBottomColor: hairline }]}>
        {points.map((item) => {
          const height = Math.max(TREND_BAR_MIN_HEIGHT, Math.round((item.count / maxCount) * TREND_BAR_MAX_HEIGHT));
          return (
            <View key={item.bucket} style={styles.trendBarCol}>
              <View style={[styles.trendBar, { height, backgroundColor: color }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.trendLabels}>
        {points.map((item) => (
          <Text
            key={item.bucket}
            style={[styles.trendLabelCell, { color: theme.textMuted }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            maxFontSizeMultiplier={1.3}
          >
            {formatLabel(item.bucket)}
          </Text>
        ))}
      </View>
    </View>
  );
});

const TrendsSection = React.memo(function TrendsSection({
  loading,
  charts,
  formatLabel,
  theme,
  hairline,
  noDataLabel,
  totalLabelFn,
}: {
  loading: boolean;
  charts: { key: string; title: string; color: string; data: TrendPoint[] }[];
  formatLabel: (bucket: string) => string;
  theme: ThemeColors;
  hairline: string;
  noDataLabel: string;
  totalLabelFn: (total: number) => string;
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
      {charts.map((chart) => {
        const total = chart.data.reduce((sum, item) => sum + item.count, 0);
        return (
          <View
            key={chart.key}
            style={[styles.trendCard, { backgroundColor: theme.bgCard, borderColor: hairline }]}
          >
            <View style={styles.trendCardHeader}>
              <View style={[styles.trendColorDot, { backgroundColor: chart.color }]} />
              <Text style={[styles.trendCardTitle, { color: theme.text }]} numberOfLines={1}>{chart.title}</Text>
              <Text style={[styles.trendCardTotal, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                {totalLabelFn(total)}
              </Text>
            </View>
            <TrendChart data={chart.data} color={chart.color} formatLabel={formatLabel} theme={theme} hairline={hairline} />
          </View>
        );
      })}
    </View>
  );
});

const RewardDistributionSection = React.memo(function RewardDistributionSection({
  distribution, theme, hairline, barColor, noGiftsLabel, giftCountFn,
}: {
  distribution: { rewardId: string | null; title: string; count: number }[];
  theme: ThemeColors;
  hairline: string;
  barColor: string;
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

  const maxCount = distribution.reduce((acc, reward) => (reward.count > acc ? reward.count : acc), 1);

  return (
    <View style={styles.distributionList}>
      {distribution.map((reward, index) => {
        const pct = Math.max(0, Math.min(100, Math.round((reward.count / maxCount) * 100)));
        return (
          <View
            key={reward.rewardId ?? `dist-${index}`}
            style={[
              styles.distributionRow,
              { borderColor: hairline, backgroundColor: theme.bgCard },
            ]}
          >
            <View style={[styles.distributionBar, { width: `${pct}%`, backgroundColor: barColor }]} />
            <View style={styles.distributionContent}>
              <Text style={[styles.distributionTitle, { color: theme.text }]} numberOfLines={1}>
                {reward.title}
              </Text>
              <Text style={[styles.distributionCount, { color: theme.textSecondary }]}>
                {giftCountFn(reward.count)}
              </Text>
            </View>
          </View>
        );
      })}
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
    hapticLight();
    clearTimeout(periodTimerRef.current);
    periodTimerRef.current = setTimeout(() => setTrendPeriod(p), 300);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => clearTimeout(periodTimerRef.current);
  }, []);

  // -- 1. KPIs � always loaded (lightweight) --
  const {
    data: kpis,
    isLoading: loadingKpis,
    isRefetching: refreshingKpis,
    isError: kpiError,
  } = useDashboardKpis();

  // -- 2. Trends � loaded only when section is expanded --
  const {
    data: trendResponse,
    isLoading: loadingTrends,
  } = useDashboardTrends(trendPeriod, showTrends);

  // -- 3. Distribution � loaded only when section is expanded --
  const {
    data: distribution,
    isLoading: loadingDistribution,
  } = useDashboardDistribution(showDistribution);

  const onRefresh = useGuardedCallback(async () => {
    hapticLight();
    const promises = [
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] }),
    ];
    if (showTrends) promises.push(queryClient.invalidateQueries({ queryKey: ['dashboard-trends', trendPeriod] }));
    if (showDistribution) promises.push(queryClient.invalidateQueries({ queryKey: ['dashboard-distribution'] }));
    await Promise.all(promises);
  }, [trendPeriod, showTrends, showDistribution, queryClient]);

  const unitLabel = kpis?.loyaltyType === 'STAMPS' ? t('common.stamps') : t('common.points');
  const localeTag = useMemo(() => getLocaleTag(locale), [locale]);

  // Adaptive hairline — visible in both light and dark themes.
  const hairline = theme.mode === 'dark' ? 'rgba(255,255,255,0.14)' : '#ECEEF2';
  // Proportional background bar for the distribution rows.
  const distBarColor = theme.mode === 'dark' ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.06)';

  // KPIs grouped into a single "Overview" panel (Loyalty / Activity / Rewards).
  const kpiGroups = useMemo<OverviewGroup[]>(() => [
    {
      key: 'loyalty',
      label: t('dashboard.groupLoyalty'),
      dotColor: palette.violet,
      items: [
        { key: 'clients', label: t('dashboard.volumeClients'), value: kpis?.totalClients ?? 0 },
        { key: 'points', label: t('dashboard.loyaltyLabel', { unit: unitLabel }), value: kpis?.totalPoints ?? 0 },
        { key: 'consumed', label: t('dashboard.consumedLabel', { unit: unitLabel }), value: kpis?.totalRedeemedPoints ?? 0 },
      ],
    },
    {
      key: 'activity',
      label: t('dashboard.groupActivity'),
      dotColor: theme.mode === 'dark' ? palette.charbonUltraLight : palette.charbon,
      items: [
        { key: 'transactions', label: t('dashboard.transactions'), value: kpis?.totalTransactions ?? 0 },
        { key: 'views', label: t('dashboard.profileViews'), value: kpis?.profileViews ?? 0 },
      ],
    },
    {
      key: 'rewards',
      label: t('dashboard.groupRewards'),
      dotColor: palette.gold,
      items: [
        { key: 'gifts', label: t('dashboard.trendGifts'), value: kpis?.totalRewardsGiven ?? 0 },
        { key: 'wheelPlays', label: t('dashboard.luckyWheelPlays'), value: kpis?.luckyWheelPlays ?? 0 },
        { key: 'wheelWins', label: t('dashboard.luckyWheelWins'), value: kpis?.luckyWheelWins ?? 0 },
      ],
    },
  ], [kpis, t, unitLabel, theme.mode]);

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

  const periodOptions = useMemo(() => ([
    { id: 'day', label: t('dashboard.periodDay') },
    { id: 'week', label: t('dashboard.periodWeek') },
    { id: 'month', label: t('dashboard.periodMonth') },
    { id: 'year', label: t('dashboard.periodYear') },
  ] as const), [t]);

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
  const trendTotalFn = useCallback(
    (total: number) => t('dashboard.trendTotal', { count: total.toLocaleString(localeTag) }),
    [t, localeTag],
  );

  if (shouldWait) return null;

  if (isTeamMember) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <View style={[styles.stateIconCircle, { backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : `${palette.charbon}0F` }]}>
          <Shield size={ms(34)} color={theme.mode === 'dark' ? palette.charbonUltraLight : palette.charbon} strokeWidth={1.6} />
        </View>
        <Text style={[styles.loadingText, styles.ownerOnlyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>{t('common.ownerOnly')}</Text>
        <Text style={[styles.loadingText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>{t('common.ownerOnlyMsg')}</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.secondaryBtn, { backgroundColor: theme.bgInput, borderColor: hairline }]}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Text style={[styles.secondaryBtnText, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loadingKpis) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (kpiError) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg, paddingHorizontal: 24 }]}>
        <View style={[styles.stateIconCircle, { backgroundColor: theme.mode === 'dark' ? 'rgba(248,113,113,0.14)' : 'rgba(239,68,68,0.10)' }]}>
          <AlertCircle size={ms(34)} color={theme.danger} strokeWidth={1.6} />
        </View>
        <Text style={[styles.errorTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
          {t('common.error')}
        </Text>
        <TouchableOpacity
          onPress={() => { hapticLight(); queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] }); }}
          style={styles.gradientBtnWrap}
          hitSlop={HIT_SLOP}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('common.retry')}
        >
          <LinearGradient
            colors={brandGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientBtn}
          >
            <Text style={styles.gradientBtnText} maxFontSizeMultiplier={1.3}>{t('common.retry')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* -- Simple header -- */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft
            size={22}
            color={theme.text}
            style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
          />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: theme.text }]}
          accessibilityRole="header"
          maxFontSizeMultiplier={1.4}
        >
          {t('dashboard.title')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.statsContainer}
        refreshControl={<RefreshControl refreshing={refreshingKpis} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* -- Guide banner (minimal: violet hairline rule + text) -- */}
        <View style={styles.guideContainer}>
          <View style={[styles.guideBar, { backgroundColor: theme.primary }]} />
          <Text style={[styles.guideText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>
            {t('dashboard.guideText')}
          </Text>
        </View>

        {/* --- Section 1: Overview panel (always loaded) --- */}
        <Eyebrow label={t('dashboard.overview')} color={theme.textMuted} />
        <OverviewPanel groups={kpiGroups} theme={theme} hairline={hairline} localeTag={localeTag} />

        {/* --- Section 2: Evolution (on-demand) --- */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => { hapticLight(); setShowTrends((v) => !v); }}
          activeOpacity={0.7}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('dashboard.evolution')}
          accessibilityState={{ expanded: showTrends }}
        >
          <View style={styles.sectionHeaderText}>
            <Eyebrow label={t('dashboard.eyebrowAnalysis')} color={theme.textMuted} />
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]} maxFontSizeMultiplier={1.4}>{t('dashboard.evolution')}</Text>
          </View>
          <AnimatedChevron expanded={showTrends} color={theme.textSecondary} />
        </TouchableOpacity>

        {showTrends && (
          <View>
            {/* Period filter tabs */}
            <View style={styles.periodHeader}>
              <View style={styles.trendTabs}>
                {periodOptions.map((item) => {
                  const isActive = trendPeriod === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.trendTab,
                        {
                          backgroundColor: isActive ? theme.primary : theme.bgCard,
                          borderColor: isActive ? theme.primary : hairline,
                        },
                      ]}
                      onPress={() => debouncedSetPeriod(item.id)}
                      activeOpacity={0.8}
                      hitSlop={HIT_SLOP}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                      accessibilityState={{ selected: isActive }}
                    >
                      <Text
                        style={[
                          styles.trendTabText,
                          { color: isActive ? '#fff' : theme.textSecondary },
                        ]}
                        maxFontSizeMultiplier={1.3}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <TrendsSection loading={loadingTrends} charts={trendCharts} formatLabel={formatTrendLabel} theme={theme} hairline={hairline} noDataLabel={t('dashboard.noData')} totalLabelFn={trendTotalFn} />
          </View>
        )}

        {/* --- Section 3: Gift Distribution (on-demand) --- */}
        <TouchableOpacity
          style={styles.sectionHeader}
          onPress={() => { hapticLight(); setShowDistribution((v) => !v); }}
          activeOpacity={0.7}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('dashboard.giftDistribution')}
          accessibilityState={{ expanded: showDistribution }}
        >
          <View style={styles.sectionHeaderText}>
            <Eyebrow label={t('dashboard.eyebrowRewards')} color={theme.textMuted} />
            <Text style={[styles.sectionTitle, { color: theme.text, marginBottom: 0 }]} maxFontSizeMultiplier={1.4}>{t('dashboard.giftDistribution')}</Text>
          </View>
          <AnimatedChevron expanded={showDistribution} color={theme.textSecondary} />
        </TouchableOpacity>

        {showDistribution && (
          loadingDistribution ? (
            <View style={styles.trendEmpty}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : (
            <RewardDistributionSection distribution={distribution ?? []} theme={theme} hairline={hairline} barColor={distBarColor} noGiftsLabel={t('dashboard.noGifts')} giftCountFn={giftCountFn} />
          )
        )}
      </ScrollView>

      {/* ── Premium lock overlay (KPIs stay visible, softly blurred behind) ── */}
      {!isPremium && (
        <BlurView
          intensity={theme.mode === 'dark' ? 22 : 16}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={styles.premiumOverlay}
        >
          <View style={styles.premiumCard}>
            <PremiumLockCard
              titleKey="dashboard.premiumTitle"
              descriptionKey="dashboard.premiumDesc"
            />
          </View>
        </BlurView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  guideContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  guideBar: {
    width: 2,
    alignSelf: 'stretch',
    borderRadius: 1,
    marginRight: 12,
  },
  guideText: {
    flex: 1,
    fontSize: 13.5,
    lineHeight: 20,
    fontFamily: 'Lexend_400Regular',
  },
  eyebrow: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    fontFamily: 'Lexend_700Bold',
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
  errorTitle: {
    marginTop: 12,
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    textAlign: 'center',
  },

  // Header � simple bar (activity style)
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
  sectionHeaderText: {
    flex: 1,
  },

  // Overview panel (unified KPI container)
  overviewPanel: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
  overviewGroup: {
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  overviewGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  overviewDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 8,
  },
  overviewGroupLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: 'Lexend_700Bold',
  },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  overviewItem: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: 'flex-start',
  },
  overviewValue: {
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.6,
    fontFamily: 'Lexend_700Bold',
    fontVariant: ['tabular-nums'],
  },
  overviewLabel: {
    fontSize: 10.5,
    marginTop: 4,
    lineHeight: 14,
    fontFamily: 'Lexend_400Regular',
  },
  ownerOnlyTitle: {
    fontWeight: '600',
    fontSize: 16,
    fontFamily: 'Lexend_600SemiBold',
  },
  stateIconCircle: {
    width: ms(72),
    height: ms(72),
    borderRadius: ms(20),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  secondaryBtn: {
    marginTop: 18,
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontWeight: '700',
    fontSize: 14,
    fontFamily: 'Lexend_700Bold',
  },
  gradientBtnWrap: {
    marginTop: 18,
    borderRadius: 12,
    overflow: 'hidden',
  },
  gradientBtn: {
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    fontFamily: 'Lexend_700Bold',
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
    marginTop: 12,
  },
  trendBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: TREND_BAR_MAX_HEIGHT,
    borderBottomWidth: 1,
  },
  trendBarCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 0,
    paddingHorizontal: 3,
  },
  trendLabels: {
    flexDirection: 'row',
    marginTop: 6,
  },
  trendLabelCell: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    fontSize: 10,
    fontFamily: 'Lexend_400Regular',
  },
  trendsContainer: {
    gap: 14,
  },
  trendCard: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
  },
  trendCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  trendColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  trendCardTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  trendCardTotal: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.2,
    fontFamily: 'Lexend_700Bold',
    fontVariant: ['tabular-nums'],
  },
  trendBar: {
    width: '100%',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  trendEmpty: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  trendEmptyText: {
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
  },
  distributionList: {
    gap: 10,
    marginTop: 4,
  },
  distributionRow: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  distributionBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  distributionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 12,
  },
  distributionTitle: { flex: 1, fontSize: 14, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  distributionCount: { fontSize: 12, fontFamily: 'Lexend_400Regular', fontVariant: ['tabular-nums'] },
  distributionEmpty: {
    paddingVertical: 12,
  },
  distributionEmptyText: { fontSize: 13, fontFamily: 'Lexend_400Regular' },
  statsContainer: {
    padding: 20,
    paddingBottom: 30,
  },

  // ── Premium lock overlay ──
  premiumOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6,4,16,0.42)',
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
