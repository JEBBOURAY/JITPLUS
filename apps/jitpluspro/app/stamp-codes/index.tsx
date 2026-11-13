import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, TouchableOpacity } from 'react-native';
import { ChevronRight, Plus } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pluralKey } from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import { getPlanStatus } from '@/utils/plan';
import { useStampCodeBatches, useStampCodeQuota, type StampCodeBatchSummary } from '@/hooks/queries/stampCodes';
import { getIntlLocale } from '@/config/currency';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { Button, Notice, ScreenHeader, StatusPill } from '@/components/scratch/ScratchUI';
import { GameEmptyState, HeaderAddButton, ListSeparator } from '@/components/games/GameList';
import { DemoHeaderActions } from '@/components/demo/DemoVideoButton';
import { ProgressBar, SummaryCard } from '@/components/ui/SummaryCard';

// Same artwork as the "QR livraison" card of Accueil.
const PARCEL_IMAGE = require('@/assets/images/tools/qr_colis.png');

/** E-commerce parcel QR codes: batches the merchant prints and slips into parcels. */
export default function StampCodesScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const canManage = !isTeamMember;
  const hidePlan = useAuthStore((s) => getPlanStatus(s.merchant).hidePlan);

  const quota = useStampCodeQuota(!shouldWait);
  const refetchQuota = quota.refetch;
  const {
    data, isLoading, isError, refetch, isRefetching, hasNextPage, isFetchingNextPage, fetchNextPage,
  } = useStampCodeBatches(!shouldWait);
  const batches = useMemo(() => data?.pages.flat() ?? [], [data]);
  const quotaReached = quota.data?.remaining === 0;

  const open = useCallback(
    (batchId: string) => router.push({ pathname: '/stamp-codes/[id]', params: { id: batchId } }),
    [router],
  );
  const create = useCallback(() => router.push('/stamp-codes/create'), [router]);
  const goPlan = useCallback(() => router.push('/plan'), [router]);
  const onRefresh = useCallback(() => { refetch(); refetchQuota(); }, [refetch, refetchQuota]);
  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(
    ({ item }: { item: StampCodeBatchSummary }) => <BatchCard batch={item} onOpen={open} />,
    [open],
  );

  if (shouldWait) return null;

  const empty = batches.length === 0 && !isLoading;
  const header = (
    <View style={styles.headerContent}>
      {isTeamMember && <Notice text={t('stampCodes.list.ownerOnly')} />}
      {isError && <Notice tone="danger" text={t('stampCodes.list.loadError')} />}

      {empty && !isError ? (
        <GameEmptyState
          visual={<Image source={PARCEL_IMAGE} style={styles.emptyImage} contentFit="contain" accessible={false} />}
          title={t('stampCodes.list.emptyTitle')}
          text={t('stampCodes.list.intro')}
          steps={[t('stampCodes.list.how1'), t('stampCodes.list.how2'), t('stampCodes.list.how3')]}
          action={canManage ? (
            <Button icon={Plus} label={t('stampCodes.list.create')} onPress={create} disabled={quotaReached} style={styles.stretch} />
          ) : undefined}
        />
      ) : null}

      {quota.data && !empty ? (
        <SummaryCard
          label={t('stampCodes.list.quotaLabel')}
          value={quota.data.used}
          max={quota.data.limit}
          progress={quota.data.limit == null ? undefined : quota.data.limit > 0 ? quota.data.used / quota.data.limit : 1}
          hint={quota.data.limit == null && !hidePlan ? t('stampCodes.list.quotaPremium') : undefined}
        />
      ) : null}
      {canManage && quotaReached && quota.data?.limit != null && (
        <View style={styles.quotaBox}>
          <Notice tone="warning" text={t('stampCodes.list.quotaReached', { limit: quota.data.limit })} />
          <Button variant="secondary" label={t('stampCodes.list.upgrade')} onPress={goPlan} />
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader
        title={t('stampCodes.title')}
        right={(
          <DemoHeaderActions id="qrcolis">
            {canManage && !empty ? (
              <View style={quotaReached ? styles.dimmed : undefined}>
                <HeaderAddButton label={t('stampCodes.list.create')} onPress={quotaReached ? goPlan : create} />
              </View>
            ) : null}
          </DemoHeaderActions>
        )}
      />
      {isLoading ? (
        <View style={styles.loader}><ActivityIndicator color={theme.primary} /></View>
      ) : (
        <FlatList
          data={batches}
          keyExtractor={(b) => b.batchId}
          renderItem={renderItem}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          ItemSeparatorComponent={ListSeparator}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={theme.primary} style={styles.footer} /> : null}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching && !isFetchingNextPage} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
        />
      )}
    </View>
  );
}

/** One batch: name and status, how many codes were used, then its value and date. */
const BatchCard = React.memo(function BatchCard({ batch, onOpen }: {
  batch: StampCodeBatchSummary;
  onOpen: (batchId: string) => void;
}) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { row, textAlign, flip, isRTL } = useDir();
  const status = batch.active > 0 ? 'active' : batch.redeemed > 0 ? 'done' : 'revoked';
  const color = status === 'active' ? theme.success : status === 'done' ? theme.primary : theme.textMuted;
  const statusLabel = t(`stampCodes.list.status.${status}`);
  const date = new Date(batch.createdAt).toLocaleDateString(getIntlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric' });
  const progress = t('stampCodes.list.progress', { redeemed: batch.redeemed, total: batch.total });
  const stampsEach = t(pluralKey('stampCodes.list.stampsEach', batch.stamps, locale), { count: batch.stamps });
  const createdOn = t('stampCodes.list.createdOn', { date });

  return (
    <TouchableOpacity
      onPress={() => onOpen(batch.batchId)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={[batch.label, statusLabel, progress, stampsEach, createdOn].join(', ')}
      style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
    >
      <View style={[styles.cardTop, { flexDirection: row }]}>
        <Text style={[styles.cardTitle, { color: theme.text, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {batch.label}
        </Text>
        <StatusPill label={statusLabel} color={color} />
        <ChevronRight size={18} color={theme.textMuted} strokeWidth={icon.stroke} style={flip} />
      </View>
      <ProgressBar ratio={batch.total > 0 ? batch.redeemed / batch.total : 0} />
      <View style={[styles.cardFooter, { flexDirection: row }]}>
        <Text style={[styles.cardFigure, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{progress}</Text>
        <Text
          style={[styles.cardMeta, { color: theme.textMuted, textAlign: isRTL ? 'left' : 'right' }]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {stampsEach} · {createdOn}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  headerContent: { gap: 12, marginBottom: 14 },
  stretch: { alignSelf: 'stretch' },
  dimmed: { opacity: 0.45 },
  quotaBox: { gap: 10 },
  emptyImage: { width: 104, height: 104 },
  footer: { marginTop: 16 },

  // Same card as the Accueil tools and the Bons plans list.
  card: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 12 },
  cardTop: { alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 16, fontFamily: font.semibold, letterSpacing: -0.2 },
  cardFooter: { alignItems: 'center', gap: 12 },
  cardFigure: { fontSize: ms(13), fontFamily: font.semibold },
  cardMeta: { flex: 1, fontSize: ms(12), fontFamily: font.regular },
});
