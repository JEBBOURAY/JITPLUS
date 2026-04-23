import React, { useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, RefreshControl, TouchableOpacity,
  Platform, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, Pencil, RefreshCw, ChevronLeft, Gift, FerrisWheel, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { wp, hp, ms, fontSize as FS } from '@/utils/responsive';
import FadeInView from './FadeInView';
import Skeleton from './Skeleton';
import { formatDateTime } from '@/utils/date';

type TxType = 'EARN_POINTS' | 'REDEEM_REWARD' | 'ADJUST_POINTS' | 'LOYALTY_PROGRAM_CHANGE' | 'LUCKY_WHEEL_WIN';

export interface TransactionHistoryItem {
  id: string;
  type: TxType | string;
  amount?: number | null;
  createdAt: string | Date;
  merchant?: { nom?: string } | null;
  reward?: { titre?: string } | null;
}

interface RowTheme {
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  bgCard: string;
}

type Translator = (key: string, params?: Record<string, unknown>) => string;

interface TxConfig {
  icon: LucideIcon;
  color: string;
  sign: string;
}

function getTransactionConfig(type: string, theme: RowTheme): TxConfig {
  const configMap: Record<string, TxConfig> = {
    EARN_POINTS: { icon: Plus, color: theme.primary, sign: '+' },
    REDEEM_REWARD: { icon: Gift, color: theme.primary, sign: '-' },
    ADJUST_POINTS: { icon: Pencil, color: theme.accent, sign: '' },
    LOYALTY_PROGRAM_CHANGE: { icon: RefreshCw, color: theme.primary, sign: '' },
    LUCKY_WHEEL_WIN: { icon: FerrisWheel, color: '#F59E0B', sign: '+' },
  };
  return configMap[type] || configMap.EARN_POINTS;
}

function getTransactionLabel(type: string, t: Translator): string {
  const labels: Record<string, string> = {
    EARN_POINTS: t('scanHistory.earnPoints') || 'Points gagnés',
    REDEEM_REWARD: t('scanHistory.redeemReward') || 'Récompense utilisée',
    ADJUST_POINTS: t('scanHistory.adjustPoints') || 'Ajustement',
    LOYALTY_PROGRAM_CHANGE: t('scanHistory.programChange') || 'Changement de programme',
    LUCKY_WHEEL_WIN: t('scanHistory.luckyWheelWin') || 'Cadeau de la roue',
  };
  return labels[type] || type;
}

// Safe date extraction - never crashes on null/undefined/invalid values
function safeDateString(value: string | Date | null | undefined): string {
  if (!value) return '';
  try {
    if (value instanceof Date) return value.toISOString();
    return String(value);
  } catch {
    return '';
  }
}

interface TransactionRowProps {
  item: TransactionHistoryItem;
  theme: RowTheme;
  locale: string;
  t: Translator;
}

const TransactionRow = React.memo(function TransactionRow({ item, theme, locale, t }: TransactionRowProps) {
  const config = getTransactionConfig(item.type, theme);
  const IconComponent = config.icon;
  const label = getTransactionLabel(item.type, t);
  const displayDate = formatDateTime(safeDateString(item.createdAt), locale);
  const hasAmount = typeof item.amount === 'number' && item.amount !== 0;

  return (
    <FadeInView>
      <TouchableOpacity
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${label}${item.merchant?.nom ? `, ${item.merchant.nom}` : ''}${hasAmount ? `, ${config.sign}${item.amount}` : ''}`}
        style={[styles.txCard, { backgroundColor: theme.bgCard, borderLeftColor: config.color }]}
      >
        <View style={[styles.txIconBadge, { backgroundColor: config.color + '20' }]}>
          <IconComponent size={ms(20)} color={config.color} />
        </View>
        <View style={styles.txInfo}>
          <Text style={[styles.txType, { color: theme.text }]} numberOfLines={1}>
            {item.reward?.titre || label}
          </Text>
          {!!item.merchant?.nom && (
            <Text style={{ fontSize: FS.sm, fontWeight: '500', color: theme.text, marginTop: hp(0.2) }} numberOfLines={1}>
              {item.merchant.nom}
            </Text>
          )}
          {!!displayDate && (
            <Text style={[styles.txDate, { color: theme.textMuted }]}>{displayDate}</Text>
          )}
        </View>
        <View style={styles.txAmountContainer}>
          {hasAmount && (
            <Text style={[styles.txAmount, { color: config.color }]}>
              {config.sign}{item.amount}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    </FadeInView>
  );
});

export interface TransactionHistoryScreenProps {
  headerTitle: string;
  headerSubtitle: string;
  emptyText: string;
  query: {
    data: { pages: { transactions?: TransactionHistoryItem[] }[] } | undefined;
    isLoading: boolean;
    isError: boolean;
    isRefetching: boolean;
    isFetchingNextPage: boolean;
    hasNextPage?: boolean;
    refetch: () => void;
    fetchNextPage: () => void;
  };
}

export default function TransactionHistoryScreen({
  headerTitle,
  headerSubtitle,
  emptyText,
  query,
}: TransactionHistoryScreenProps) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { data, isLoading, isError, refetch, isRefetching, fetchNextPage, hasNextPage, isFetchingNextPage } = query;

  const transactions = useMemo(
    () => data?.pages.flatMap((page) => page?.transactions || []) || [],
    [data]
  );

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(
    ({ item }: { item: TransactionHistoryItem }) => (
      <TransactionRow item={item} theme={theme} locale={locale} t={t} />
    ),
    [theme, locale, t]
  );

  const keyExtractor = useCallback((item: TransactionHistoryItem) => item.id, []);

  const renderHeader = useCallback(() => (
    <View style={styles.header}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: wp(2) }}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back') || 'Retour'}
          style={{ padding: wp(1) }}
        >
          <ChevronLeft size={ms(26)} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>{headerTitle}</Text>
      </View>
      <Text style={[styles.headerSubtitle, { color: theme.textMuted, marginLeft: wp(8) }]}>
        {headerSubtitle}
      </Text>
    </View>
  ), [theme, t, router, headerTitle, headerSubtitle]);

  const renderEmpty = useCallback(() => {
    if (isLoading) {
      return (
        <View style={{ gap: hp(1.5) }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} width={wp(90)} height={hp(10)} style={{ borderRadius: ms(12), marginHorizontal: wp(5) }} />
          ))}
        </View>
      );
    }
    if (isError) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>
            {t('common.genericError') || 'Une erreur est survenue'}
          </Text>
          <TouchableOpacity
            onPress={refetch}
            style={{ marginTop: hp(1.5), paddingVertical: hp(1), paddingHorizontal: wp(5), borderRadius: ms(8), backgroundColor: theme.primary }}
            accessibilityRole="button"
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              {t('common.retry') || 'Réessayer'}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: theme.textMuted }]}>{emptyText}</Text>
      </View>
    );
  }, [isLoading, isError, theme, t, refetch, emptyText]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <FlatList
        data={transactions}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={{ paddingBottom: insets.bottom + hp(5) }}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        removeClippedSubviews={Platform.OS === 'android'}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={{ paddingVertical: hp(2) }}>
              <Skeleton width={wp(90)} height={hp(10)} style={{ borderRadius: ms(12), marginHorizontal: wp(5) }} />
            </View>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: wp(5), paddingBottom: hp(2) },
  headerTitle: { fontSize: FS.xl, fontWeight: 'bold' },
  headerSubtitle: { fontSize: FS.md, marginTop: hp(0.5) },
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: wp(4),
    marginHorizontal: wp(5),
    marginBottom: hp(1.5),
    borderRadius: ms(12),
    borderLeftWidth: 4,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 3 },
    }),
  },
  txIconBadge: { width: wp(10), height: wp(10), borderRadius: wp(5), justifyContent: 'center', alignItems: 'center', marginRight: wp(3) },
  txInfo: { flex: 1 },
  txType: { fontSize: FS.md, fontWeight: '600' },
  txDate: { fontSize: FS.sm, marginTop: hp(0.3) },
  txAmountContainer: { alignItems: 'flex-end' },
  txAmount: { fontSize: FS.lg, fontWeight: 'bold' },
  emptyContainer: { padding: wp(10), alignItems: 'center' },
  emptyText: { fontSize: FS.md },
});
