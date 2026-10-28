import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, RefreshControl, Modal, Pressable } from 'react-native';
import { CalendarPlus, Edit3, RotateCcw, Trash2, XCircle } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import { useDeleteDeal, useDuplicateDeal, useMerchantDeal, useStopDeal, useUpdateDeal } from '@/hooks/queries/deals';
import { getErrorMessage } from '@/utils/error';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import { DEAL_LIMITS, type MerchantDealDto } from '@jitplus/shared/src/deals';
import { addDaysYmd, diffDaysYmd } from '@jitplus/shared/src/scratch';
import { Button, Notice, ScreenHeader, Section } from '@/components/scratch/ScratchUI';
import { DateField, formatYmd } from '@/components/scratch/DateField';
import { moroccoToday, moroccoYmdOf } from '@/components/scratch/campaignForm';
import DealThumb from '@/components/deals/DealThumb';
import { DealStatusPill } from '@/components/deals/DealRows';
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

  const goBack = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/deals')), [router]);
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
            Alert.alert(t('deals.detail.stopped'));
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
            Alert.alert(t('deals.detail.relaunched'));
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
      Alert.alert(t('deals.detail.extended'));
    } catch (e) { showDealError(e); }
  }, [id, updateMutation, t, showDealError]);

  if (shouldWait) return null;

  if (dealQuery.isLoading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  if (!deal) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScreenHeader title={t('deals.title')} onBack={goBack} />
        <View style={styles.content}><Notice tone="danger" text={t('deals.detail.notFound')} /></View>
      </View>
    );
  }

  const status = deal.displayStatus;
  const running = status === 'LIVE' || status === 'SCHEDULED';
  const day = (ymd: string) => formatYmd(ymd, locale);
  const badge = dealBadgeLabel(deal, t);
  const { price, original } = dealPrices(deal, t, locale);
  const reason = endedReasonText(deal, t);
  const time = status === 'LIVE' ? dealTimeLeftLabel(deal.endsAt, t) : null;
  const relaunchDays = Math.max(1, Math.min(DEAL_LIMITS.MAX_DURATION_DAYS, diffDaysYmd(deal.startsOn, deal.endsOn)));
  const statusLine = status === 'LIVE'
    ? time?.text
    : status === 'SCHEDULED'
      ? t('deals.list.startsOn', { date: day(deal.startsOn) })
      : t('deals.list.endedOn', { date: day(moroccoYmdOf(new Date(deal.endsAt))) });
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
              {(price || original || badge) && (
                <View style={[styles.priceRow, { flexDirection: row }]}>
                  {price ? <Text style={[styles.price, { color: theme.danger }]} maxFontSizeMultiplier={1.3}>{price}</Text> : null}
                  {original ? (
                    <Text
                      style={[styles.original, { color: theme.textMuted }, deal.type === 'PRICE_DROP' && styles.struck]}
                      maxFontSizeMultiplier={1.3}
                    >
                      {deal.type === 'FREE_ITEM' ? t('deals.valueOf', { value: original }) : original}
                    </Text>
                  ) : null}
                  {badge ? (
                    <View style={[styles.badge, { backgroundColor: theme.danger }]}>
                      <Text style={styles.badgeText} maxFontSizeMultiplier={1.2}>{badge}</Text>
                    </View>
                  ) : null}
                </View>
              )}
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
          <View style={[styles.kpiRow, { flexDirection: row }]}>
            <Kpi label={t('deals.detail.views')} value={deal.stats.views} />
            <Kpi label={t('deals.detail.linkClicks')} value={deal.stats.linkClicks} />
          </View>
          <View style={[styles.kpiRow, { flexDirection: row }]}>
            <Kpi label={t('deals.detail.directions')} value={deal.stats.directions} />
            <Kpi label={t('deals.detail.shares')} value={deal.stats.shares} />
          </View>
        </Section>

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

function InfoLine({ text, muted }: { text: string; muted?: boolean }) {
  const theme = useTheme();
  const { textAlign } = useDir();
  return (
    <Text style={[styles.info, { color: muted ? theme.textMuted : theme.textSecondary, textAlign }]} maxFontSizeMultiplier={1.4}>
      {text}
    </Text>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  const { locale } = useLanguage();
  return (
    <View style={[styles.kpi, { backgroundColor: theme.bgElevated }]}>
      <Text style={[styles.kpiValue, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>
        {value.toLocaleString(locale)}
      </Text>
      <Text style={[styles.kpiLabel, { color: theme.textMuted }]} numberOfLines={2} maxFontSizeMultiplier={1.2}>{label}</Text>
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
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: theme.bgCard }]} onPress={(e) => e.stopPropagation()} accessibilityViewIsModal>
          <Text style={[styles.modalTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{t('deals.detail.extendTitle')}</Text>
          <Text style={[styles.modalBody, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 14 },
  hero: { gap: 14, alignItems: 'flex-start' },
  heroBody: { flex: 1, gap: 6 },
  title: { fontSize: ms(17), lineHeight: ms(23), fontFamily: font.semibold },
  priceRow: { alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  price: { fontSize: ms(16), fontFamily: font.bold },
  original: { fontSize: ms(13), fontFamily: font.regular },
  struck: { textDecorationLine: 'line-through' },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: '#FFFFFF', fontSize: ms(12), fontFamily: font.bold },
  meta: { fontSize: ms(13), fontFamily: font.medium },
  actions: { gap: 10 },
  info: { fontSize: ms(14), lineHeight: ms(20), fontFamily: font.regular },
  kpiRow: { gap: 8 },
  kpi: { flex: 1, borderRadius: 12, padding: 10, gap: 4 },
  kpiValue: { fontSize: ms(17), fontFamily: font.bold },
  kpiLabel: { fontSize: ms(12), fontFamily: font.regular },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  modal: { borderRadius: 24, padding: 20, gap: 12 },
  modalTitle: { fontSize: ms(17), fontFamily: font.bold, textAlign: 'center' },
  modalBody: { fontSize: ms(14), lineHeight: ms(20), fontFamily: font.regular, textAlign: 'center' },
});
