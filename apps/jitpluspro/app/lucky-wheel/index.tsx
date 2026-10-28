import { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildWheelSegments } from '@jitplus/shared/src/luckyWheel';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import { useLuckyWheelCampaigns, useLuckyWheelFulfilledPrizes, useLuckyWheelPendingPrizes } from '@/hooks/useQueryHooks';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import PremiumLockCard from '@/components/PremiumLockCard';
import { Button, MoreOptions, Notice, ScreenHeader, Section } from '@/components/scratch/ScratchUI';
import { moroccoToday } from '@/components/scratch/campaignForm';
import { CampaignRow, GameEmptyState, HeaderAddButton, ListSeparator, type CampaignLine } from '@/components/games/GameList';
import { WheelStage, WheelTile } from '@/components/luckyWheel/WheelStage';
import { GameStage } from '@/components/games/GameStage';
import { WheelStatusPill, formatWheelPeriod } from '@/components/luckyWheel/WheelUI';
import { FulfilledPrizeList, PendingPrizeList } from '@/components/luckyWheel/PendingPrizes';
import { initialWheelForm, liveState, previewSegments } from '@/components/luckyWheel/wheelForm';
import type { WheelCampaign } from '@/components/luckyWheel/types';
import { WHEEL_TONE } from '@/components/luckyWheel/colors';

/** Wheels list row; memoised so its small wheel is not redrawn on every list render. */
const WheelCampaignRow = memo(function WheelCampaignRow({ campaign, onOpen }: {
  campaign: WheelCampaign;
  onOpen: (id: string) => void;
}) {
  const { t, locale } = useLanguage();
  const prizes = useMemo(() => campaign.prizes ?? [], [campaign.prizes]);
  const segments = useMemo(() => buildWheelSegments(prizes, campaign.globalWinRate, ''), [prizes, campaign.globalWinRate]);
  const remaining = prizes.reduce((s, p) => s + Math.max(0, p.remaining), 0);
  const total = prizes.reduce((s, p) => s + p.totalStock, 0);
  const live = liveState(campaign);
  const lines: CampaignLine[] = [
    { text: formatWheelPeriod(campaign, locale) },
    {
      text: `${t('luckyWheel.list.spins', { count: campaign._count?.tickets ?? 0 })} · ${t('luckyWheel.list.stock', { remaining, total })}`,
      tone: 'secondary',
    },
  ];
  if (live && live !== 'running') lines.push({ text: t(`luckyWheel.live.${live}`), color: WHEEL_TONE.warning });
  return (
    <CampaignRow
      leading={<WheelTile size={ms(52)} segments={segments} />}
      title={campaign.name}
      status={<WheelStatusPill status={campaign.status} />}
      lines={lines}
      onPress={() => onOpen(campaign.id)}
      accessibilityLabel={`${campaign.name}, ${t(`luckyWheel.status.${campaign.status}`)}`}
    />
  );
});

export default function LuckyWheelListScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const { textAlign } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const { isPremium } = usePlanStatus(merchant);
  const canManage = isPremium && !isTeamMember;
  const enabled = !shouldWait && isPremium;

  const campaignsQuery = useLuckyWheelCampaigns(enabled);
  const pendingQuery = useLuckyWheelPendingPrizes(enabled);
  const fulfilledQuery = useLuckyWheelFulfilledPrizes(enabled);
  const campaigns = useMemo(() => campaignsQuery.data ?? [], [campaignsQuery.data]);
  const pending = pendingQuery.data ?? [];
  const fulfilled = fulfilledQuery.data ?? [];
  const [showHistory, setShowHistory] = useState(false);

  const demoSegments = useMemo(
    () => previewSegments(
      initialWheelForm(moroccoToday(), '', (k) => t(`luckyWheel.samplePrize.${k}`)),
      t('luckyWheel.preview.lostSlice'),
      (i) => t('luckyWheel.prize.title', { n: i + 1 }),
    ),
    [t],
  );

  const onRefresh = useCallback(() => {
    campaignsQuery.refetch();
    pendingQuery.refetch();
    fulfilledQuery.refetch();
  }, [campaignsQuery, pendingQuery, fulfilledQuery]);

  const openCampaign = useCallback(
    (id: string) => router.push({ pathname: '/lucky-wheel/[id]', params: { id } }),
    [router],
  );
  const create = useCallback(() => router.push('/lucky-wheel/create'), [router]);

  const renderItem = useCallback(
    ({ item }: { item: WheelCampaign }) => <WheelCampaignRow campaign={item} onOpen={openCampaign} />,
    [openCampaign],
  );

  if (shouldWait) return null;

  const loading = enabled && campaignsQuery.isLoading;

  const header = (
    <View style={styles.headerContent}>
      {!isPremium && (
        <>
          <PremiumLockCard titleKey="luckyWheel.list.premiumTitle" descriptionKey="luckyWheel.list.premiumDesc" />
          <Button label={t('messages.discoverPremium')} onPress={() => router.push('/plan')} />
        </>
      )}
      {isPremium && isTeamMember && <Notice text={t('luckyWheel.list.ownerOnly')} />}
      {campaignsQuery.isError && <Notice tone="danger" text={t('luckyWheel.list.loadError')} />}

      {pending.length > 0 && (
        <Section title={t('luckyWheel.pending.title', { count: pending.length })}>
          <Text style={[styles.hint, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
            {t('luckyWheel.pending.hint')}
          </Text>
          <PendingPrizeList draws={pending} showCampaign={campaigns.length > 1} />
        </Section>
      )}

      {isPremium && campaigns.length === 0 && !loading && !campaignsQuery.isError && (
        <GameEmptyState
          visual={<GameStage><WheelStage size={ms(150)} segments={demoSegments} /></GameStage>}
          title={t('luckyWheel.list.emptyTitle')}
          text={t('luckyWheel.list.intro')}
          steps={[t('luckyWheel.list.how1'), t('luckyWheel.list.how2'), t('luckyWheel.list.how3')]}
          action={canManage ? <Button icon={Plus} label={t('luckyWheel.list.create')} onPress={create} style={styles.stretch} /> : undefined}
        />
      )}

      {campaigns.length > 0 && (
        <Text style={[styles.blockTitle, { color: theme.text, textAlign }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
          {t('luckyWheel.list.campaigns')}
        </Text>
      )}
    </View>
  );

  const footer = fulfilled.length > 0 ? (
    <View style={styles.footer}>
      <Section>
        <MoreOptions
          open={showHistory}
          onToggle={() => setShowHistory((v) => !v)}
          label={t('luckyWheel.pending.history', { count: fulfilled.length })}
        >
          <FulfilledPrizeList draws={fulfilled} />
        </MoreOptions>
      </Section>
    </View>
  ) : null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader
        title={t('luckyWheel.list.title')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/games'))}
        right={canManage && campaigns.length > 0 ? <HeaderAddButton label={t('luckyWheel.list.create')} onPress={create} /> : undefined}
      />
      {loading ? (
        <View style={styles.loader}><ActivityIndicator color={theme.primary} /></View>
      ) : (
        <FlatList
          data={campaigns}
          keyExtractor={(c) => c.id}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          ItemSeparatorComponent={ListSeparator}
          refreshControl={enabled ? (
            <RefreshControl refreshing={campaignsQuery.isRefetching} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
          ) : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingTop: 4 },
  headerContent: { gap: 14, marginBottom: 10 },
  footer: { marginTop: 14 },
  stretch: { alignSelf: 'stretch' },
  blockTitle: { fontSize: ms(16), fontFamily: font.semibold, marginTop: 4 },
  hint: { fontSize: ms(13), lineHeight: ms(19), fontFamily: font.regular },
});
