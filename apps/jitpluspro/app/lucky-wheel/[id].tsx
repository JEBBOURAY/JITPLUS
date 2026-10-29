import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import { Copy, Edit3, Pause, Play, Square, Trash2 } from 'lucide-react-native';
import { JitBell } from '@/components/icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildWheelSegments, computeOddsBreakdown, prizeColor } from '@jitplus/shared/src/luckyWheel';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import {
  useDeleteLuckyWheelCampaign,
  useLuckyWheelCampaigns,
  useLuckyWheelFulfilledPrizes,
  useLuckyWheelPendingPrizes,
  useUpdateLuckyWheelStatus,
} from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import { Button, MoreOptions, Notice, ScreenHeader, Section } from '@/components/scratch/ScratchUI';
import { WheelPreview } from '@/components/luckyWheel/WheelPreview';
import { WheelStatusPill, formatWheelPeriod } from '@/components/luckyWheel/WheelUI';
import { FulfilledPrizeList, PendingPrizeList } from '@/components/luckyWheel/PendingPrizes';
import { claimLabel } from '@/components/luckyWheel/PrizeEditor';
import { formatWheelMoney, useWheelPush } from '@/components/luckyWheel/useWheelPush';
import { availableActions, liveState, pickWeighted } from '@/components/luckyWheel/wheelForm';
import type { WheelCampaign, WheelStatus } from '@/components/luckyWheel/types';

export default function LuckyWheelDetail() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { row, textAlign, alignStart } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const { isPremium } = usePlanStatus(merchant);
  const canManage = isPremium && !isTeamMember;
  const enabled = !shouldWait && isPremium;

  const campaignsQuery = useLuckyWheelCampaigns(enabled);
  const pendingQuery = useLuckyWheelPendingPrizes(enabled);
  const fulfilledQuery = useLuckyWheelFulfilledPrizes(enabled);
  const campaign = campaignsQuery.data?.find((c) => c.id === id);
  const pending = useMemo(() => (pendingQuery.data ?? []).filter((d) => d.ticket?.campaign?.id === id), [pendingQuery.data, id]);
  const fulfilled = useMemo(() => (fulfilledQuery.data ?? []).filter((d) => d.ticket?.campaign?.id === id), [fulfilledQuery.data, id]);
  const [showHistory, setShowHistory] = useState(false);

  const statusMutation = useUpdateLuckyWheelStatus();
  const deleteMutation = useDeleteLuckyWheelCampaign();
  const push = useWheelPush();

  // Only prizes still in stock can come out: the chances shown follow the live draw.
  const prizes = useMemo(() => campaign?.prizes ?? [], [campaign?.prizes]);
  const inStock = useMemo(() => prizes.filter((p) => p.remaining > 0), [prizes]);
  const lostLabel = t('luckyWheel.preview.lostSlice');
  const segments = useMemo(
    () => buildWheelSegments(inStock.length ? inStock : prizes, campaign?.globalWinRate ?? 0, lostLabel),
    [inStock, prizes, campaign?.globalWinRate, lostLabel],
  );
  const odds = useMemo(
    () => computeOddsBreakdown(inStock.map((p) => ({ label: p.label, weight: p.weight })), campaign?.globalWinRate ?? 0),
    [inStock, campaign?.globalWinRate],
  );
  const winProbability = campaign?.globalWinRate ?? 0;
  const drawResult = useCallback(() => {
    if (!inStock.length || Math.random() >= winProbability) return null;
    return inStock[pickWeighted(inStock.map((p) => p.weight))].id;
  }, [inStock, winProbability]);

  // refetch functions are stable, unlike the query result objects.
  const { refetch: refetchCampaigns } = campaignsQuery;
  const { refetch: refetchPending } = pendingQuery;
  const { refetch: refetchFulfilled } = fulfilledQuery;
  const onRefresh = useCallback(() => {
    refetchCampaigns();
    refetchPending();
    refetchFulfilled();
  }, [refetchCampaigns, refetchPending, refetchFulfilled]);

  const fail = useCallback((e: unknown) => Alert.alert(t('common.error'), getErrorMessage(e, t('common.genericError'))), [t]);

  const changeStatus = useCallback(async (c: WheelCampaign, status: Exclude<WheelStatus, 'DRAFT'>) => {
    try {
      await statusMutation.mutateAsync({ id: c.id, status });
      if (status === 'ACTIVE' && c.status === 'DRAFT') {
        Alert.alert(t('luckyWheel.wizard.launchedTitle'), t('luckyWheel.wizard.launchedBody'), [
          { text: t('luckyWheel.wizard.later'), style: 'cancel' },
          { text: t('luckyWheel.wizard.notifyNow'), onPress: () => push.prompt(c) },
        ]);
      }
    } catch (e) { fail(e); }
  }, [statusMutation, push, t, fail]);

  const confirmEnd = useCallback((c: WheelCampaign) => {
    Alert.alert(t('luckyWheel.detail.endTitle'), t('luckyWheel.detail.endConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('luckyWheel.detail.end'), style: 'destructive', onPress: () => void changeStatus(c, 'ENDED') },
    ]);
  }, [changeStatus, t]);

  const confirmDelete = useCallback((c: WheelCampaign) => {
    Alert.alert(t('luckyWheel.detail.delete'), t('luckyWheel.detail.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMutation.mutateAsync(c.id);
            if (router.canGoBack()) router.back();
            else router.replace('/lucky-wheel');
          } catch (e) { fail(e); }
        },
      },
    ]);
  }, [deleteMutation, router, t, fail]);

  if (shouldWait) return null;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/lucky-wheel'));

  if (campaignsQuery.isLoading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  if (!campaign) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScreenHeader title={t('luckyWheel.list.title')} onBack={goBack} />
        <View style={styles.content}>
          <Notice tone="danger" text={campaignsQuery.isError ? t('luckyWheel.list.loadError') : t('luckyWheel.detail.notFound')} />
        </View>
      </View>
    );
  }

  const live = liveState(campaign);
  const actions = canManage ? availableActions(campaign.status) : [];
  const busy = statusMutation.isPending || deleteMutation.isPending;
  const winRate = Math.round(campaign.globalWinRate * 100);
  const spins = campaign._count?.tickets ?? 0;
  const won = prizes.reduce((s, p) => s + Math.max(0, p.totalStock - p.remaining), 0);
  const stockLeft = prizes.reduce((s, p) => s + Math.max(0, p.remaining), 0);
  const ticketRule = campaign.minSpendAmount > 0
    ? t('luckyWheel.wizard.ticketRuleMin', { amount: formatWheelMoney(campaign.minSpendAmount, locale) })
    : t('luckyWheel.wizard.ticketRuleAll');
  const openEditor = (params: { id: string } | { copyFrom: string }) => router.push({ pathname: '/lucky-wheel/create', params });

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={campaign.name} onBack={goBack} right={<WheelStatusPill status={campaign.status} />} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={campaignsQuery.isRefetching} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        {campaign.status === 'DRAFT' && <Notice text={t('luckyWheel.detail.draftNote')} />}
        {campaign.status === 'PAUSED' && <Notice tone="warning" text={t('luckyWheel.detail.pausedNote')} />}
        {live && live !== 'running' && <Notice tone="warning" text={t(`luckyWheel.live.${live}`)} />}

        <Section>
          <WheelPreview
            size={Math.min(width - 96, ms(260))}
            segments={segments}
            drawResult={inStock.length ? drawResult : undefined}
            description={campaign.description}
          />
          <View style={[styles.kpiRow, { flexDirection: row }]}>
            <Kpi label={t('luckyWheel.detail.spins')} value={String(spins)} />
            <Kpi label={t('luckyWheel.detail.won')} value={String(won)} />
            <Kpi label={t('luckyWheel.detail.toGive')} value={String(pending.length)} />
          </View>
          <InfoLine text={t('luckyWheel.detail.period', { period: formatWheelPeriod(campaign, locale) })} />
          <InfoLine text={t('luckyWheel.wizard.winRateValue', { pct: winRate })} />
          <InfoLine text={ticketRule} />
        </Section>

        {actions.length > 0 && (
          <View style={styles.actions}>
            {actions.includes('activate') && (
              <Button icon={Play} label={t('luckyWheel.detail.activate')} onPress={() => changeStatus(campaign, 'ACTIVE')} loading={statusMutation.isPending} />
            )}
            {actions.includes('resume') && (
              <Button icon={Play} label={t('luckyWheel.detail.resume')} onPress={() => changeStatus(campaign, 'ACTIVE')} loading={statusMutation.isPending} />
            )}
            {actions.includes('push') && (
              <Button icon={JitBell} label={t('luckyWheel.detail.push')} onPress={() => push.prompt(campaign)} loading={push.isPending} />
            )}
            {actions.includes('edit') && (
              <Button variant="secondary" icon={Edit3} label={t('luckyWheel.detail.edit')} onPress={() => openEditor({ id: campaign.id })} disabled={busy} />
            )}
            {actions.includes('pause') && (
              <Button variant="secondary" icon={Pause} label={t('luckyWheel.detail.pause')} onPress={() => changeStatus(campaign, 'PAUSED')} disabled={busy} />
            )}
            <Button variant="secondary" icon={Copy} label={t('luckyWheel.detail.duplicate')} onPress={() => openEditor({ copyFrom: campaign.id })} disabled={busy} />
            {actions.includes('end') && (
              <Button variant="danger" icon={Square} label={t('luckyWheel.detail.end')} onPress={() => confirmEnd(campaign)} disabled={busy} />
            )}
            {actions.includes('delete') && (
              <Button variant="ghost" icon={Trash2} label={t('luckyWheel.detail.delete')} onPress={() => confirmDelete(campaign)} loading={deleteMutation.isPending} />
            )}
          </View>
        )}

        <Section title={t('luckyWheel.detail.prizes', { count: stockLeft })}>
          {prizes.map((p, i) => {
            const index = inStock.indexOf(p);
            const used = p.totalStock > 0 ? Math.min(1, (p.totalStock - p.remaining) / p.totalStock) : 1;
            return (
              <View key={p.id} style={[styles.prizeRow, { borderBottomColor: theme.borderLight }]}>
                <View style={[styles.prizeTop, { flexDirection: row }]}>
                  <View style={[styles.dot, { backgroundColor: prizeColor(index >= 0 ? index : i) }]} />
                  <Text style={[styles.prizeLabel, { color: theme.text, textAlign }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
                    {p.label}
                  </Text>
                  <Text style={[styles.prizeChance, { color: index >= 0 ? theme.primary : theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                    {index >= 0 ? t('luckyWheel.prize.chance', { pct: odds.perPrize[index] ?? 0 }) : t('luckyWheel.detail.soldOut')}
                  </Text>
                </View>
                <View style={[styles.track, { alignItems: alignStart, backgroundColor: theme.bgInput }]}>
                  <View style={[styles.fill, { backgroundColor: theme.primary, width: `${Math.round(used * 100)}%` }]} />
                </View>
                <Text style={[styles.prizeMeta, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
                  {t('luckyWheel.detail.prizeStock', { remaining: p.remaining, total: p.totalStock })}
                  {' · '}
                  {claimLabel(p.claimWindowHours ? String(p.claimWindowHours) : '', t)}
                </Text>
              </View>
            );
          })}
        </Section>

        {pending.length > 0 && (
          <Section title={t('luckyWheel.pending.title', { count: pending.length })}>
            <Text style={[styles.hint, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
              {t('luckyWheel.pending.hint')}
            </Text>
            <PendingPrizeList draws={pending} />
          </Section>
        )}

        {fulfilled.length > 0 && (
          <Section>
            <MoreOptions
              open={showHistory}
              onToggle={() => setShowHistory((v) => !v)}
              label={t('luckyWheel.pending.history', { count: fulfilled.length })}
            >
              <FulfilledPrizeList draws={fulfilled} />
            </MoreOptions>
          </Section>
        )}
      </ScrollView>
    </View>
  );
}

function InfoLine({ text }: { text: string }) {
  const theme = useTheme();
  const { textAlign } = useDir();
  return (
    <Text style={[styles.info, { color: theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
      {text}
    </Text>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.kpi, { backgroundColor: theme.primary + '08' }]}>
      <Text style={[styles.kpiValue, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>{value}</Text>
      <Text style={[styles.kpiLabel, { color: theme.textMuted }]} numberOfLines={2} maxFontSizeMultiplier={1.2}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 14 },
  actions: { gap: 10 },
  info: { fontSize: ms(14), lineHeight: ms(20), fontFamily: font.regular },
  hint: { fontSize: ms(13), lineHeight: ms(19), fontFamily: font.regular },
  kpiRow: { gap: 8 },
  kpi: { flex: 1, borderRadius: 12, padding: 10, gap: 4 },
  kpiValue: { fontSize: ms(17), fontFamily: font.bold },
  kpiLabel: { fontSize: ms(11), fontFamily: font.regular },
  prizeRow: { gap: 6, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  prizeTop: { alignItems: 'center', gap: 8 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  prizeLabel: { flex: 1, fontSize: ms(14), fontFamily: font.semibold },
  prizeChance: { fontSize: ms(13), fontFamily: font.semibold },
  prizeMeta: { fontSize: ms(12), fontFamily: font.regular },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
});
