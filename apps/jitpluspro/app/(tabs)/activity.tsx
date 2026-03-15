import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Clock,
  Plus,
  Minus,
  X,
  RefreshCw,
  Zap,
} from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ActivityListSkeleton } from '@/components/Skeleton';
import api from '@/services/api';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated } from 'react-native';
import { formatCurrency } from '@/config/currency';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusFade } from '@/hooks/useFocusFade';
import { useExitOnBack } from '@/hooks/useExitOnBack';
import { formatDateTime } from '@/utils/date';

interface Transaction {
  id: string;
  clientId: string;
  type: 'EARN_POINTS' | 'REDEEM_REWARD' | 'ADJUST_POINTS' | 'LOYALTY_PROGRAM_CHANGE';
  loyaltyType?: 'POINTS' | 'STAMPS' | null;
  amount: number;
  points: number;
  status: 'ACTIVE' | 'CANCELLED';
  createdAt: string;
  note?: string | null;
  performedByName?: string | null;
  teamMember?: { id: string; nom: string } | null;
  reward?: { id: string; titre: string; cout: number } | null;
  client: { id: string; prenom?: string | null; nom: string; email: string };
}

export default function ActivityScreen() {
  const { merchant } = useAuth();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { focusStyle } = useFocusFade();
  const insets = useSafeAreaInsets();

  // Android: "press back again to exit" on the home tab
  useExitOnBack();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Mutable ref — avoids stale closure in loadMore without adding page to its deps */
  const pageRef = useRef(1);
  const PAGE_LIMIT = 20;

  const load = useCallback(async (signal?: { cancelled: boolean }) => {
    try {
      setLoading(true);
      pageRef.current = 1;
      const txRes = await api.get(`/merchant/transactions?page=1&limit=${PAGE_LIMIT}`).catch(() => null);
      if (signal?.cancelled) return;
      if (txRes) {
        const list: Transaction[] = txRes.data?.transactions || [];
        setTransactions(list);
        setHasMore(list.length >= PAGE_LIMIT);
      }
    } catch (error) {
      if (__DEV__) console.error('[Activity] Échec du chargement des transactions:', error);
    } finally {
      if (!signal?.cancelled) setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const nextPage = pageRef.current + 1;
      const txRes = await api.get(`/merchant/transactions?page=${nextPage}&limit=${PAGE_LIMIT}`).catch(() => null);
      if (txRes) {
        const newTx: Transaction[] = txRes.data?.transactions || [];
        setTransactions((prev) => [...prev, ...newTx]);
        pageRef.current = nextPage;
        setHasMore(newTx.length >= PAGE_LIMIT);
      }
    } catch (error) {
      if (__DEV__) console.error('[Activity] Erreur pagination:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore]);

  useEffect(() => {
    const signal = { cancelled: false };
    load(signal);
    return () => { signal.cancelled = true; };
  }, [load]);

  const onRefresh = useGuardedCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const renderTx = useCallback(({ item }: { item: Transaction }) => {
    const isEarned = item.type === 'EARN_POINTS';
    const isCancelled = item.status === 'CANCELLED';
    const isProgramChange = item.type === 'LOYALTY_PROGRAM_CHANGE';
    const isAdjust = item.type === 'ADJUST_POINTS';
    const color = isCancelled
      ? theme.danger
      : isProgramChange
        ? theme.primary
        : isAdjust
          ? theme.primary
          : isEarned
            ? theme.success
            : theme.warning;
    const IconComp = isCancelled ? X : isProgramChange ? RefreshCw : isEarned ? Plus : Minus;
    const performerName = item.performedByName || item.teamMember?.nom || null;

    return (
      <View
        style={[
          styles.txRow,
          { borderBottomColor: '#334155' },
        ]}
      >
        <View style={[styles.txIcon, { backgroundColor: color + '18' }]}>
          <IconComp size={16} color={color} strokeWidth={1.5} />
        </View>
        <View style={styles.txInfo}>
          <Text style={[styles.txName, { color: theme.text }, isCancelled && styles.cancelled]}>
            {[item.client.prenom, item.client.nom].filter(Boolean).join(' ') || '?'}
          </Text>
          <Text style={[styles.txDate, { color: theme.textMuted }]}>{formatDateTime(item.createdAt, locale)}</Text>
          {isProgramChange && item.note && (
            <Text style={[styles.txReward, { color: theme.primary }]}>
              🔄 {item.note}
            </Text>
          )}
          {!isEarned && !isProgramChange && item.reward && (
            <Text style={[styles.txReward, { color: theme.warning }]}>
              🎁 {item.reward.titre}
            </Text>
          )}
          {performerName && (
            <Text style={[styles.txPerformer, { color: theme.textMuted }]}>
              {t('activity.by', { name: performerName })}
            </Text>
          )}
          {isCancelled && <Text style={styles.cancelLabel}>{t('activity.cancelled')}</Text>}
        </View>
        {!isProgramChange && (
          <View style={styles.txRight}>
            {item.amount > 0 && (
              <Text style={[styles.txAmount, { color: theme.textSecondary }, isCancelled && styles.cancelled]}>
                {formatCurrency(item.amount)}
              </Text>
            )}
            <Text style={[styles.txPoints, { color }, isCancelled && styles.cancelled]}>
              {isEarned ? '+' : '-'}{item.points} {(item.loyaltyType ?? merchant?.loyaltyType) === 'STAMPS' ? 'tmp' : 'pts'}
            </Text>
          </View>
        )}
      </View>
    );
  }, [theme, merchant?.loyaltyType, locale, t]);

  const keyExtractor = useCallback((item: Transaction) => item.id, []);

  // ── Skeleton loading ──
  if (loading && transactions.length === 0) {
    return (
      <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
        <LinearGradient
          colors={['#7C3AED', '#1F2937']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.header, { paddingTop: insets.top + 12 }]}
        >
          <View>
            <Text style={styles.headerTitle}>{t('activity.title')}</Text>
            <Text style={styles.headerSub}>{t('activity.subtitle')}</Text>
          </View>
        </LinearGradient>
        <View style={styles.list}>
          <ActivityListSkeleton count={6} />
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
      <LinearGradient
        colors={['#7C3AED', '#1F2937']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <View>
          <Text style={styles.headerTitle}>{t('activity.title')}</Text>
          <Text style={styles.headerSub}>{t('activity.subtitle')}</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <RefreshCw size={22} color="#E0F7FA" strokeWidth={1.5} />
        </TouchableOpacity>
      </LinearGradient>

      <FlatList
        data={transactions}
        renderItem={renderTx}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.list}
        removeClippedSubviews={Platform.OS !== 'web'}
        maxToRenderPerBatch={10}
        windowSize={7}
        initialNumToRender={10}
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
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
            <Text style={[styles.footerEnd, { color: theme.textMuted }]}>{t('common.allDisplayed')}</Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIllustration, { backgroundColor: theme.primaryBg }]}>
              <Zap size={48} color={theme.primary} strokeWidth={1.5} />
            </View>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('activity.noActivity')}</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              {t('activity.noActivityHint')}
            </Text>
          </View>
        }
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_700Bold' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,.7)', marginTop: 4, fontFamily: 'Lexend_500Medium' },
  refreshBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(26,23,38,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingHorizontal: 0, paddingTop: 8, paddingBottom: 120 },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  txIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  txInfo: { flex: 1 },
  txName: { fontSize: 14, fontWeight: '600', fontFamily: 'Inter_600SemiBold', letterSpacing: -0.3 },
  txDate: { fontSize: 11, marginTop: 1, fontFamily: 'Inter_400Regular', letterSpacing: -0.2 },
  txPerformer: { fontSize: 10, marginTop: 1, fontStyle: 'italic', fontFamily: 'Inter_400Regular', letterSpacing: -0.2 },
  txReward: { fontSize: 10, marginTop: 1, fontWeight: '600', fontFamily: 'Inter_500Medium', letterSpacing: -0.2 },
  cancelLabel: { fontSize: 10, color: '#ef4444', fontWeight: '600', marginTop: 1, fontFamily: 'Inter_500Medium', letterSpacing: -0.2 },
  cancelled: { textDecorationLine: 'line-through', opacity: 0.5 },
  txRight: { alignItems: 'flex-end', minWidth: 80 },
  txAmount: { fontSize: 12, fontWeight: '600', fontFamily: 'Inter_500Medium', letterSpacing: -0.3, textAlign: 'right' },
  txPoints: { fontSize: 14, fontWeight: '700', marginTop: 1, fontFamily: 'Inter_700Bold', letterSpacing: -0.3, textAlign: 'right' },
  emptyContainer: { alignItems: 'center', paddingTop: 60 },
  emptyIllustration: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', marginTop: 4, fontFamily: 'Lexend_600SemiBold' },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 8, paddingHorizontal: 40, lineHeight: 20, fontFamily: 'Lexend_500Medium' },
  footerLoader: { alignItems: 'center', paddingVertical: 20 },
  footerEnd: { textAlign: 'center', fontSize: 12, paddingVertical: 16, marginBottom: 6, fontFamily: 'Lexend_500Medium', opacity: 0.55 },
});
