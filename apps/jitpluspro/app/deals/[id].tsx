import { useCallback, useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { View, StyleSheet, ScrollView, Alert, RefreshControl } from 'react-native';
import { Text } from '@/components/AppText';
import { CalendarPlus, Edit3, RotateCcw, Trash2, XCircle } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { useMoney } from '@/hooks/useCurrency';
import { useAuthStore } from '@/stores/authStore';
import { useDeleteDeal, useDuplicateDeal, useMerchantDeal, useStopDeal, useUpdateDeal } from '@/hooks/queries/deals';
import { getErrorMessage } from '@/utils/error';
import { getIntlLocale } from '@/config/currency';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import { DEAL_LIMITS, type MerchantDealDto } from '@jitplus/shared/src/deals';
import { addDaysYmd, diffDaysYmd } from '@jitplus/shared/src/scratch';
import { Button, Notice, ScreenHeader, Section } from '@/components/scratch/ScratchUI';
import { Kpi, KpiRow } from '@/components/games/Kpi';
import { GameModal, gameModalText } from '@/components/games/GameModal';
import { GameDetailMissing, GameScreenLoading, InfoLine, useBackTo } from '@/components/games/GameScreen';
import { DateField, formatYmd } from '@/components/scratch/DateField';
import { moroccoToday, moroccoYmdOf } from '@/components/scratch/campaignForm';
import DealThumb from '@/components/deals/DealThumb';
import { DealDailyChart } from '@/components/deals/DealDailyChart';
import { dealActions } from '@/components/deals/dealForm';
import { DealPriceRow, DealStatusPill } from '@/components/deals/DealRows';
import { dealBadgeLabel, dealPrices, dealTimeLeftLabel, type Translate } from '@/components/deals/dealVisual';
import { useDealErrorAlert } from '@/components/deals/useDealErrorAlert';

/** Why the deal is over, from its display status and endedReason (a moderator's motive is free text). */
function endedReasonText(deal: Pick<MerchantDealDto, 'displayStatus' | 'endedReason'>, t: Translate): string | null {
  const reason = deal.endedReason;
  if (deal.displayStatus === 'REMOVED') {
    if (reason === 'AUTO_REPORTS') return t('deals.detail.reason.AUTO_REPORTS');
    return reason ? t('deals.detail.reason.moderation', { reason }) : t('deals.detail.reason.removed');
  }
  if (deal.displayStatus !== 'ENDED') return null;
  return reason === 'STOPPED' ? t('deals.detail.reason.STOPPED') : t('deals.detail.reason.EXPIRED');
}

export default function DealDetail() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { money } = useMoney();
  const { row, textAlign } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const merchant = useAuthStore((s) => s.merchant);
  const isOwner = !isTeamMember;

  const dealQuery = useMerchantDeal(id);
  const deal = dealQuery.data;
  const stopMutation = useStopDeal();
  const duplicateMutation = useDuplicateDeal();
  const deleteMutation = useDeleteDeal();
  const updateMutation = useUpdateDeal();
  const [extendVisible, setExtendVisible] = useState(false);

  const goBack = useBackTo('/deals');
  const fail = useCallback((e: unknown) => Alert.alert(t('common.error'), getErrorMessage(e, t('common.genericError'))), [t]);
  const showDealError = useDealErrorAlert();

  const handleStop = useCallback(() => {
    if (!id) return;
    Alert.alert(t('deals.detail.stopTitle'), t('deals.detail.stopBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('deals.detail.stop'),
        style: 'destructive',
        onPress: async () => {
          try {
            await stopMutation.mutateAsync(id);
            toast.success(t('deals.detail.stopped'));
          } catch (e) { fail(e); }
        },
      },
    ]);
  }, [id, stopMutation, t, fail]);

  const handleRelaunch = useCallback((days: number) => {
    if (!id) return;
    Alert.alert(t('deals.detail.relaunchTitle'), t('deals.detail.relaunchBody', { days }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('deals.detail.relaunch'),
        onPress: async () => {
          try {
            const copy = await duplicateMutation.mutateAsync({ id });
            toast.success(t('deals.detail.relaunched'));
            router.replace({ pathname: '/deals/[id]', params: { id: copy.id } });
          } catch (e) { showDealError(e); }
        },
      },
    ]);
  }, [id, duplicateMutation, router, t, showDealError]);

  const handleDelete = useCallback(() => {
    if (!id) return;
    Alert.alert(t('deals.detail.deleteTitle'), t('deals.detail.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('deals.detail.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMutation.mutateAsync(id);
            goBack();
          } catch (e) { fail(e); }
        },
      },
    ]);
  }, [id, deleteMutation, goBack, t, fail]);

  const saveEnd = useCallback(async (endsOn: string) => {
    if (!id) return;
    try {
      await updateMutation.mutateAsync({ id, payload: { endsOn } });
      setExtendVisible(false);
      toast.success(t('deals.detail.extended'));
    } catch (e) { showDealError(e); }
  }, [id, updateMutation, t, showDealError]);

  if (shouldWait) return null;

  if (dealQuery.isLoading) return <GameScreenLoading />;
  if (!deal) return <GameDetailMissing title={t('deals.title')} onBack={goBack} ns="deals" query={dealQuery} />;

  const status = deal.displayStatus;
  const running = status === 'LIVE' || status === 'SCHEDULED';
  const day = (ymd: string) => formatYmd(ymd, locale);
  const badge = dealBadgeLabel(deal, t);
  const reason = endedReasonText(deal, t);
  const time = status === 'LIVE' ? dealTimeLeftLabel(deal.endsAt, t) : null;
  const relaunchDays = Math.max(1, Math.min(DEAL_LIMITS.MAX_DURATION_DAYS, diffDaysYmd(deal.startsOn, deal.endsOn)));
  // An ended deal keeps the chart of its own days, not of the days since.
  const today = moroccoToday();
  const lastDay = deal.endsOn < today ? deal.endsOn : today;
  const engaged = dealActions(deal.stats) + deal.stats.claims;
  const actionRate = deal.stats.views > 0 ? Math.min(100, Math.round((engaged / deal.stats.views) * 100)) : null;
  const statusLine = status === 'LIVE'
    ? time?.text
    : status === 'SCHEDULED'
      ? t('deals.list.startsOn', { date: day(deal.startsOn) })
      : t('deals.list.endedOn', { date: day(moroccoYmdOf(new Date(deal.endsAt))) });
  const number = (n: number) => n.toLocaleString(getIntlLocale(locale));
  const storesLine = deal.scope === 'ONLINE'
    ? t('deals.scope.ONLINE')
    : deal.allStores
      ? t('deals.detail.allStores')
      : t('deals.detail.someStores', { count: deal.storeIds.length });

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={t('deals.title')} onBack={goBack} right={<DealStatusPill status={status} />} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={dealQuery.isRefetching} onRefresh={() => void dealQuery.refetch()} tintColor={theme.primary} />}
      >
        <Section>
          <View style={[styles.hero, { flexDirection: row }]}>
            <DealThumb
              imageUrl={deal.imageUrl}
              coverUrl={merchant?.coverUrl ?? null}
              themeColor={merchant?.themeColor ?? null}
              category={merchant?.categorie ?? null}
              badge={badge}
              width={ms(96)}
              radius={14}
            />
            <View style={styles.heroBody}>
              <Text style={[styles.title, { color: theme.text, textAlign }]} numberOfLines={3} maxFontSizeMultiplier={1.3}>
                {deal.title}
              </Text>
              <DealPriceRow prices={dealPrices(deal, money, t)} badge={badge} large />
              {statusLine ? (
                <Text
                  style={[styles.meta, { color: time?.urgent ? theme.warning : theme.textSecondary, textAlign }]}
                  maxFontSizeMultiplier={1.3}
                >
                  {statusLine}
                </Text>
              ) : null}
            </View>
          </View>
        </Section>

        {reason && <Notice tone={status === 'REMOVED' ? 'danger' : 'info'} text={reason} />}

        {isOwner && (
          <View style={styles.actions}>
            {running && (
              <>
                <Button icon={Edit3} label={t('deals.detail.edit')} onPress={() => router.push({ pathname: '/deals/create', params: { id: deal.id } })} />
                <Button variant="secondary" icon={CalendarPlus} label={t('deals.detail.extend')} onPress={() => setExtendVisible(true)} />
                <Button variant="danger" icon={XCircle} label={t('deals.detail.stop')} onPress={handleStop} loading={stopMutation.isPending} />
              </>
            )}
            {status === 'ENDED' && (
              <Button
                icon={RotateCcw}
                label={t('deals.detail.relaunch')}
                onPress={() => handleRelaunch(relaunchDays)}
                loading={duplicateMutation.isPending}
              />
            )}
            <Button variant="ghost" icon={Trash2} label={t('deals.detail.delete')} onPress={handleDelete} loading={deleteMutation.isPending} />
          </View>
        )}

        <Section title={t('deals.detail.stats')}>
          <KpiRow>
            <Kpi label={t('deals.detail.views')} value={number(deal.stats.views)} />
            {deal.scope === 'LOCAL'
              ? <Kpi label={t('deals.detail.claims')} value={number(deal.stats.claims)} />
              : <Kpi label={t('deals.detail.linkClicks')} value={number(deal.stats.linkClicks)} />}
          </KpiRow>
          <KpiRow>
            {deal.scope === 'LOCAL'
              ? <Kpi label={t('deals.detail.directions')} value={number(deal.stats.directions)} />
              : <Kpi label={t('deals.detail.shares')} value={number(deal.stats.shares)} />}
            <Kpi label={t('deals.detail.calls')} value={number(deal.stats.calls)} />
          </KpiRow>
          {deal.scope === 'LOCAL' && (
            <KpiRow>
              <Kpi label={t('deals.detail.linkClicks')} value={number(deal.stats.linkClicks)} />
              <Kpi label={t('deals.detail.shares')} value={number(deal.stats.shares)} />
            </KpiRow>
          )}
          {actionRate != null && <InfoLine text={t('deals.detail.actionRate', { percent: actionRate })} muted />}
        </Section>

        {status !== 'SCHEDULED' && deal.daily && (
          <Section title={t('deals.detail.chartTitle')}>
            <DealDailyChart daily={deal.daily} fromYmd={deal.startsOn} toYmd={lastDay} />
          </Section>
        )}

        <Section title={t('deals.detail.infoTitle')}>
          <InfoLine text={`${t(`deals.scope.${deal.scope}`)} · ${t(`deals.type.${deal.type}`)}`} />
          <InfoLine text={t('deals.list.dates', { start: day(deal.startsOn), end: day(deal.endsOn) })} />
          <InfoLine text={storesLine} />
          <InfoLine text={deal.linkUrl || t('deals.detail.noLink')} muted={!deal.linkUrl} />
          {deal.description ? <InfoLine text={deal.description} /> : null}
          {deal.conditions ? <InfoLine text={deal.conditions} muted /> : null}
        </Section>
      </ScrollView>

      {/* Mounted on open, so the picker starts from the saved end date. */}
      {isOwner && running && extendVisible && (
        <ExtendEndModal
          deal={deal}
          loading={updateMutation.isPending}
          onClose={() => setExtendVisible(false)}
          onSave={saveEnd}
        />
      )}
    </View>
  );
}

/** Live deal: last day from today up to 30 days ahead. Scheduled deal: up to 30 days after its first day. */
function ExtendEndModal({ deal, loading, onClose, onSave }: {
  deal: MerchantDealDto;
  loading: boolean;
  onClose: () => void;
  onSave: (endsOn: string) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const [endsOn, setEndsOn] = useState(deal.endsOn);

  const today = moroccoToday();
  const from = deal.displayStatus === 'LIVE' || deal.startsOn < today ? today : deal.startsOn;

  return (
    <GameModal onClose={onClose}>
      <Text style={[gameModalText.title, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{t('deals.detail.extendTitle')}</Text>
      <Text style={[gameModalText.body, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>
        {t('deals.detail.extendHint', { days: DEAL_LIMITS.MAX_DURATION_DAYS })}
      </Text>
      <DateField
        label={t('deals.wizard.endLabel')}
        value={endsOn}
        minYmd={from}
        maxYmd={addDaysYmd(from, DEAL_LIMITS.MAX_DURATION_DAYS)}
        onChange={setEndsOn}
      />
      <Button label={t('deals.detail.extendSave')} disabled={endsOn === deal.endsOn} loading={loading} onPress={() => onSave(endsOn)} />
      <Button variant="ghost" label={t('common.cancel')} onPress={onClose} />
    </GameModal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 14 },
  hero: { gap: 14, alignItems: 'flex-start' },
  heroBody: { flex: 1, gap: 6 },
  title: { fontSize: ms(17), lineHeight: ms(23), fontFamily: font.semibold },
  meta: { fontSize: ms(13), fontFamily: font.medium },
  actions: { gap: 10 },
});
