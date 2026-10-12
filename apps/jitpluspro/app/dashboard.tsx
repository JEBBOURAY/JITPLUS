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
import {
  ArrowLeft,
  Shield,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Users,
  ScanLine,
  Stamp,
  Gift,
  Eye,
  Ticket,
  FerrisWheel,
  Clock,
  CircleCheck,
  Trophy,
} from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
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
import { DEFAULT_CURRENCY, formatCurrency, getIntlLocale } from '@/config/currency';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useDashboardKpis,
  useDashboardTrends,
  useDashboardDistribution,
  useDashboardGames,
} from '@/hooks/useQueryHooks';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useQueryClient } from '@tanstack/react-query';
import type { DashboardGames, TrendPoint } from '@/types';

type TrendPeriod = 'day' | 'week' | 'month' | 'year';
type TrendMetric = 'transactions' | 'newClients' | 'rewardsGiven';

const LOCALE_MAP = { ar: 'ar-MA', en: 'en-US', fr: 'fr-FR' } as const;
const getLocaleTag = (locale: string) => LOCALE_MAP[locale as keyof typeof LOCALE_MAP] ?? 'fr-FR';
const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const TREND_BAR_MAX_HEIGHT = 110;
const TREND_BAR_MIN_HEIGHT = 6;
const ROUNDED_CURRENCY = { ...DEFAULT_CURRENCY, decimals: 0 };
const RTL_FLIP = I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined;
const hapticLight = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

const percent = (part: number, total: number) =>
  total > 0 ? Math.max(0, Math.min(100, Math.round((part / total) * 100))) : 0;

// ── Small building blocks ─────────────────────────────────────

const SectionLabel = React.memo(function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text style={[styles.sectionLabel, { color }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
      {label}
    </Text>
  );
});

const IconBadge = React.memo(function IconBadge({
  Icon, color, bg, size = 36,
}: { Icon: LucideIcon; color: string; bg: string; size?: number }) {
  return (
    <View style={[styles.iconBadge, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: bg }]}>
      <Icon size={size * 0.5} color={color} strokeWidth={1.9} />
    </View>
  );
});

const AnimatedChevron = React.memo(function AnimatedChevron({ expanded, color }: { expanded: boolean; color: string }) {
  const [anim] = useState(() => new Animated.Value(expanded ? 1 : 0));
  useEffect(() => {
    Animated.timing(anim, { toValue: expanded ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [expanded, anim]);
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <ChevronDown size={20} color={color} />
    </Animated.View>
  );
});

const StatTile = React.memo(function StatTile({
  Icon, label, value, caption, accent, accentBg, theme,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  caption?: string;
  accent: string;
  accentBg: string;
  theme: ThemeColors;
}) {
  return (
    <View
      style={styles.statTile}
      accessible
      accessibilityLabel={caption ? `${label}: ${value}. ${caption}` : `${label}: ${value}`}
    >
      <IconBadge Icon={Icon} color={accent} bg={accentBg} size={32} />
      <Text
        style={[styles.statValue, { color: theme.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        maxFontSizeMultiplier={1.3}
      >
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
      {caption ? (
        <Text style={[styles.statCaption, { color: theme.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
});

/** Big number + label, used inside the game cards. */
const Figure = React.memo(function Figure({
  value, label, theme, hairline, first,
}: { value: string; label: string; theme: ThemeColors; hairline: string; first?: boolean }) {
  return (
    <View
      style={[styles.figure, !first && { borderLeftWidth: 1, borderLeftColor: hairline }]}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text
        style={[styles.figureValue, { color: theme.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        maxFontSizeMultiplier={1.3}
      >
        {value}
      </Text>
      <Text style={[styles.figureLabel, { color: theme.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </View>
  );
});

const Pill = React.memo(function Pill({
  Icon, text, color, bg,
}: { Icon?: LucideIcon; text: string; color: string; bg: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {Icon ? <Icon size={14} color={color} strokeWidth={2} /> : null}
      <Text style={[styles.pillText, { color }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
        {text}
      </Text>
    </View>
  );
});

const GameCard = React.memo(function GameCard({
  Icon, title, badge, onPress, accessibilityLabel, theme, hairline, iconBg, children,
}: {
  Icon: LucideIcon;
  title: string;
  badge?: string;
  onPress: () => void;
  accessibilityLabel: string;
  theme: ThemeColors;
  hairline: string;
  iconBg: string;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.card, { backgroundColor: theme.bgCard, borderColor: hairline }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.gameHeader}>
        <IconBadge Icon={Icon} color={theme.primary} bg={iconBg} size={40} />
        <View style={styles.gameHeaderText}>
          <Text style={[styles.gameTitle, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {title}
          </Text>
          {badge ? (
            <View style={styles.liveRow}>
              <View style={[styles.liveDot, { backgroundColor: theme.success }]} />
              <Text style={[styles.liveText, { color: theme.success }]} maxFontSizeMultiplier={1.3}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <ChevronRight size={20} color={theme.textMuted} style={RTL_FLIP} />
      </View>
      {children}
    </TouchableOpacity>
  );
});

const EmptyGame = React.memo(function EmptyGame({
  text, cta, theme,
}: { text: string; cta: string; theme: ThemeColors }) {
  return (
    <View style={styles.emptyGame}>
      <Text style={[styles.emptyGameText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>{text}</Text>
      <Text style={[styles.emptyGameCta, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>{cta}</Text>
    </View>
  );
});

// ── Games section ─────────────────────────────────────────────

const GamesSection = React.memo(function GamesSection({
  games, loading, error, onRetry, onOpenScratch, onOpenWheel, theme, hairline, iconBg, localeTag, currencyLocale, t,
}: {
  games: DashboardGames | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onOpenScratch: () => void;
  onOpenWheel: () => void;
  theme: ThemeColors;
  hairline: string;
  iconBg: string;
  localeTag: string;
  currencyLocale: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (loading) {
    return (
      <View style={[styles.card, styles.centered, { backgroundColor: theme.bgCard, borderColor: hairline }]}>
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    );
  }

  if (error || !games) {
    return (
      <View style={[styles.card, styles.centered, { backgroundColor: theme.bgCard, borderColor: hairline }]}>
        <Text style={[styles.mutedText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
          {t('dashboard.gamesError')}
        </Text>
        <TouchableOpacity onPress={onRetry} hitSlop={HIT_SLOP} accessibilityRole="button" accessibilityLabel={t('common.retry')}>
          <Text style={[styles.linkText, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>{t('common.retry')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { scratch, wheel } = games;
  const fmt = (n: number) => n.toLocaleString(localeTag);
  const money = (n: number) => formatCurrency(n, ROUNDED_CURRENCY, currencyLocale);
  const useRate = percent(scratch.redeemed, scratch.sent);
  const warningBg = theme.mode === 'dark' ? 'rgba(245,158,11,0.16)' : 'rgba(245,158,11,0.12)';
  const successBg = theme.mode === 'dark' ? 'rgba(16,185,129,0.16)' : 'rgba(16,185,129,0.10)';
  const neutralBg = theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : theme.bgInput;

  return (
    <View style={styles.stack}>
      {/* Scratch cards */}
      <GameCard
        Icon={Ticket}
        title={t('dashboard.scratchTitle')}
        badge={scratch.activeCampaigns > 0 ? t('dashboard.activeCount', { count: scratch.activeCampaigns }) : undefined}
        onPress={onOpenScratch}
        accessibilityLabel={t('dashboard.scratchTitle')}
        theme={theme}
        hairline={hairline}
        iconBg={iconBg}
      >
        {scratch.campaigns === 0 ? (
          <EmptyGame text={t('dashboard.scratchEmpty')} cta={t('dashboard.createCampaign')} theme={theme} />
        ) : (
          <>
            <View style={[styles.figuresRow, { borderColor: hairline }]}>
              <Figure first value={fmt(scratch.sent)} label={t('dashboard.scratchSent')} theme={theme} hairline={hairline} />
              <Figure value={fmt(scratch.scratched)} label={t('dashboard.scratchScratched')} theme={theme} hairline={hairline} />
              <Figure value={fmt(scratch.redeemed)} label={t('dashboard.scratchRedeemed')} theme={theme} hairline={hairline} />
            </View>

            <View style={styles.rateBlock}>
              <View style={[styles.rateTrack, { backgroundColor: neutralBg }]}>
                <View style={[styles.rateFill, { width: `${useRate}%`, backgroundColor: theme.primary }]} />
              </View>
              <Text style={[styles.rateText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
                {t('dashboard.scratchUseRate', { pct: useRate })}
              </Text>
            </View>

            <View style={styles.moneyRow}>
              <View style={[styles.moneyBox, { backgroundColor: successBg }]}>
                <Text style={[styles.moneyLabel, { color: theme.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {t('dashboard.scratchRevenue')}
                </Text>
                <Text style={[styles.moneyValue, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.3}>
                  {money(scratch.revenue)}
                </Text>
              </View>
              <View style={[styles.moneyBox, { backgroundColor: neutralBg }]}>
                <Text style={[styles.moneyLabel, { color: theme.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                  {t('dashboard.scratchDiscount')}
                </Text>
                <Text style={[styles.moneyValue, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.3}>
                  {money(scratch.discountGiven)}
                </Text>
              </View>
            </View>
          </>
        )}
      </GameCard>

      {/* Lucky wheel */}
      <GameCard
        Icon={FerrisWheel}
        title={t('dashboard.wheelTitle')}
        badge={wheel.activeCampaigns > 0 ? t('dashboard.activeCount', { count: wheel.activeCampaigns }) : undefined}
        onPress={onOpenWheel}
        accessibilityLabel={t('dashboard.wheelTitle')}
        theme={theme}
        hairline={hairline}
        iconBg={iconBg}
      >
        {wheel.campaigns === 0 ? (
          <EmptyGame text={t('dashboard.wheelEmpty')} cta={t('dashboard.createWheel')} theme={theme} />
        ) : (
          <>
            <View style={[styles.figuresRow, { borderColor: hairline }]}>
              <Figure first value={fmt(wheel.plays)} label={t('dashboard.wheelPlays')} theme={theme} hairline={hairline} />
              <Figure value={fmt(wheel.wins)} label={t('dashboard.wheelWins')} theme={theme} hairline={hairline} />
            </View>
            <View style={styles.pillsRow}>
              <Pill
                Icon={Clock}
                text={t('dashboard.wheelPending', { count: fmt(wheel.pending) })}
                color={wheel.pending > 0 ? theme.warning : theme.textMuted}
                bg={wheel.pending > 0 ? warningBg : neutralBg}
              />
              <Pill
                Icon={CircleCheck}
                text={t('dashboard.wheelFulfilled', { count: fmt(wheel.fulfilled) })}
                color={theme.success}
                bg={successBg}
              />
            </View>
          </>
        )}
      </GameCard>
    </View>
  );
});

const TopPrizesSection = React.memo(function TopPrizesSection({
  prizes, theme, hairline, localeTag, t,
}: {
  prizes: DashboardGames['topPrizes'];
  theme: ThemeColors;
  hairline: string;
  localeTag: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (!prizes.length) {
    return (
      <View style={[styles.card, styles.centered, { backgroundColor: theme.bgCard, borderColor: hairline }]}>
        <Trophy size={22} color={theme.textMuted} strokeWidth={1.6} />
        <Text style={[styles.mutedText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
          {t('dashboard.noPrizes')}
        </Text>
      </View>
    );
  }

  const max = prizes.reduce((acc, p) => (p.count > acc ? p.count : acc), 1);
  const barBg = theme.mode === 'dark' ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.07)';

  return (
    <View style={[styles.card, styles.listCard, { backgroundColor: theme.bgCard, borderColor: hairline }]}>
      {prizes.map((prize, index) => {
        const isWheel = prize.source === 'WHEEL';
        const sourceLabel = isWheel ? t('dashboard.sourceWheel') : t('dashboard.sourceScratch');
        const count = prize.count.toLocaleString(localeTag);
        return (
          <View
            key={`${prize.source}-${prize.label}`}
            style={[styles.prizeRow, index > 0 && { borderTopWidth: 1, borderTopColor: hairline }]}
            accessible
            accessibilityLabel={`${index + 1}. ${prize.label}, ${sourceLabel}, ${count}`}
          >
            <View style={[styles.prizeBar, { width: `${percent(prize.count, max)}%`, backgroundColor: barBg }]} />
            <Text style={[styles.prizeRank, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>{index + 1}</Text>
            <View style={styles.prizeBody}>
              <Text style={[styles.prizeLabel, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                {prize.label}
              </Text>
              <View style={styles.prizeSource}>
                {isWheel
                  ? <FerrisWheel size={12} color={theme.textMuted} strokeWidth={2} />
                  : <Ticket size={12} color={theme.textMuted} strokeWidth={2} />}
                <Text style={[styles.prizeSourceText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>{sourceLabel}</Text>
              </View>
            </View>
            <Text style={[styles.prizeCount, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
              {t('dashboard.prizeCount', { count })}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

// ── Collapsible sections ──────────────────────────────────────

const CollapsibleHeader = React.memo(function CollapsibleHeader({
  title, expanded, onToggle, theme, hairline,
}: { title: string; expanded: boolean; onToggle: () => void; theme: ThemeColors; hairline: string }) {
  return (
    <TouchableOpacity
      style={[styles.collapsibleHeader, { backgroundColor: theme.bgCard, borderColor: hairline }]}
      onPress={onToggle}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ expanded }}
    >
      <Text style={[styles.collapsibleTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>{title}</Text>
      <AnimatedChevron expanded={expanded} color={theme.textSecondary} />
    </TouchableOpacity>
  );
});

const Chip = React.memo(function Chip({
  label, active, onPress, theme, hairline,
}: { label: string; active: boolean; onPress: () => void; theme: ThemeColors; hairline: string }) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        { backgroundColor: active ? theme.primary : theme.bgCard, borderColor: active ? theme.primary : hairline },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, { color: active ? '#fff' : theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
        {label}
      </Text>
    </TouchableOpacity>
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
  const maxCount = data.reduce((acc, item) => (item.count > acc ? item.count : acc), 1);
  return (
    <View style={styles.trendChart}>
      <View style={[styles.trendBars, { borderBottomColor: hairline }]}>
        {data.map((item) => {
          const height = Math.max(TREND_BAR_MIN_HEIGHT, Math.round((item.count / maxCount) * TREND_BAR_MAX_HEIGHT));
          return (
            <View key={item.bucket} style={styles.trendBarCol}>
              <View style={[styles.trendBar, { height, backgroundColor: item.count > 0 ? color : hairline }]} />
            </View>
          );
        })}
      </View>
      <View style={styles.trendLabels}>
        {data.map((item) => (
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

const LoyaltyGiftsList = React.memo(function LoyaltyGiftsList({
  distribution, theme, hairline, noGiftsLabel, giftCountFn,
}: {
  distribution: { rewardId: string | null; title: string; count: number }[];
  theme: ThemeColors;
  hairline: string;
  noGiftsLabel: string;
  giftCountFn: (count: number) => string;
}) {
  if (!distribution.length) {
    return (
      <View style={[styles.card, styles.centered, { backgroundColor: theme.bgCard, borderColor: hairline }]}>
        <Text style={[styles.mutedText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>{noGiftsLabel}</Text>
      </View>
    );
  }

  const max = distribution.reduce((acc, r) => (r.count > acc ? r.count : acc), 1);
  const barBg = theme.mode === 'dark' ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.07)';

  return (
    <View style={[styles.card, styles.listCard, { backgroundColor: theme.bgCard, borderColor: hairline }]}>
      {distribution.map((reward, index) => (
        <View
          key={reward.rewardId ?? `dist-${index}`}
          style={[styles.prizeRow, index > 0 && { borderTopWidth: 1, borderTopColor: hairline }]}
        >
          <View style={[styles.prizeBar, { width: `${percent(reward.count, max)}%`, backgroundColor: barBg }]} />
          <Gift size={16} color={theme.primary} strokeWidth={1.9} />
          <Text style={[styles.prizeLabel, styles.prizeBody, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {reward.title}
          </Text>
          <Text style={[styles.prizeCount, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
            {giftCountFn(reward.count)}
          </Text>
        </View>
      ))}
    </View>
  );
});

// ── Screen ────────────────────────────────────────────────────

export default function DashboardScreen() {
  const shouldWait = useRequireAuth();
  const { merchant, isTeamMember } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, locale } = useLanguage();
  const queryClient = useQueryClient();

  const isPremium = merchant?.plan === 'PREMIUM';

  const [showTrends, setShowTrends] = useState(false);
  const [showDistribution, setShowDistribution] = useState(false);
  const [trendPeriod, setTrendPeriod] = useState<TrendPeriod>('day');
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('transactions');

  const periodTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const debouncedSetPeriod = useCallback((p: TrendPeriod) => {
    hapticLight();
    clearTimeout(periodTimerRef.current);
    periodTimerRef.current = setTimeout(() => setTrendPeriod(p), 300);
  }, []);

  useEffect(() => () => clearTimeout(periodTimerRef.current), []);

  const {
    data: kpis,
    isLoading: loadingKpis,
    isRefetching: refreshingKpis,
    isError: kpiError,
  } = useDashboardKpis();

  const {
    data: games,
    isLoading: loadingGames,
    isError: gamesError,
  } = useDashboardGames(isPremium && !isTeamMember);

  const { data: trendResponse, isLoading: loadingTrends } = useDashboardTrends(trendPeriod, showTrends);
  const { data: distribution, isLoading: loadingDistribution } = useDashboardDistribution(showDistribution);

  const onRefresh = useGuardedCallback(async () => {
    hapticLight();
    const promises = [
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard-games'] }),
    ];
    if (showTrends) promises.push(queryClient.invalidateQueries({ queryKey: ['dashboard-trends', trendPeriod] }));
    if (showDistribution) promises.push(queryClient.invalidateQueries({ queryKey: ['dashboard-distribution'] }));
    await Promise.all(promises);
  }, [trendPeriod, showTrends, showDistribution, queryClient]);

  const retryGames = useCallback(() => {
    hapticLight();
    queryClient.invalidateQueries({ queryKey: ['dashboard-games'] });
  }, [queryClient]);

  const openScratch = useCallback(() => { hapticLight(); router.push('/scratch-campaigns'); }, [router]);
  const openWheel = useCallback(() => { hapticLight(); router.push('/lucky-wheel'); }, [router]);

  const localeTag = useMemo(() => getLocaleTag(locale), [locale]);
  const currencyLocale = useMemo(() => getIntlLocale(locale), [locale]);
  const fmt = useCallback((n: number | undefined) => (n ?? 0).toLocaleString(localeTag), [localeTag]);

  const hairline = theme.mode === 'dark' ? 'rgba(255,255,255,0.12)' : '#ECEEF2';
  const iconBg = theme.mode === 'dark' ? 'rgba(167,139,250,0.14)' : palette.violetUltraLight;
  const goldBg = theme.mode === 'dark' ? 'rgba(252,211,77,0.14)' : '#FEF7DC';
  const charbonBg = theme.mode === 'dark' ? 'rgba(255,255,255,0.08)' : '#F1F2F4';
  const charbonFg = theme.mode === 'dark' ? palette.charbonUltraLight : palette.charbon;
  const goldFg = theme.mode === 'dark' ? palette.gold : '#B45309';

  const formatTrendLabel = useCallback((bucket: string) => {
    const date = new Date(bucket);
    if (isNaN(date.getTime())) return bucket;
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = String(date.getFullYear()).slice(2);
    if (trendPeriod === 'day' || trendPeriod === 'week') return `${day}/${month}`;
    if (trendPeriod === 'month') return `${month}/${year}`;
    return date.toLocaleDateString(localeTag, { month: 'short' });
  }, [trendPeriod, localeTag]);

  const periodOptions = useMemo(() => ([
    { id: 'day', label: t('dashboard.periodDay') },
    { id: 'week', label: t('dashboard.periodWeek') },
    { id: 'month', label: t('dashboard.periodMonth') },
    { id: 'year', label: t('dashboard.periodYear') },
  ] as const), [t]);

  const metricOptions = useMemo(() => ([
    { id: 'transactions', label: t('dashboard.transactions') },
    { id: 'newClients', label: t('dashboard.trendNewClients') },
    { id: 'rewardsGiven', label: t('dashboard.trendGifts') },
  ] as const), [t]);

  const trendData = useMemo<TrendPoint[]>(
    () => (trendResponse ? trendResponse[trendMetric] ?? [] : []),
    [trendResponse, trendMetric],
  );
  const trendTotal = useMemo(() => trendData.reduce((sum, p) => sum + p.count, 0), [trendData]);

  const giftCountFn = useCallback((count: number) => t('dashboard.giftCount', { count }), [t]);

  if (shouldWait) return null;

  if (isTeamMember) {
    return (
      <View style={[styles.stateContainer, { backgroundColor: theme.bg }]}>
        <View style={[styles.stateIconCircle, { backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : `${palette.charbon}0F` }]}>
          <Shield size={ms(34)} color={charbonFg} strokeWidth={1.6} />
        </View>
        <Text style={[styles.stateTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>{t('common.ownerOnly')}</Text>
        <Text style={[styles.stateText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>{t('common.ownerOnlyMsg')}</Text>
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
      <View style={[styles.stateContainer, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.stateText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>{t('common.loading')}</Text>
      </View>
    );
  }

  if (kpiError) {
    return (
      <View style={[styles.stateContainer, { backgroundColor: theme.bg }]}>
        <View style={[styles.stateIconCircle, { backgroundColor: theme.mode === 'dark' ? 'rgba(248,113,113,0.14)' : 'rgba(239,68,68,0.10)' }]}>
          <AlertCircle size={ms(34)} color={theme.danger} strokeWidth={1.6} />
        </View>
        <Text style={[styles.stateTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>{t('common.error')}</Text>
        <TouchableOpacity
          onPress={() => { hapticLight(); queryClient.invalidateQueries({ queryKey: ['dashboard-kpis'] }); }}
          style={styles.gradientBtnWrap}
          hitSlop={HIT_SLOP}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('common.retry')}
        >
          <LinearGradient colors={brandGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.gradientBtn}>
            <Text style={styles.gradientBtnText} maxFontSizeMultiplier={1.3}>{t('common.retry')}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={22} color={theme.text} style={RTL_FLIP} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: theme.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
            {t('dashboard.title')}
          </Text>
          <Text style={[styles.headerSubtitle, { color: theme.textMuted }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            {t('dashboard.guideText')}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshingKpis} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {/* ── 1. Key numbers ── */}
        <SectionLabel label={t('dashboard.sectionProgram')} color={theme.textMuted} />
        <View style={[styles.card, styles.statsCard, { backgroundColor: theme.bgCard, borderColor: hairline }]}>
          <View style={styles.statsRow}>
            <StatTile Icon={Users} label={t('dashboard.statClients')} value={fmt(kpis?.totalClients)} accent={theme.primary} accentBg={iconBg} theme={theme} />
            <View style={[styles.vDivider, { backgroundColor: hairline }]} />
            <StatTile Icon={ScanLine} label={t('dashboard.transactions')} value={fmt(kpis?.totalTransactions)} accent={charbonFg} accentBg={charbonBg} theme={theme} />
          </View>
          <View style={[styles.hDivider, { backgroundColor: hairline }]} />
          <View style={styles.statsRow}>
            <StatTile
              Icon={Stamp}
              label={t('dashboard.statStamps')}
              value={fmt(kpis?.totalStamps)}
              caption={t('dashboard.statStampsUsed', { count: fmt(kpis?.totalRedeemedStamps) })}
              accent={theme.primary}
              accentBg={iconBg}
              theme={theme}
            />
            <View style={[styles.vDivider, { backgroundColor: hairline }]} />
            <StatTile Icon={Gift} label={t('dashboard.trendGifts')} value={fmt(kpis?.totalRewardsGiven)} accent={goldFg} accentBg={goldBg} theme={theme} />
          </View>
          <View style={[styles.statsFooter, { borderTopColor: hairline }]}>
            <Eye size={14} color={theme.textMuted} strokeWidth={1.9} />
            <Text style={[styles.statsFooterText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
              {t('dashboard.profileViewsLine', { count: fmt(kpis?.profileViews) })}
            </Text>
          </View>
        </View>

        {/* ── 2. Games ── */}
        <SectionLabel label={t('dashboard.sectionGames')} color={theme.textMuted} />
        <GamesSection
          games={games}
          loading={loadingGames}
          error={gamesError}
          onRetry={retryGames}
          onOpenScratch={openScratch}
          onOpenWheel={openWheel}
          theme={theme}
          hairline={hairline}
          iconBg={iconBg}
          localeTag={localeTag}
          currencyLocale={currencyLocale}
          t={t}
        />

        {/* ── 3. Top prizes won (scratch + wheel) ── */}
        {games ? (
          <>
            <SectionLabel label={t('dashboard.topPrizes')} color={theme.textMuted} />
            <TopPrizesSection prizes={games.topPrizes} theme={theme} hairline={hairline} localeTag={localeTag} t={t} />
          </>
        ) : null}

        {/* ── 4. Details (loaded on demand) ── */}
        <SectionLabel label={t('dashboard.sectionDetails')} color={theme.textMuted} />
        <View style={styles.stack}>
          <CollapsibleHeader
            title={t('dashboard.evolution')}
            expanded={showTrends}
            onToggle={() => { hapticLight(); setShowTrends((v) => !v); }}
            theme={theme}
            hairline={hairline}
          />
          {showTrends && (
            <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: hairline }]}>
              <View style={styles.chipsRow}>
                {metricOptions.map((m) => (
                  <Chip
                    key={m.id}
                    label={m.label}
                    active={trendMetric === m.id}
                    onPress={() => { hapticLight(); setTrendMetric(m.id); }}
                    theme={theme}
                    hairline={hairline}
                  />
                ))}
              </View>
              <View style={[styles.segment, { backgroundColor: theme.bgInput }]}>
                {periodOptions.map((p) => {
                  const active = trendPeriod === p.id;
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.segmentItem, active && { backgroundColor: theme.bgCard, borderColor: hairline }]}
                      onPress={() => debouncedSetPeriod(p.id)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={p.label}
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={[styles.segmentText, { color: active ? theme.text : theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {loadingTrends ? (
                <View style={styles.centeredInline}>
                  <ActivityIndicator size="small" color={theme.primary} />
                </View>
              ) : trendData.length === 0 ? (
                <View style={styles.centeredInline}>
                  <Text style={[styles.mutedText, { color: theme.textMuted }]}>{t('dashboard.noData')}</Text>
                </View>
              ) : (
                <>
                  <View style={styles.trendTotalRow}>
                    <Text style={[styles.trendTotalValue, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
                      {trendTotal.toLocaleString(localeTag)}
                    </Text>
                    <Text style={[styles.trendTotalLabel, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                      {t('dashboard.trendOnPeriod')}
                    </Text>
                  </View>
                  <TrendChart data={trendData} color={theme.primary} formatLabel={formatTrendLabel} theme={theme} hairline={hairline} />
                </>
              )}
            </View>
          )}

          <CollapsibleHeader
            title={t('dashboard.giftDistribution')}
            expanded={showDistribution}
            onToggle={() => { hapticLight(); setShowDistribution((v) => !v); }}
            theme={theme}
            hairline={hairline}
          />
          {showDistribution && (
            loadingDistribution ? (
              <View style={styles.centeredInline}>
                <ActivityIndicator size="small" color={theme.primary} />
              </View>
            ) : (
              <LoyaltyGiftsList
                distribution={distribution ?? []}
                theme={theme}
                hairline={hairline}
                noGiftsLabel={t('dashboard.noGifts')}
                giftCountFn={giftCountFn}
              />
            )
          )}
        </View>
      </ScrollView>

      {/* Premium lock overlay (content stays softly visible behind) */}
      {!isPremium && (
        <BlurView
          intensity={theme.mode === 'dark' ? 22 : 16}
          tint="dark"
          blurMethod="dimezisBlurView"
          style={styles.premiumOverlay}
        >
          <View style={styles.premiumCard}>
            <PremiumLockCard titleKey="dashboard.premiumTitle" descriptionKey="dashboard.premiumDesc" />
          </View>
        </BlurView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 4 },
  stack: { gap: 12 },

  // Header
  headerBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 10,
  },
  backBtn: { width: 36, height: 40, justifyContent: 'center' },
  headerText: { flex: 1 },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
  },
  headerSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
    fontFamily: 'Lexend_400Regular',
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontFamily: 'Lexend_700Bold',
    marginTop: 24,
    marginBottom: 10,
  },

  // Generic card
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 8 },
  centeredInline: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  mutedText: { fontSize: 13, fontFamily: 'Lexend_400Regular', textAlign: 'center' },
  linkText: { fontSize: 13, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  iconBadge: { alignItems: 'center', justifyContent: 'center' },

  // Key numbers
  statsCard: { padding: 0, overflow: 'hidden' },
  statsRow: { flexDirection: 'row' },
  vDivider: { width: 1 },
  hDivider: { height: 1 },
  statTile: { flex: 1, padding: 16, gap: 4 },
  statValue: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.6,
    fontFamily: 'Lexend_700Bold',
    fontVariant: ['tabular-nums'],
    marginTop: 8,
  },
  statLabel: { fontSize: 13, lineHeight: 17, fontFamily: 'Lexend_400Regular' },
  statCaption: { fontSize: 11.5, fontFamily: 'Lexend_400Regular' },
  statsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderTopWidth: 1,
  },
  statsFooterText: { fontSize: 12.5, fontFamily: 'Lexend_400Regular' },

  // Game cards
  gameHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  gameHeaderText: { flex: 1, gap: 2 },
  gameTitle: { fontSize: 16, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 12, fontFamily: 'Lexend_600SemiBold' },
  figuresRow: {
    flexDirection: 'row',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
  },
  figure: { flex: 1, paddingHorizontal: 8, alignItems: 'center' },
  figureValue: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontFamily: 'Lexend_700Bold',
    fontVariant: ['tabular-nums'],
  },
  figureLabel: { fontSize: 12, marginTop: 2, fontFamily: 'Lexend_400Regular' },
  rateBlock: { marginTop: 16, gap: 8 },
  rateTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  rateFill: { height: '100%', borderRadius: 4 },
  rateText: { fontSize: 12.5, lineHeight: 17, fontFamily: 'Lexend_400Regular' },
  moneyRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  moneyBox: { flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 2 },
  moneyLabel: { fontSize: 11.5, fontFamily: 'Lexend_400Regular' },
  moneyValue: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    fontVariant: ['tabular-nums'],
  },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillText: { fontSize: 12.5, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  emptyGame: { marginTop: 12, gap: 8 },
  emptyGameText: { fontSize: 13, lineHeight: 19, fontFamily: 'Lexend_400Regular' },
  emptyGameCta: { fontSize: 13, fontWeight: '700', fontFamily: 'Lexend_700Bold' },

  // Ranked lists (top prizes, loyalty gifts)
  listCard: { padding: 0, overflow: 'hidden' },
  prizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  prizeBar: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  prizeRank: {
    width: 16,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    textAlign: 'center',
  },
  prizeBody: { flex: 1, gap: 2 },
  prizeLabel: { fontSize: 14, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  prizeSource: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  prizeSourceText: { fontSize: 11.5, fontFamily: 'Lexend_400Regular' },
  prizeCount: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    fontVariant: ['tabular-nums'],
  },

  // Collapsible sections
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 15,
    minHeight: 48,
  },
  collapsibleTitle: { fontSize: 15, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  chipText: { fontSize: 12.5, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  segment: { flexDirection: 'row', borderRadius: 12, padding: 3, marginTop: 12 },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  segmentText: { fontSize: 12.5, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  trendTotalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 16 },
  trendTotalValue: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontFamily: 'Lexend_700Bold',
    fontVariant: ['tabular-nums'],
  },
  trendTotalLabel: { fontSize: 12.5, fontFamily: 'Lexend_400Regular' },
  trendChart: { marginTop: 12 },
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
  trendBar: { width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  trendLabels: { flexDirection: 'row', marginTop: 6 },
  trendLabelCell: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
    fontSize: 10,
    fontFamily: 'Lexend_400Regular',
  },

  // Full-screen states
  stateContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  stateIconCircle: {
    width: ms(72),
    height: ms(72),
    borderRadius: ms(20),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  stateTitle: {
    marginTop: 12,
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    textAlign: 'center',
  },
  stateText: { marginTop: 8, fontSize: 15, fontFamily: 'Lexend_400Regular', textAlign: 'center' },
  secondaryBtn: {
    marginTop: 18,
    paddingHorizontal: 24,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryBtnText: { fontWeight: '700', fontSize: 14, fontFamily: 'Lexend_700Bold' },
  gradientBtnWrap: { marginTop: 18, borderRadius: 12, overflow: 'hidden' },
  gradientBtn: {
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientBtnText: { color: '#fff', fontWeight: '700', fontSize: 14, fontFamily: 'Lexend_700Bold' },

  // Premium lock overlay
  premiumOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6,4,16,0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  premiumCard: { width: '100%', borderRadius: 24, overflow: 'hidden' },
});
