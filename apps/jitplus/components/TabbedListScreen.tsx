import { useCallback, type ReactElement } from 'react';
import { FlatList, RefreshControl, StyleSheet, TouchableOpacity, View, type ListRenderItem } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import RetryState from '@/components/RetryState';
import Skeleton from '@/components/Skeleton';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { hp, ms, wp } from '@/utils/responsive';
import { DIR_FLIP } from '@/utils/rtl';

/**
 * A full-screen list split in segmented tabs (my bookings, my coupons…):
 * header with back, tabs, skeleton while loading, error with retry,
 * pull-to-refresh and an empty state. Screens only provide the rows.
 */

interface ListQuery {
  isLoading: boolean;
  isError: boolean;
  isRefetching: boolean;
  refetch: () => unknown;
}

interface Props<T, K extends string> {
  title: string;
  tabs: readonly { key: K; labelKey: string }[];
  tab: K;
  onTabChange: (key: K) => void;
  query: ListQuery;
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: ListRenderItem<T>;
  errorText: string;
  emptyIcon: LucideIcon;
  emptyText: string;
  emptyHint?: string | null;
}

export default function TabbedListScreen<T, K extends string>({
  title, tabs, tab, onTabChange, query, data, keyExtractor, renderItem,
  errorText, emptyIcon: EmptyIcon, emptyText, emptyHint,
}: Props<T, K>): ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t } = useLanguage();

  // Opened from a notification or a link, there is no screen to go back to.
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top + hp(8) }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <ArrowLeft size={ms(24)} color={theme.text} style={DIR_FLIP} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} accessibilityRole="header">{title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={[styles.tabs, { backgroundColor: theme.bgCard }]}>
        {tabs.map((tb) => {
          const active = tab === tb.key;
          return (
            <TouchableOpacity
              key={tb.key}
              style={[styles.tab, active && { backgroundColor: palette.violet }]}
              onPress={() => onTabChange(tb.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, { color: active ? '#fff' : theme.textMuted }]}>{t(tb.labelKey)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {query.isLoading ? (
        <View style={styles.listContent}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={[styles.skeletonCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
              <Skeleton width={ms(44)} height={ms(44)} borderRadius={ms(12)} />
              <View style={styles.skeletonText}>
                <Skeleton width={wp(140)} height={hp(15)} borderRadius={6} />
                <Skeleton width={wp(90)} height={hp(11)} borderRadius={4} />
              </View>
            </View>
          ))}
        </View>
      ) : query.isError ? (
        <RetryState message={errorText} onRetry={() => { void query.refetch(); }} style={styles.emptyWrap} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, data.length === 0 && styles.emptyListContent]}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => query.refetch()} tintColor={theme.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIcon, { backgroundColor: `${palette.violet}12` }]}>
                <EmptyIcon size={ms(36)} color={palette.violet} strokeWidth={1.5} />
              </View>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{emptyText}</Text>
              {emptyHint ? <Text style={[styles.emptyHint, { color: theme.textMuted }]}>{emptyHint}</Text> : null}
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: wp(20) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: hp(14) },
  headerTitle: { fontSize: ms(19), fontWeight: '600' },
  headerSpacer: { width: ms(24) },
  tabs: { flexDirection: 'row', borderRadius: 12, padding: 4, marginBottom: hp(12) },
  tab: { flex: 1, alignItems: 'center', paddingVertical: hp(8), borderRadius: 9 },
  tabText: { fontSize: ms(13), fontWeight: '600' },
  listContent: { paddingBottom: hp(24), gap: hp(10) },
  emptyListContent: { flexGrow: 1, justifyContent: 'center' },
  skeletonCard: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: wp(14) },
  skeletonText: { flex: 1, marginLeft: wp(12), gap: hp(6) },
  emptyWrap: { alignItems: 'center', gap: hp(10), paddingTop: hp(40) },
  emptyIcon: { width: ms(72), height: ms(72), borderRadius: ms(22), alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: ms(15), fontWeight: '600', textAlign: 'center' },
  emptyHint: { fontSize: ms(13), textAlign: 'center', paddingHorizontal: wp(30) },
});
