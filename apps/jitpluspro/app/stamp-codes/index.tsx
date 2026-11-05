import React, { useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { Package, Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { pluralKey } from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import { useStampCodeBatches, useStampCodeQuota, type StampCodeBatchSummary } from '@/hooks/queries/stampCodes';
import { getIntlLocale } from '@/config/currency';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { Button, Notice, ScreenHeader, StatusPill } from '@/components/scratch/ScratchUI';
import { CampaignRow, GameEmptyState, HeaderAddButton, ListSeparator } from '@/components/games/GameList';

/** E-commerce parcel QR codes: batches the merchant prints and slips into parcels. */
export default function StampCodesScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const { textAlign } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const canManage = !isTeamMember;

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
    ({ item }: { item: StampCodeBatchSummary }) => <BatchRow batch={item} onOpen={open} />,
    [open],
  );

  if (shouldWait) return null;

  const empty = batches.length === 0 && !isLoading;
  const quotaText = quota.data
    ? quota.data.limit == null
      ? t('stampCodes.list.quotaPremium')
      : t('stampCodes.list.quotaFree', { used: quota.data.used, limit: quota.data.limit })
    : null;

  const header = (
    <View style={styles.headerContent}>
      {isTeamMember && <Notice text={t('stampCodes.list.ownerOnly')} />}
      {isError && <Notice tone="danger" text={t('stampCodes.list.loadError')} />}

      {empty && !isError ? (
        <GameEmptyState
          visual={
            <View style={[styles.visual, { backgroundColor: `${theme.primary}14` }]}>
              <Package size={ms(48)} color={theme.primary} strokeWidth={icon.stroke} />
            </View>
          }
          title={t('stampCodes.list.emptyTitle')}
          text={t('stampCodes.list.intro')}
          steps={[t('stampCodes.list.how1'), t('stampCodes.list.how2'), t('stampCodes.list.how3')]}
          action={canManage ? (
            <Button icon={Plus} label={t('stampCodes.list.create')} onPress={create} disabled={quotaReached} style={styles.stretch} />
          ) : undefined}
        />
      ) : null}

      {quotaText && (
        <Text style={[styles.quota, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.3}>
          {quotaText}
        </Text>
      )}
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
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        right={canManage && !empty ? (
          <View style={quotaReached ? styles.dimmed : undefined}>
            <HeaderAddButton label={t('stampCodes.list.create')} onPress={quotaReached ? goPlan : create} />
          </View>
        ) : undefined}
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
          refreshControl={<RefreshControl refreshing={isRefetching && !isFetchingNextPage} onRefresh={onRefresh} tintColor={theme.primary} />}
        />
      )}
    </View>
  );
}

const BatchRow = React.memo(function BatchRow({ batch, onOpen }: {
  batch: StampCodeBatchSummary;
  onOpen: (batchId: string) => void;
}) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const status = batch.active > 0 ? 'active' : batch.redeemed > 0 ? 'done' : 'revoked';
  const color = status === 'active' ? theme.success : status === 'done' ? theme.primary : theme.textMuted;
  const date = new Date(batch.createdAt).toLocaleDateString(getIntlLocale(locale), { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <CampaignRow
      leading={
        <View style={[styles.rowIcon, { backgroundColor: `${theme.primary}14` }]}>
          <Package size={ms(24)} color={theme.primary} strokeWidth={icon.stroke} />
        </View>
      }
      title={batch.label}
      status={<StatusPill label={t(`stampCodes.list.status.${status}`)} color={color} />}
      lines={[
        { text: t('stampCodes.list.progress', { redeemed: batch.redeemed, total: batch.total }), tone: 'secondary' },
        { text: t(pluralKey('stampCodes.list.stampsEach', batch.stamps, locale), { count: batch.stamps }) },
        { text: t('stampCodes.list.createdOn', { date }) },
      ]}
      onPress={() => onOpen(batch.batchId)}
      accessibilityLabel={`${batch.label}, ${t(`stampCodes.list.status.${status}`)}`}
    />
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  headerContent: { gap: 12, marginBottom: 14 },
  stretch: { alignSelf: 'stretch' },
  dimmed: { opacity: 0.45 },
  quota: { fontSize: ms(13), fontFamily: font.medium, paddingHorizontal: 2 },
  quotaBox: { gap: 10 },
  visual: { width: ms(96), height: ms(96), borderRadius: ms(28), alignItems: 'center', justifyContent: 'center' },
  footer: { marginTop: 16 },
  rowIcon: { width: ms(52), height: ms(52), borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
