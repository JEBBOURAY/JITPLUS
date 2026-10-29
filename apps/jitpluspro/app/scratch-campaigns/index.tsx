import { memo, useCallback } from 'react';
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
import { CampaignRow, GameEmptyState, HeaderAddButton, ListSeparator, type CampaignLine } from '@/components/games/GameList';
import { ScratchPreview, ScratchTile } from '@/components/scratch/ScratchPreview';
import { formatYmd } from '@/components/scratch/DateField';
import { moroccoYmdOf } from '@/components/scratch/campaignForm';
import type { ScratchCampaignListItem } from '@jitplus/shared/src/scratch';

const NO_CAMPAIGNS: ScratchCampaignListItem[] = [];

/** Campaigns list row; memoised so the rows are not rebuilt on every list render. */
const ScratchCampaignRow = memo(function ScratchCampaignRow({ campaign, onOpen }: {
  campaign: ScratchCampaignListItem;
  onOpen: (id: string) => void;
}) {
  const { t, locale } = useLanguage();
  const dateLine = campaign.status === 'SCHEDULED' && campaign.sendAt
    ? t('scratch.list.sendAt', { date: formatYmd(moroccoYmdOf(new Date(campaign.sendAt)), locale, false) })
    : campaign.sentAt
      ? t('scratch.list.sentAt', { date: formatYmd(moroccoYmdOf(new Date(campaign.sentAt)), locale, false) })
      : t('scratch.list.cardUntil', { date: formatYmd(campaign.cardExpiresOn, locale, false) });
  const lines: CampaignLine[] = [{ text: dateLine }];
  if (campaign.recipientCount > 0) {
    lines.push({
      text: `${t('scratch.list.recipients', { count: campaign.recipientCount })} · ${t('scratch.list.scratched', { count: campaign.scratchedCount })} · ${t('scratch.list.redeemed', { count: campaign.redeemedCount })}`,
    });
  }
  return (
    <CampaignRow
      leading={<ScratchTile designId={campaign.designId} size={ms(52)} />}
      title={campaign.name}
      status={<CampaignStatusPill status={campaign.status} />}
      lines={lines}
      onPress={() => onOpen(campaign.id)}
      accessibilityLabel={`${campaign.name}, ${t(`scratch.campaignStatus.${campaign.status}`)}`}
    />
  );
});

export default function ScratchCampaignsScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const { isPremium } = usePlanStatus(merchant);
  const canManage = isPremium && !isTeamMember;

  const { data: campaigns = NO_CAMPAIGNS, isLoading, isError, refetch, isRefetching } = useScratchCampaigns(!shouldWait);

  const openCampaign = useCallback(
    (id: string) => router.push({ pathname: '/scratch-campaigns/[id]', params: { id } }),
    [router],
  );

  const create = useCallback(() => router.push('/scratch-campaigns/create'), [router]);

  const renderItem = useCallback(
    ({ item }: { item: ScratchCampaignListItem }) => <ScratchCampaignRow campaign={item} onOpen={openCampaign} />,
    [openCampaign],
  );

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
            <Button icon={Plus} label={t('scratch.list.create')} onPress={create} style={styles.stretch} />
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
          <HeaderAddButton label={t('scratch.list.create')} onPress={create} />
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
