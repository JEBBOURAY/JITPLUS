import { useMemo, useState, type ReactNode } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { BlurView } from 'expo-blur';
import Svg, { Circle, Defs, Line, LinearGradient as SvgGradient, Path, Stop } from 'react-native-svg';
import { ArrowLeft, ChevronRight, Eye } from 'lucide-react-native';
import { JitClients, JitGames, JitGift, JitScan, JitStamp, JitTicket } from '@/components/icons';
import type { LucideIcon } from 'lucide-react-native';
import PremiumLockCard from '@/components/PremiumLockCard';
import { ActionButton } from '@/components/ui/ActionButton';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useDir } from '@/hooks/useDir';
import {
  queryKeys,
  useDashboardKpis,
  useDashboardTrends,
  useDashboardDistribution,
  useDashboardGames,
} from '@/hooks/useQueryHooks';
import { DEFAULT_CURRENCY, formatCurrency, getIntlLocale } from '@/config/currency';
import { font, icon, shadow } from '@/constants/design';
import { hapticLight } from '@/utils/haptics';
import type { DashboardGames, DashboardKpis, RewardDistribution, TrendPoint, TrendResponse } from '@/types';

type TrendPeriod = 'day' | 'week' | 'month' | 'year';
type TrendMetric = 'transactions' | 'newClients' | 'rewardsGiven';
type PeriodTotals = Record<TrendMetric, number>;

const PERIODS: { id: TrendPeriod; labelKey: string; captionKey: string }[] = [
  { id: 'day', labelKey: 'dashboard.period7Days', captionKey: 'dashboard.caption7Days' },
  { id: 'week', labelKey: 'dashboard.period8Weeks', captionKey: 'dashboard.caption8Weeks' },
  { id: 'month', labelKey: 'dashboard.period6Months', captionKey: 'dashboard.caption6Months' },
  { id: 'year', labelKey: 'dashboard.period12Months', captionKey: 'dashboard.caption12Months' },
];

const METRICS: { id: TrendMetric; labelKey: string }[] = [
  { id: 'transactions', labelKey: 'dashboard.transactions' },
  { id: 'newClients', labelKey: 'dashboard.trendNewClients' },
  { id: 'rewardsGiven', labelKey: 'dashboard.trendGifts' },
];

const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const WHOLE_CURRENCY = { ...DEFAULT_CURRENCY, decimals: 0 };

const CHART_HEIGHT = 180;
const PLOT_TOP = 40;
const PLOT_BOTTOM = CHART_HEIGHT - 1;
const PLOT_INSET = 14;
const X_LABEL_WIDTH = 48;
const RING_SIZE = 84;
const RING_STROKE = 9;

const ratio = (part: number, total: number) => (total > 0 ? Math.max(0, Math.min(1, part / total)) : 0);
const sumCounts = (points: TrendPoint[]) => points.reduce((sum, p) => sum + p.count, 0);

/** Rounds the chart ceiling up to 1, 2, 2.5 or 5 × 10ⁿ so the axis label reads as a round number. */
function niceMax(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

/** Horizontal-midpoint cubic curve: smooth, and never overshoots the data vertically. */
function curvePath(coords: { x: number; y: number }[]) {
  return coords.reduce((d, point, i) => {
    if (i === 0) return `M${point.x},${point.y}`;
    const prev = coords[i - 1];
    const cx = (prev.x + point.x) / 2;
    return `${d} C${cx},${prev.y} ${cx},${point.y} ${point.x},${point.y}`;
  }, '');
}

function useFormatters() {
  const { locale } = useLanguage();
  return useMemo(() => {
    const intlLocale = getIntlLocale(locale);
    return {
      intlLocale,
      num: (n: number | undefined) => (n ?? 0).toLocaleString(intlLocale),
      pct: (fraction: number) => fraction.toLocaleString(intlLocale, { style: 'percent', maximumFractionDigits: 0 }),
      money: (n: number) => formatCurrency(n, WHOLE_CURRENCY, intlLocale),
    };
  }, [locale]);
}

/** Buckets are UTC calendar dates ("YYYY-MM-DD"); read the parts directly so the device timezone cannot shift them. */
function formatBucket(bucket: string, period: TrendPeriod, intlLocale: string, withYear = false) {
  const [year, month, day] = bucket.split('-').map(Number);
  if (!year || !month || !day) return bucket;
  if (period === 'day' || period === 'week') return `${day}/${month}`;
  return new Date(year, month - 1, 1).toLocaleDateString(intlLocale, withYear ? { month: 'short', year: 'numeric' } : { month: 'short' });
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <View style={styles.section}>
      <Text
        style={[styles.sectionTitle, { color: theme.text, textAlign: dir.textAlign }]}
        accessibilityRole="header"
        maxFontSizeMultiplier={1.3}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }, style]}>
      {children}
    </View>
  );
}

function LoadingCard() {
  const theme = useTheme();
  return (
    <Card style={styles.centered}>
      <ActivityIndicator size="small" color={theme.textMuted} />
    </Card>
  );
}

function MessageCard({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  const theme = useTheme();
  return (
    <Card style={styles.centered}>
      <Text style={[styles.message, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>{message}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={HIT_SLOP} accessibilityRole="button">
          <Text style={[styles.link, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );
}

/** Track + fill that grows from the reading start, so it mirrors in Arabic. */
function ProgressBar({ fraction, color, height = 6, style }: { fraction: number; color: string; height?: number; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <View style={[styles.track, { height, borderRadius: height / 2, flexDirection: dir.row, backgroundColor: theme.bgInput }, style]}>
      <View style={{ width: `${Math.round(fraction * 100)}%`, borderRadius: height / 2, backgroundColor: color }} />
    </View>
  );
}

function PeriodSelector({ value, onChange }: { value: TrendPeriod; onChange: (period: TrendPeriod) => void }) {
  const theme = useTheme();
  const dir = useDir();
  const { t } = useLanguage();
  return (
    <View style={[styles.segment, { flexDirection: dir.row, backgroundColor: theme.bgInput }]}>
      {PERIODS.map(({ id, labelKey }) => {
        const active = id === value;
        return (
          <TouchableOpacity
            key={id}
            style={[styles.segmentItem, active && [shadow.sm, { backgroundColor: theme.bgCard }]]}
            onPress={() => { hapticLight(); onChange(id); }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={[styles.segmentText, { color: active ? theme.text : theme.textMuted }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              maxFontSizeMultiplier={1.3}
            >
              {t(labelKey)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function StatTile({
  Icon, label, value, note, noteHighlighted, style,
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  note?: string;
  noteHighlighted?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <View
      style={[styles.statTile, { alignItems: dir.alignStart }, style]}
      accessible
      accessibilityLabel={[label, value, note].filter(Boolean).join(', ')}
    >
      <View style={[styles.statLabelRow, { flexDirection: dir.row }]}>
        <Icon size={15} color={theme.textMuted} strokeWidth={icon.stroke} />
        <Text style={[styles.statLabel, { color: theme.textMuted, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
      </View>
      <Text
        style={[styles.statValue, { color: theme.text }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        maxFontSizeMultiplier={1.2}
      >
        {value}
      </Text>
      {note ? (
        <Text
          style={[styles.statNote, { color: noteHighlighted ? theme.primary : theme.textMuted, textAlign: dir.textAlign }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}

function OverviewCard({ kpis, periodTotals }: { kpis: DashboardKpis | undefined; periodTotals: PeriodTotals | undefined }) {
  const theme = useTheme();
  const dir = useDir();
  const { t } = useLanguage();
  const { num } = useFormatters();
  const delta = (metric: TrendMetric) =>
    periodTotals ? t('dashboard.deltaOnPeriod', { count: num(periodTotals[metric]) }) : undefined;
  const divider = dir.isRTL
    ? { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: theme.border }
    : { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: theme.border };

  return (
    <Card style={styles.flushCard}>
      <View style={{ flexDirection: dir.row }}>
        <StatTile
          Icon={JitClients}
          label={t('dashboard.statClients')}
          value={num(kpis?.totalClients)}
          note={delta('newClients')}
          noteHighlighted={!!periodTotals?.newClients}
          style={divider}
        />
        <StatTile
          Icon={JitScan}
          label={t('dashboard.transactions')}
          value={num(kpis?.totalTransactions)}
          note={delta('transactions')}
          noteHighlighted={!!periodTotals?.transactions}
        />
      </View>
      <View style={{ flexDirection: dir.row, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }}>
        <StatTile
          Icon={JitStamp}
          label={t('dashboard.statStamps')}
          value={num(kpis?.totalStamps)}
          note={t('dashboard.statStampsUsed', { count: num(kpis?.totalRedeemedStamps) })}
          style={divider}
        />
        <StatTile
          Icon={JitGift}
          label={t('dashboard.trendGifts')}
          value={num(kpis?.totalRewardsGiven)}
          note={delta('rewardsGiven')}
          noteHighlighted={!!periodTotals?.rewardsGiven}
        />
      </View>
      <View style={[styles.overviewFooter, { flexDirection: dir.row, backgroundColor: theme.bgElevated, borderTopColor: theme.border }]}>
        <Eye size={15} color={theme.textMuted} strokeWidth={icon.stroke} />
        <Text style={[styles.caption, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>
          {t('dashboard.profileViewsLine', { count: num(kpis?.profileViews) })}
        </Text>
      </View>
    </Card>
  );
}

function AreaChart({ points, period, accessibilityLabel }: { points: TrendPoint[]; period: TrendPeriod; accessibilityLabel: string }) {
  const theme = useTheme();
  const { num, intlLocale } = useFormatters();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState(points.length - 1);
  const [tooltipWidth, setTooltipWidth] = useState(0);

  const max = niceMax(points.reduce((acc, p) => Math.max(acc, p.count), 0));
  const step = points.length > 1 ? (width - PLOT_INSET * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: points.length > 1 ? PLOT_INSET + i * step : width / 2,
    y: PLOT_BOTTOM - (p.count / max) * (PLOT_BOTTOM - PLOT_TOP),
  }));
  const line = curvePath(coords);
  const first = coords[0];
  const last = coords[coords.length - 1];
  const active = coords[selected];
  const midY = (PLOT_TOP + PLOT_BOTTOM) / 2;

  const selectAt = (event: GestureResponderEvent) => {
    if (step <= 0) return;
    const index = Math.round((event.nativeEvent.locationX - PLOT_INSET) / step);
    const clamped = Math.max(0, Math.min(points.length - 1, index));
    if (clamped !== selected) setSelected(clamped);
  };

  const showXLabel = (i: number) => points.length <= 8 || (points.length - 1 - i) % 2 === 0;

  return (
    <View>
      <View
        style={styles.chartArea}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onResponderGrant={selectAt}
        onResponderMove={selectAt}
        onResponderTerminationRequest={() => true}
        accessible
        accessibilityLabel={accessibilityLabel}
      >
        {width > 0 && first && last ? (
          <Svg width={width} height={CHART_HEIGHT}>
            <Defs>
              <SvgGradient id="dashboardAreaFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={theme.primary} stopOpacity={0.18} />
                <Stop offset="1" stopColor={theme.primary} stopOpacity={0} />
              </SvgGradient>
            </Defs>
            <Line x1={0} x2={width} y1={PLOT_TOP} y2={PLOT_TOP} stroke={theme.border} strokeWidth={1} strokeDasharray="3 5" />
            <Line x1={0} x2={width} y1={midY} y2={midY} stroke={theme.border} strokeWidth={1} strokeDasharray="3 5" />
            <Line x1={0} x2={width} y1={PLOT_BOTTOM} y2={PLOT_BOTTOM} stroke={theme.border} strokeWidth={1} />
            <Path d={`${line} L${last.x},${PLOT_BOTTOM} L${first.x},${PLOT_BOTTOM} Z`} fill="url(#dashboardAreaFill)" />
            <Path d={line} stroke={theme.primary} strokeWidth={2.25} fill="none" strokeLinejoin="round" strokeLinecap="round" />
            {active ? (
              <>
                <Line x1={active.x} x2={active.x} y1={active.y} y2={PLOT_BOTTOM} stroke={theme.primary} strokeOpacity={0.35} strokeWidth={1} />
                <Circle cx={active.x} cy={active.y} r={5} fill={theme.bgCard} stroke={theme.primary} strokeWidth={2.5} />
              </>
            ) : null}
          </Svg>
        ) : null}

        <Text style={[styles.axisLabel, styles.axisMax, { color: theme.textMuted }]} pointerEvents="none" maxFontSizeMultiplier={1.2}>
          {num(max)}
        </Text>

        {active && width > 0 ? (
          <View
            pointerEvents="none"
            onLayout={(e) => setTooltipWidth(e.nativeEvent.layout.width)}
            style={[
              styles.tooltip,
              {
                backgroundColor: theme.text,
                left: Math.max(0, Math.min(width - tooltipWidth, active.x - tooltipWidth / 2)),
                top: Math.max(0, active.y - 38),
              },
            ]}
          >
            <Text style={[styles.tooltipValue, { color: theme.bg }]} maxFontSizeMultiplier={1.2}>{num(points[selected].count)}</Text>
            <Text style={[styles.tooltipDate, { color: theme.bg }]} maxFontSizeMultiplier={1.2}>
              {formatBucket(points[selected].bucket, period, intlLocale, true)}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.xAxis}>
        {coords.map((c, i) => (showXLabel(i) ? (
          <Text
            key={points[i].bucket}
            style={[styles.axisLabel, styles.xLabel, { left: c.x - X_LABEL_WIDTH / 2, color: i === selected ? theme.text : theme.textMuted }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
          >
            {formatBucket(points[i].bucket, period, intlLocale)}
          </Text>
        ) : null))}
      </View>
    </View>
  );
}

function ActivityCard({
  data, period, loading, stale,
}: { data: TrendResponse | undefined; period: TrendPeriod; loading: boolean; stale: boolean }) {
  const theme = useTheme();
  const dir = useDir();
  const { t } = useLanguage();
  const { num } = useFormatters();
  const [metric, setMetric] = useState<TrendMetric>('transactions');

  const points = data?.[metric] ?? [];
  const metricLabel = t(METRICS.find((m) => m.id === metric)?.labelKey ?? '');
  const caption = t(PERIODS.find((p) => p.id === period)?.captionKey ?? '');
  const total = num(sumCounts(points));

  return (
    <Card>
      <View style={[styles.tabs, { flexDirection: dir.row }]} accessibilityRole="tablist">
        {METRICS.map(({ id, labelKey }) => {
          const active = id === metric;
          return (
            <TouchableOpacity
              key={id}
              style={[styles.tab, { backgroundColor: active ? theme.primaryBg : 'transparent' }]}
              onPress={() => { hapticLight(); setMetric(id); }}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[styles.tabText, { color: active ? theme.primary : theme.textMuted }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                maxFontSizeMultiplier={1.3}
              >
                {t(labelKey)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.chartPlaceholder}>
          <ActivityIndicator size="small" color={theme.textMuted} />
        </View>
      ) : points.length === 0 ? (
        <View style={styles.chartPlaceholder}>
          <Text style={[styles.message, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>{t('dashboard.noData')}</Text>
        </View>
      ) : (
        <View style={stale && styles.stale}>
          <View style={{ alignItems: dir.alignStart }}>
            <Text style={[styles.totalValue, { color: theme.text }]} maxFontSizeMultiplier={1.2}>{total}</Text>
            <Text style={[styles.caption, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>{caption}</Text>
          </View>
          <AreaChart
            key={`${period}-${metric}`}
            points={points}
            period={period}
            accessibilityLabel={`${metricLabel}, ${total}, ${caption}`}
          />
        </View>
      )}
    </Card>
  );
}

function GameCard({
  Icon, title, active, onPress, children,
}: { Icon: LucideIcon; title: string; active?: string; onPress: () => void; children: ReactNode }) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
      accessibilityRole="button"
      accessibilityLabel={active ? `${title}, ${active}` : title}
    >
      <View style={[styles.gameHeader, { flexDirection: dir.row }]}>
        <Icon size={icon.md} color={theme.text} strokeWidth={icon.stroke} />
        <Text style={[styles.gameTitle, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {title}
        </Text>
        {active ? (
          <View style={[styles.liveRow, { flexDirection: dir.row }]}>
            <View style={[styles.dot, { backgroundColor: theme.success }]} />
            <Text style={[styles.caption, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>{active}</Text>
          </View>
        ) : null}
        <ChevronRight size={18} color={theme.textMuted} strokeWidth={icon.stroke} style={dir.flip} />
      </View>
      {children}
    </TouchableOpacity>
  );
}

function EmptyGame({ text, cta }: { text: string; cta: string }) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <View style={styles.gameBody}>
      <Text style={[styles.body, { color: theme.textSecondary, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>{text}</Text>
      <Text style={[styles.link, styles.emptyCta, { color: theme.primary, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>{cta}</Text>
    </View>
  );
}

function FunnelStep({ label, value, share, fraction, opacity }: { label: string; value: string; share?: string; fraction: number; opacity: number }) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <View style={styles.funnelStep} accessible accessibilityLabel={[label, value, share].filter(Boolean).join(', ')}>
      <View style={[styles.spaced, { flexDirection: dir.row }]}>
        <Text style={[styles.rowLabel, { color: theme.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{label}</Text>
        <Text style={[styles.rowValue, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
          {value}
          {share ? <Text style={[styles.rowShare, { color: theme.textMuted }]}>{`  ${share}`}</Text> : null}
        </Text>
      </View>
      <ProgressBar fraction={fraction} color={theme.primary} height={8} style={{ opacity }} />
    </View>
  );
}

function ValueRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <View style={[styles.valueRow, styles.spaced, { flexDirection: dir.row, borderTopColor: theme.border }]} accessible accessibilityLabel={`${label}, ${value}`}>
      <Text style={[styles.rowLabel, { color: theme.textSecondary }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{label}</Text>
      <Text style={[styles.rowValue, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{value}</Text>
    </View>
  );
}

function Ring({ fraction, label }: { fraction: number; label: string }) {
  const theme = useTheme();
  const radius = (RING_SIZE - RING_STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = RING_SIZE / 2;
  return (
    <View style={styles.ring}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Circle cx={center} cy={center} r={radius} stroke={theme.bgInput} strokeWidth={RING_STROKE} fill="none" />
        {fraction > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={theme.primary}
            strokeWidth={RING_STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference * fraction} ${circumference}`}
            rotation={-90}
            origin={`${center}, ${center}`}
          />
        ) : null}
      </Svg>
      <Text style={[styles.ringLabel, { color: theme.text }]} maxFontSizeMultiplier={1.1}>{label}</Text>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  const theme = useTheme();
  const dir = useDir();
  return (
    <View style={[styles.legendItem, { flexDirection: dir.row }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.caption, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.3}>{label}</Text>
    </View>
  );
}

function ScratchStats({ scratch }: { scratch: DashboardGames['scratch'] }) {
  const { t } = useLanguage();
  const { num, pct, money } = useFormatters();
  const scratchedShare = ratio(scratch.scratched, scratch.sent);
  const redeemedShare = ratio(scratch.redeemed, scratch.sent);
  return (
    <View style={styles.gameBody}>
      <FunnelStep label={t('dashboard.scratchSent')} value={num(scratch.sent)} fraction={scratch.sent > 0 ? 1 : 0} opacity={1} />
      <FunnelStep label={t('dashboard.scratchScratched')} value={num(scratch.scratched)} share={pct(scratchedShare)} fraction={scratchedShare} opacity={0.65} />
      <FunnelStep label={t('dashboard.scratchRedeemed')} value={num(scratch.redeemed)} share={pct(redeemedShare)} fraction={redeemedShare} opacity={0.4} />
      <View style={styles.valueRows}>
        <ValueRow label={t('dashboard.scratchRevenue')} value={money(scratch.revenue)} />
        <ValueRow label={t('dashboard.scratchDiscount')} value={money(scratch.discountGiven)} />
      </View>
    </View>
  );
}

function WheelStats({ wheel }: { wheel: DashboardGames['wheel'] }) {
  const theme = useTheme();
  const dir = useDir();
  const { t } = useLanguage();
  const { num, pct } = useFormatters();
  const winShare = ratio(wheel.wins, wheel.plays);
  const handedOut = wheel.pending + wheel.fulfilled;
  return (
    <View style={styles.gameBody}>
      <View style={[styles.wheelSummary, { flexDirection: dir.row }]}>
        <Ring fraction={winShare} label={pct(winShare)} />
        <View style={styles.wheelFigures}>
          <Text style={[styles.caption, { color: theme.textMuted, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
            {t('dashboard.wheelWinRate')}
          </Text>
          <View style={[styles.wheelFigureRow, { flexDirection: dir.row }]}>
            <View style={{ alignItems: dir.alignStart }}>
              <Text style={[styles.figureValue, { color: theme.text }]} maxFontSizeMultiplier={1.2}>{num(wheel.plays)}</Text>
              <Text style={[styles.caption, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>{t('dashboard.wheelPlays')}</Text>
            </View>
            <View style={{ alignItems: dir.alignStart }}>
              <Text style={[styles.figureValue, { color: theme.text }]} maxFontSizeMultiplier={1.2}>{num(wheel.wins)}</Text>
              <Text style={[styles.caption, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>{t('dashboard.wheelWins')}</Text>
            </View>
          </View>
        </View>
      </View>
      {handedOut > 0 ? (
        <View style={styles.fulfilment}>
          <View style={[styles.track, styles.splitBar, { flexDirection: dir.row, backgroundColor: theme.bgInput }]}>
            <View style={{ flex: wheel.fulfilled, backgroundColor: theme.primary }} />
            <View style={{ flex: wheel.pending, backgroundColor: theme.warning }} />
          </View>
          <View style={[styles.legend, { flexDirection: dir.row }]}>
            <LegendItem color={theme.primary} label={t('dashboard.wheelFulfilled', { count: num(wheel.fulfilled) })} />
            <LegendItem color={theme.warning} label={t('dashboard.wheelPending', { count: num(wheel.pending) })} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function GamesCards({ games }: { games: DashboardGames }) {
  const router = useRouter();
  const { t } = useLanguage();
  const { scratch, wheel } = games;
  const activeLabel = (count: number) => (count > 0 ? t('dashboard.activeCount', { count }) : undefined);

  return (
    <View style={styles.stack}>
      <GameCard
        Icon={JitTicket}
        title={t('dashboard.scratchTitle')}
        active={activeLabel(scratch.activeCampaigns)}
        onPress={() => { hapticLight(); router.push('/scratch-campaigns'); }}
      >
        {scratch.campaigns === 0
          ? <EmptyGame text={t('dashboard.scratchEmpty')} cta={t('dashboard.createCampaign')} />
          : <ScratchStats scratch={scratch} />}
      </GameCard>

      <GameCard
        Icon={JitGames}
        title={t('dashboard.wheelTitle')}
        active={activeLabel(wheel.activeCampaigns)}
        onPress={() => { hapticLight(); router.push('/lucky-wheel'); }}
      >
        {wheel.campaigns === 0
          ? <EmptyGame text={t('dashboard.wheelEmpty')} cta={t('dashboard.createWheel')} />
          : <WheelStats wheel={wheel} />}
      </GameCard>
    </View>
  );
}

type BarRow = { key: string; label: string; detail?: string; count: number; value: string };

function BarList({ rows, emptyText }: { rows: BarRow[]; emptyText: string }) {
  const theme = useTheme();
  const dir = useDir();
  if (!rows.length) return <MessageCard message={emptyText} />;
  const max = rows.reduce((acc, row) => Math.max(acc, row.count), 1);
  return (
    <Card style={styles.barList}>
      {rows.map((row, index) => (
        <View
          key={row.key}
          style={styles.barRow}
          accessible
          accessibilityLabel={[row.label, row.detail, row.value].filter(Boolean).join(', ')}
        >
          <View style={[styles.spaced, { flexDirection: dir.row }]}>
            <Text style={[styles.barLabel, { color: theme.text, textAlign: dir.textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {row.label}
              {row.detail ? <Text style={[styles.barDetail, { color: theme.textMuted }]}>{`  ·  ${row.detail}`}</Text> : null}
            </Text>
            <Text style={[styles.rowValue, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{row.value}</Text>
          </View>
          <ProgressBar fraction={row.count / max} color={theme.primary} style={{ opacity: index === 0 ? 1 : 0.55 }} />
        </View>
      ))}
    </Card>
  );
}

function TopPrizesList({ prizes }: { prizes: DashboardGames['topPrizes'] }) {
  const { t } = useLanguage();
  const { num } = useFormatters();
  const rows = prizes.map((prize) => ({
    key: `${prize.source}-${prize.label}`,
    label: prize.label,
    detail: t(prize.source === 'WHEEL' ? 'dashboard.sourceWheel' : 'dashboard.sourceScratch'),
    count: prize.count,
    value: t('dashboard.prizeCount', { count: num(prize.count) }),
  }));
  return <BarList rows={rows} emptyText={t('dashboard.noPrizes')} />;
}

function LoyaltyGiftsList({ distribution }: { distribution: RewardDistribution }) {
  const { t } = useLanguage();
  const rows = distribution.map((reward, index) => ({
    key: reward.rewardId ?? `reward-${index}`,
    label: reward.title,
    count: reward.count,
    value: t(reward.count === 1 ? 'dashboard.giftCount_one' : 'dashboard.giftCount_other', { count: reward.count }),
  }));
  return <BarList rows={rows} emptyText={t('dashboard.noGifts')} />;
}

function StateScreen({ title, message, children }: { title: string; message?: string; children?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.stateContainer, { backgroundColor: theme.bg }]}>
      <Text style={[styles.stateTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>{title}</Text>
      {message ? <Text style={[styles.stateText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>{message}</Text> : null}
      {children}
    </View>
  );
}

export default function DashboardScreen() {
  const shouldWait = useRequireAuth();
  const { merchant, isTeamMember } = useAuth();
  const { isPremium } = usePlanStatus(merchant);
  const theme = useTheme();
  const dir = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<TrendPeriod>('day');

  // Every dashboard endpoint is owner + premium only; skip the requests the backend would reject.
  const canView = isPremium && !isTeamMember;
  const kpis = useDashboardKpis(canView);
  const trends = useDashboardTrends(period, canView);
  const games = useDashboardGames(canView);
  const distribution = useDashboardDistribution(canView);

  const periodTotals = useMemo<PeriodTotals | undefined>(() => {
    if (!trends.data) return undefined;
    return {
      transactions: sumCounts(trends.data.transactions),
      newClients: sumCounts(trends.data.newClients),
      rewardsGiven: sumCounts(trends.data.rewardsGiven),
    };
  }, [trends.data]);

  const onRefresh = useGuardedCallback(async () => {
    hapticLight();
    await Promise.all(
      [queryKeys.dashboardKpis, queryKeys.dashboardGames, queryKeys.dashboardDistribution, ['dashboard-trends']].map(
        (queryKey) => queryClient.invalidateQueries({ queryKey }),
      ),
    );
  }, [queryClient]);

  if (shouldWait) return null;

  if (isTeamMember) {
    return (
      <StateScreen title={t('common.ownerOnly')} message={t('common.ownerOnlyMsg')}>
        <ActionButton label={t('common.back')} variant="secondary" onPress={() => router.back()} style={styles.stateButton} />
      </StateScreen>
    );
  }

  if (kpis.isLoading) {
    return (
      <View style={[styles.stateContainer, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.textMuted} accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  if (kpis.isError) {
    return (
      <StateScreen title={t('common.error')}>
        <ActionButton label={t('common.retry')} onPress={() => { hapticLight(); kpis.refetch(); }} style={styles.stateButton} />
      </StateScreen>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { flexDirection: dir.row, paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={icon.lg} color={theme.text} strokeWidth={icon.stroke} style={dir.flip} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text, textAlign: dir.textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
          {t('dashboard.title')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={kpis.isRefetching} onRefresh={onRefresh} tintColor={theme.textMuted} />}
      >
        <PeriodSelector value={period} onChange={setPeriod} />

        <Section title={t('dashboard.sectionProgram')}>
          <OverviewCard kpis={kpis.data} periodTotals={periodTotals} />
        </Section>

        <Section title={t('dashboard.evolution')}>
          <ActivityCard data={trends.data} period={period} loading={trends.isLoading} stale={trends.isPlaceholderData} />
        </Section>

        {canView ? (
          <Section title={t('dashboard.sectionGames')}>
            {games.isLoading ? (
              <LoadingCard />
            ) : games.data ? (
              <GamesCards games={games.data} />
            ) : (
              <MessageCard
                message={t('dashboard.gamesError')}
                actionLabel={t('common.retry')}
                onAction={() => { hapticLight(); games.refetch(); }}
              />
            )}
          </Section>
        ) : null}

        <Section title={t('dashboard.giftDistribution')}>
          {distribution.isLoading ? <LoadingCard /> : <LoyaltyGiftsList distribution={distribution.data ?? []} />}
        </Section>

        {games.data ? (
          <Section title={t('dashboard.topPrizes')}>
            <TopPrizesList prizes={games.data.topPrizes} />
          </Section>
        ) : null}
      </ScrollView>

      {/* Blur rather than hide: the locked content stays softly visible behind. */}
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
  content: { paddingHorizontal: 20, paddingTop: 8 },
  stack: { gap: 12 },
  spaced: { alignItems: 'center', justifyContent: 'space-between', gap: 12 },

  header: { alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 8 },
  backButton: { width: 32, height: 40, justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 26, fontFamily: font.bold, letterSpacing: -0.5 },

  section: { marginTop: 28 },
  sectionTitle: { fontSize: 16, fontFamily: font.semibold, marginBottom: 12 },

  card: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 18 },
  flushCard: { padding: 0, overflow: 'hidden' },
  centered: { alignItems: 'center', justifyContent: 'center', minHeight: 96, gap: 8 },

  body: { fontSize: 14, lineHeight: 20, fontFamily: font.regular },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: font.regular },
  message: { fontSize: 13, lineHeight: 19, fontFamily: font.regular, textAlign: 'center' },
  link: { fontSize: 14, fontFamily: font.semibold },

  segment: { borderRadius: 12, padding: 4 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  segmentText: { fontSize: 13, fontFamily: font.semibold },

  statTile: { flex: 1, minWidth: 0, paddingHorizontal: 16, paddingVertical: 16, gap: 6 },
  statLabelRow: { alignItems: 'center', gap: 6 },
  statLabel: { flexShrink: 1, fontSize: 12, fontFamily: font.medium },
  statValue: { fontSize: 26, fontFamily: font.bold, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  statNote: { fontSize: 12, fontFamily: font.medium },
  overviewFooter: { alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },

  tabs: { gap: 6, marginBottom: 18 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 999 },
  tabText: { fontSize: 13, fontFamily: font.semibold },
  totalValue: { fontSize: 32, fontFamily: font.bold, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  stale: { opacity: 0.5 },
  chartPlaceholder: { height: CHART_HEIGHT + 72, alignItems: 'center', justifyContent: 'center' },
  chartArea: { height: CHART_HEIGHT, marginTop: 8 },
  axisLabel: { fontSize: 11, fontFamily: font.regular, fontVariant: ['tabular-nums'] },
  axisMax: { position: 'absolute', left: 0, top: PLOT_TOP - 16 },
  xAxis: { height: 18, marginTop: 8 },
  xLabel: { position: 'absolute', width: X_LABEL_WIDTH, textAlign: 'center' },
  tooltip: { position: 'absolute', flexDirection: 'row', alignItems: 'baseline', gap: 6, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  tooltipValue: { fontSize: 13, fontFamily: font.bold, fontVariant: ['tabular-nums'] },
  tooltipDate: { fontSize: 11, fontFamily: font.regular, opacity: 0.75 },

  gameHeader: { alignItems: 'center', gap: 10 },
  gameTitle: { flex: 1, fontSize: 16, fontFamily: font.semibold },
  liveRow: { alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  gameBody: { marginTop: 18 },
  emptyCta: { marginTop: 10 },
  funnelStep: { gap: 8, marginBottom: 14 },
  rowLabel: { flex: 1, fontSize: 14, fontFamily: font.regular },
  rowValue: { fontSize: 15, fontFamily: font.semibold, fontVariant: ['tabular-nums'] },
  rowShare: { fontSize: 12, fontFamily: font.regular },
  track: { overflow: 'hidden' },
  valueRows: { marginTop: 4 },
  valueRow: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },

  wheelSummary: { alignItems: 'center', gap: 18 },
  ring: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ringLabel: { position: 'absolute', fontSize: 17, fontFamily: font.bold, fontVariant: ['tabular-nums'] },
  wheelFigures: { flex: 1, gap: 10 },
  wheelFigureRow: { gap: 28 },
  figureValue: { fontSize: 22, fontFamily: font.bold, letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  fulfilment: { marginTop: 18, gap: 10 },
  splitBar: { height: 8, borderRadius: 4, gap: 2 },
  legend: { flexWrap: 'wrap', gap: 16 },
  legendItem: { alignItems: 'center', gap: 6 },

  barList: { paddingVertical: 6 },
  barRow: { gap: 8, paddingVertical: 10 },
  barLabel: { flex: 1, fontSize: 14, fontFamily: font.medium },
  barDetail: { fontSize: 12, fontFamily: font.regular },

  stateContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  stateTitle: { fontSize: 17, fontFamily: font.semibold, textAlign: 'center' },
  stateText: { marginTop: 8, fontSize: 14, lineHeight: 20, fontFamily: font.regular, textAlign: 'center' },
  stateButton: { marginTop: 20, paddingHorizontal: 28 },

  premiumOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6,4,16,0.42)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  premiumCard: { width: '100%', borderRadius: 24, overflow: 'hidden' },
});
