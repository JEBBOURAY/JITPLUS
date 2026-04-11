import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import {
  RefreshCw,
  Zap,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react-native';
import { getTransactionConfig } from '@/constants/transactions';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ActivityListSkeleton } from '@/components/Skeleton';
import { useTransactions } from '@/hooks/useQueryHooks';
import { useRouter } from 'expo-router';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Animated } from 'react-native';
import { formatCurrency, DEFAULT_CURRENCY, getIntlLocale } from '@/config/currency';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusFade } from '@/hooks/useFocusFade';
import { useExitOnBack } from '@/hooks/useExitOnBack';
import { formatDateTime } from '@/utils/date';
import type { Transaction } from '@/types';

const HEADER_GRADIENT: [string, string, string] = ['#5B21B6', '#7C3AED', '#1F2937'];

/* ── Memoized row — avoids re-render of every row on list updates ── */
const TransactionRow = React.memo(function TransactionRow({
  item,
  merchantLoyaltyType,
}: {
  item: Transaction;
  merchantLoyaltyType?: string | null;
}) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const isDark = theme.mode === 'dark';
  const isEarned = item.type === 'EARN_POINTS';
  const isCancelled = item.status === 'CANCELLED';
  const isProgramChange = item.type === 'LOYALTY_PROGRAM_CHANGE';
  const { icon: IconComp, color } = getTransactionConfig(item.type, isCancelled, theme);
  const flowColor = isCancelled ? theme.danger : isEarned ? theme.primary : theme.accent;
  const flowBg = isCancelled
    ? `${theme.danger}14`
    : isEarned
      ? (isDark ? 'rgba(167,139,250,0.12)' : 'rgba(124,58,237,0.08)')
      : (isDark ? 'rgba(156,163,175,0.12)' : 'rgba(31,41,55,0.06)');
  const performerName = item.performedByName || item.teamMember?.nom || null;
  const isReward = item.type === 'REDEEM_REWARD' && !isCancelled;

  const pointsLabel = (item.loyaltyType ?? merchantLoyaltyType) === 'STAMPS'
    ? t('common.stampsAbbr')
    : t('common.pointsAbbr');

  return (
    <View style={[styles.txCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
      {/* ── Flow indicator bar ── */}
      <View style={[styles.flowBar, { backgroundColor: flowColor }]} />

      {/* ── Icon ── */}
      <View style={[styles.txIcon, { backgroundColor: color + '14' }]}>
        <IconComp size={18} color={color} strokeWidth={1.8} />
      </View>

      {/* ── Info ── */}
      <View style={styles.txInfo}>
        <Text style={[styles.txName, { color: theme.text }, isCancelled && styles.cancelled]} numberOfLines={1}>
          {[item.client?.prenom, item.client?.nom].filter(Boolean).join(' ') || '?'}
        </Text>
        <Text style={[styles.txDate, { color: theme.textMuted }]}>
          {formatDateTime(item.createdAt, locale)}
        </Text>
        {isProgramChange && item.note && (
          <Text style={[styles.txMeta, { color: theme.primary }]} numberOfLines={1}>
            🔄 {item.note}
          </Text>
        )}
        {!isEarned && !isProgramChange && item.reward && (
          <View style={styles.rewardRow}>
            <Text style={[styles.txMeta, { color: theme.primary }]} numberOfLines={1}>
              🎁 {item.reward.titre}
            </Text>
            {isReward && item.giftStatus === 'FULFILLED' && (
              <View style={[styles.giftBadge, { backgroundColor: `${theme.accent}15`, borderColor: `${theme.accent}30` }]}>
                <Text style={[styles.giftBadgeText, { color: theme.accent }]}>{t('gift.fulfilled')}</Text>
              </View>
            )}
          </View>
        )}
        {performerName && (
          <Text style={[styles.txPerformer, { color: theme.textMuted }]} numberOfLines={1}>
            {t('activity.by', { name: performerName })}
          </Text>
        )}
        {isCancelled && <Text style={styles.cancelLabel}>{t('activity.cancelled')}</Text>}
      </View>

      {/* ── Flow amount ── */}
      {!isProgramChange && (
        <View style={styles.txRight}>
          {item.amount > 0 && (
            <Text style={[styles.txAmount, { color: theme.textMuted }, isCancelled && styles.cancelled]}>
              {formatCurrency(item.amount, DEFAULT_CURRENCY, getIntlLocale(locale))}
            </Text>
          )}
          <View style={[styles.flowPill, { backgroundColor: flowBg }]}>
            {isEarned
              ? <ArrowUpRight size={11} color={flowColor} strokeWidth={2.5} />
              : <ArrowDownLeft size={11} color={flowColor} strokeWidth={2.5} />}
            <Text style={[styles.flowPillText, { color: flowColor }, isCancelled && styles.cancelled]}>
              {isEarned ? '+' : '−'}{item.points} {pointsLabel}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
});

export default function ActivityScreen() {
  const { merchant } = useAuth();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { focusStyle } = useFocusFade();
  const insets = useSafeAreaInsets();

  const router = useRouter();

  // Android: "press back again to exit" on the home tab
  useExitOnBack();

  const {
    data,
    isLoading: loading,
    isRefetching: refreshing,
    hasNextPage: hasMore,
    isFetchingNextPage: loadingMore,
    fetchNextPage: loadMore,
    refetch,
  } = useTransactions();

  const transactions = useMemo<Transaction[]>(
    () => (data?.pages ?? []).flatMap((p) => p.transactions),
    [data],
  );

  const onRefresh = useGuardedCallback(async () => {
    await refetch();
  }, [refetch]);

  const renderTx = useCallback(({ item }: { item: Transaction }) => (
    <TransactionRow item={item} merchantLoyaltyType={merchant?.loyaltyType} />
  ), [merchant?.loyaltyType]);

  const keyExtractor = useCallback((item: Transaction) => item.id, []);

  const showSkeleton = loading && transactions.length === 0;

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
      {/* ── Glassmorphism header ── */}
      <View collapsable={false}>
        <LinearGradient
          colors={HEADER_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <BlurView
            intensity={Platform.OS === 'ios' ? 40 : 20}
            tint={theme.mode === 'dark' ? 'dark' : 'default'}
            style={[styles.headerBlur, { paddingTop: insets.top + 16 }]}
          >
            {/* Glass overlay */}
            <View style={styles.glassOverlay} />

            <View style={styles.header}>
              <View style={styles.headerContent}>
                <Text style={styles.headerTitle}>{t('activity.title')}</Text>
                <Text style={styles.headerSub}>{t('activity.subtitle')}</Text>
              </View>
              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={onRefresh}
                activeOpacity={0.7}
              >
                <RefreshCw size={20} color="rgba(255,255,255,0.9)" strokeWidth={1.8} />
              </TouchableOpacity>
            </View>
          </BlurView>
        </LinearGradient>
        {/* Decorative fade line */}
        <LinearGradient
          colors={['rgba(124,58,237,0.3)', 'transparent']}
          style={styles.headerFade}
        />
      </View>

      {showSkeleton ? (
        <View style={styles.list}>
          <ActivityListSkeleton count={6} />
        </View>
      ) : (
      <FlatList
        data={transactions}
        renderItem={renderTx}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.list}
        removeClippedSubviews={Platform.OS !== 'web'}
        maxToRenderPerBatch={10}
        windowSize={7}
        initialNumToRender={10}
        onEndReached={() => { if (hasMore) loadMore(); }}
        onEndReachedThreshold={0.3}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.primary]}
            tintColor={theme.primary}
          />
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : !hasMore && transactions.length > 0 ? (
            <View style={styles.footerEndWrap}>
              <View style={[styles.footerDivider, { backgroundColor: theme.border }]} />
              <Text style={[styles.footerEnd, { color: theme.textMuted }]}>
                {t('common.allDisplayed')}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIllustration, { backgroundColor: theme.primaryBg }]}>
              <Zap size={44} color={theme.primary} strokeWidth={1.2} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              {t('activity.noActivity')}
            </Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {t('activity.noActivityHint')}
            </Text>
          </View>
        }
      />
      )}
    </Animated.View>
  );
}

/* ── Premium Styles ── */
const styles = StyleSheet.create({
  container: { flex: 1 },

  /* Header — glassmorphism */
  headerGradient: {
    overflow: 'hidden',
  },
  headerBlur: {
    overflow: 'hidden',
  },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  headerContent: { flex: 1, marginRight: 16 },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 6,
    fontFamily: 'Lexend_400Regular',
    letterSpacing: 0.3,
  },
  headerFade: { height: 4 },
  refreshBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    ...(Platform.OS === 'ios' ? {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
    } : { elevation: 3 }),
  },

  /* List */
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120 },
  separator: { height: 8 },

  /* Transaction card */
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    paddingLeft: 0,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  flowBar: {
    width: 3,
    borderRadius: 2,
    alignSelf: 'stretch',
    marginRight: 12,
  },
  txIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  txInfo: { flex: 1, marginRight: 8 },
  txName: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
    letterSpacing: -0.2,
  },
  txDate: {
    fontSize: 11,
    marginTop: 3,
    fontFamily: 'Lexend_400Regular',
    letterSpacing: 0.1,
  },
  txPerformer: {
    fontSize: 10,
    marginTop: 3,
    fontStyle: 'italic',
    fontFamily: 'Lexend_400Regular',
    letterSpacing: 0.1,
  },
  txMeta: {
    fontSize: 11,
    marginTop: 3,
    fontWeight: '500',
    fontFamily: 'Lexend_500Medium',
    letterSpacing: -0.1,
  },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  giftBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  giftBadgeText: { fontSize: 9, fontWeight: '700', fontFamily: 'Lexend_600SemiBold' },
  cancelLabel: {
    fontSize: 10,
    color: '#ef4444',
    fontWeight: '600',
    marginTop: 3,
    fontFamily: 'Lexend_500Medium',
    letterSpacing: -0.1,
  },
  cancelled: { textDecorationLine: 'line-through', opacity: 0.45 },

  /* Right side — flow pill */
  txRight: { alignItems: 'flex-end', minWidth: 88 },
  txAmount: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: 'Lexend_400Regular',
    letterSpacing: -0.2,
    textAlign: 'right',
    marginBottom: 4,
  },
  flowPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  flowPillText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.3,
  },

  /* Empty state */
  emptyContainer: { alignItems: 'center', paddingTop: 80 },
  emptyIllustration: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.3,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 48,
    lineHeight: 22,
    fontFamily: 'Lexend_400Regular',
    letterSpacing: 0.1,
  },

  /* Footer */
  footerLoader: { alignItems: 'center', paddingVertical: 24 },
  footerEndWrap: { alignItems: 'center', paddingVertical: 20 },
  footerDivider: { width: 40, height: 1, marginBottom: 12, borderRadius: 1, opacity: 0.4 },
  footerEnd: {
    textAlign: 'center',
    fontSize: 12,
    fontFamily: 'Lexend_400Regular',
    letterSpacing: 0.2,
    opacity: 0.5,
  },
});
