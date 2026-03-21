import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { ArrowLeft, Gift } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTheme, brandGradient } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { usePendingGifts } from '@/hooks/useQueryHooks';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { formatDateTime } from '@/utils/date';
import type { PendingGift } from '@/types';

const GiftRow = React.memo(function GiftRow({
  item,
  theme,
  t,
  locale,
}: {
  item: PendingGift;
  theme: ReturnType<typeof useTheme>;
  t: (key: string, params?: Record<string, unknown>) => string;
  locale: string;
}) {
  const clientName = [item.client?.prenom, item.client?.nom].filter(Boolean).join(' ') || '?';

  return (
    <View style={[styles.row, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
      <View style={[styles.iconWrap, { backgroundColor: theme.primaryBg }]}>
        <Gift size={18} color={theme.primary} strokeWidth={1.5} />
      </View>
      <View style={styles.info}>
        <Text style={[styles.clientName, { color: theme.text }]}>{clientName}</Text>
        <Text style={[styles.rewardName, { color: theme.primary }]}>
          🎁 {item.reward?.titre ?? t('gift.unknownReward')}
        </Text>
        <Text style={[styles.date, { color: theme.textMuted }]}>{formatDateTime(item.createdAt, locale)}</Text>
      </View>
    </View>
  );
});

export default function PendingGiftsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const insets = useSafeAreaInsets();
  const { data: gifts = [], isRefetching: refreshing, refetch } = usePendingGifts();

  const renderItem = useCallback(({ item }: { item: PendingGift }) => (
    <GiftRow item={item} theme={theme} t={t} locale={locale} />
  ), [theme, t, locale]);

  const keyExtractor = useCallback((item: PendingGift) => item.id, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <LinearGradient
        colors={[...brandGradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 12 }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{t('gift.pendingGiftsTitle')}</Text>
          <Text style={styles.headerSub}>
            {t('gift.pendingGiftsSubtitle', { count: gifts.length })}
          </Text>
        </View>
      </LinearGradient>

      <FlatList
        data={gifts}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refetch} colors={[theme.primary]} tintColor={theme.primary} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Gift size={48} color={theme.textMuted} strokeWidth={1} />
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t('gift.noPending')}</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 20,
    paddingHorizontal: 20,
    gap: 12,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_700Bold' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,.7)', marginTop: 2, fontFamily: 'Lexend_500Medium' },
  list: { padding: 16, gap: 10, paddingBottom: 100 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  iconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1 },
  clientName: { fontSize: 14, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  rewardName: { fontSize: 12, fontWeight: '500', marginTop: 2, fontFamily: 'Inter_500Medium' },
  date: { fontSize: 11, marginTop: 2, fontFamily: 'Inter_400Regular' },
  fulfillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  fulfillBtnText: { fontSize: 11, fontWeight: '600', color: '#fff', fontFamily: 'Inter_600SemiBold' },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: 'Lexend_500Medium' },
});
