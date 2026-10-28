import { useCallback } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useAuthStore } from '@/stores/authStore';
import { useScratchCampaigns } from '@/hooks/useScratchHooks';
import { ms } from '@/utils/responsive';
import { resolveImageUrl } from '@/utils/imageUrl';
import PremiumLockCard from '@/components/PremiumLockCard';
import { Button, CampaignStatusPill, Notice, ScreenHeader } from '@/components/scratch/ScratchUI';
import { CampaignRow, GameEmptyState, HeaderAddButton, ListSeparator } from '@/components/games/GameList';
import { ScratchPreview, ScratchTile } from '@/components/scratch/ScratchPreview';
import { formatYmd } from '@/components/scratch/DateField';
import { moroccoYmdOf } from '@/components/scratch/campaignForm';
import type { ScratchCampaignListItem } from '@jitplus/shared/src/scratch';

export default function ScratchCampaignsScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const { isPremium } = usePlanStatus(merchant);
  const canManage = isPremium && !isTeamMember;

  const { data: campaigns = [], isLoading, isError, refetch, isRefetching } = useScratchCampaigns(!shouldWait);

  const openCampaign = useCallback(
    (id: string) => router.push({ pathname: '/scratch-campaigns/[id]', params: { id } }),
    [router],
  );

  const renderItem = useCallback(({ item }: { item: ScratchCampaignListItem }) => {
    const dateLine = item.status === 'SCHEDULED' && item.sendAt
      ? t('scratch.list.sendAt', { date: `${formatYmd(moroccoYmdOf(new Date(item.sendAt)), locale, false)}` })
      : item.sentAt
        ? t('scratch.list.sentAt', { date: formatYmd(moroccoYmdOf(new Date(item.sentAt)), locale, false) })
        : t('scratch.list.cardUntil', { date: formatYmd(item.cardExpiresOn, locale, false) });
    const lines = [{ text: dateLine }];
    if (item.recipientCount > 0) {
      lines.push({
        text: `${t('scratch.list.recipients', { count: item.recipientCount })} · ${t('scratch.list.scratched', { count: item.scratchedCount })} · ${t('scratch.list.redeemed', { count: item.redeemedCount })}`,
      });
    }
    return (
      <CampaignRow
        leading={<ScratchTile designId={item.designId} size={ms(52)} />}
        title={item.name}
        status={<CampaignStatusPill status={item.status} />}
        lines={lines}
        onPress={() => openCampaign(item.id)}
        accessibilityLabel={`${item.name}, ${t(`scratch.campaignStatus.${item.status}`)}`}
      />
    );
  }, [t, locale, openCampaign]);

  if (shouldWait) return null;

  const header = (
    <View style={styles.headerContent}>
      {!isPremium && campaigns.length === 0 && (
        <PremiumLockCard titleKey="scratch.list.premiumTitle" descriptionKey="scratch.list.premiumDesc" />
      )}
      {!isPremium && campaigns.length > 0 && <Notice tone="warning" text={t('scratch.list.readOnly')} />}
      {isPremium && isTeamMember && <Notice text={t('scratch.list.ownerOnly')} />}
      {!isPremium && (
        <Button label={t('messages.discoverPremium')} onPress={() => router.push('/plan')} />
      )}

      {campaigns.length === 0 && isPremium && !isLoading && (
        <GameEmptyState
          visual={
            <ScratchPreview
              width={Math.min(width - 116, 300)}
              merchantName={merchant?.nom ?? ''}
              logoUrl={merchant?.logoUrl ? resolveImageUrl(merchant.logoUrl) : null}
              side="before"
            />
          }
          title={t('scratch.list.emptyTitle')}
          text={t('scratch.list.intro')}
          steps={[t('scratch.list.how1'), t('scratch.list.how2'), t('scratch.list.how3')]}
          action={canManage ? (
            <Button icon={Plus} label={t('scratch.list.create')} onPress={() => router.push('/scratch-campaigns/create')} style={styles.stretch} />
          ) : undefined}
        />
      )}
      {isError && <Notice tone="danger" text={t('scratch.list.loadError')} />}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader
        title={t('scratch.list.title')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/games'))}
        right={canManage && campaigns.length > 0 ? (
          <HeaderAddButton label={t('scratch.list.create')} onPress={() => router.push('/scratch-campaigns/create')} />
        ) : undefined}
      />
      {isLoading ? (
        <View style={styles.loader}><ActivityIndicator color={theme.primary} /></View>
      ) : (
        <FlatList
          data={campaigns}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          ItemSeparatorComponent={ListSeparator}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={theme.primary} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  headerContent: { gap: 14, marginBottom: 14 },
  stretch: { alignSelf: 'stretch' },
});
