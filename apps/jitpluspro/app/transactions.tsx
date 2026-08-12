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
import { ArrowLeft, AlertCircle, Zap } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ActivityListSkeleton } from '@/components/Skeleton';
import { useTransactions } from '@/hooks/useQueryHooks';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pokeInteraction } from '@/utils/interaction';
import { ms } from '@/utils/responsive';
import { TransactionRow, buildHomeRows, type HomeRow } from '@/components/TransactionRow';
import type { Transaction } from '@/types';

const HIT_SLOP_LARGE = { top: 12, bottom: 12, left: 12, right: 12 };
const safeImpact = (style: Haptics.ImpactFeedbackStyle) => {
  Haptics.impactAsync(style).catch(() => {});
};

/** Full paginated transaction history (reached via "Tout afficher" on Accueil). */
export default function TransactionsScreen() {
  const merchant = useAuthStore((s) => s.merchant);
  const theme = useTheme();
  const router = useRouter();
  const { t, locale } = useLanguage();
  const insets = useSafeAreaInsets();

  const {
    data,
    isLoading: loading,
    isRefetching: refreshing,
    isError,
    hasNextPage: hasMore,
    isFetchingNextPage: loadingMore,
    fetchNextPage: loadMore,
    refetch,
  } = useTransactions();

  const transactions = useMemo<Transaction[]>(
    () => (data?.pages ?? []).flatMap((p) => p.transactions),
    [data],
  );

  const rows = useMemo<HomeRow[]>(() => buildHomeRows(transactions, t, locale), [transactions, t, locale]);

  const onRefresh = useGuardedCallback(async () => {
    await refetch();
  }, [refetch]);

  const renderRow = useCallback(({ item }: { item: HomeRow }) => {
    if (item.kind === 'header') {
      return (
        <Text style={[styles.groupLabel, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
          {item.label}
        </Text>
      );
    }
    return (
      <View style={styles.rowWrap}>
        <TransactionRow item={item.tx} merchantLoyaltyType={merchant?.loyaltyType} />
      </View>
    );
  }, [theme.textMuted, merchant?.loyaltyType]);

  const keyExtractor = useCallback((item: HomeRow) => item.id, []);

  const showSkeleton = loading && transactions.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* ── Simple back header ── */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={HIT_SLOP_LARGE}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
          {t('transactionsScreen.title')}
        </Text>
      </View>

      {isError && transactions.length === 0 && !loading ? (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIllustration, { backgroundColor: `${theme.danger}14` }]}>
            <AlertCircle size={ms(36)} color={theme.danger} strokeWidth={1.5} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.6}>
            {t('common.errorTitle', { defaultValue: 'Erreur de chargement' })}
          </Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
            {t('common.errorHint', { defaultValue: 'Vérifiez votre connexion et réessayez.' })}
          </Text>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: theme.primary }]}
            onPress={() => {
              safeImpact(Haptics.ImpactFeedbackStyle.Light);
              refetch();
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry', { defaultValue: 'Réessayer' })}
          >
            <Text style={styles.retryBtnText} maxFontSizeMultiplier={1.4}>
              {t('common.retry', { defaultValue: 'Réessayer' })}
            </Text>
          </TouchableOpacity>
        </View>
      ) : showSkeleton ? (
        <View style={styles.list}>
          <ActivityListSkeleton count={8} />
        </View>
      ) : (
        <FlatList
          data={rows}
          renderItem={renderRow}
          keyExtractor={keyExtractor}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={10}
          windowSize={7}
          initialNumToRender={12}
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={pokeInteraction}
          onTouchStart={pokeInteraction}
          onEndReached={() => { if (hasMore) loadMore(); }}
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
              <View
                style={styles.footerLoader}
                accessible
                accessibilityLabel={t('common.loading', { defaultValue: 'Chargement' })}
              >
                <ActivityIndicator size="small" color={theme.primary} />
              </View>
            ) : !hasMore && rows.length > 0 ? (
              <View style={styles.footerEndWrap}>
                <View style={[styles.footerDivider, { backgroundColor: theme.border }]} />
                <Text style={[styles.footerEnd, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
                  {t('common.allDisplayed')}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIllustration, { backgroundColor: `${palette.charbon}12` }]}>
                <Zap size={ms(36)} color={palette.charbon} strokeWidth={1.5} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.6}>
                {t('activity.noActivity')}
              </Text>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.6}>
                {t('activity.noActivityHint')}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.3,
  },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  groupLabel: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 16,
    marginBottom: 8,
  },
  rowWrap: { marginBottom: 8 },
  emptyContainer: { alignItems: 'center', paddingTop: 80 },
  emptyIllustration: {
    width: ms(88),
    height: ms(88),
    borderRadius: ms(24),
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
  retryBtn: {
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    alignSelf: 'center',
  },
  retryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    fontFamily: 'Lexend_600SemiBold',
  },
});
