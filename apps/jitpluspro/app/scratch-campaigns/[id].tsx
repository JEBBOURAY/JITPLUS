import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Pressable,
  Linking,
  TouchableOpacity,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CalendarPlus, Copy, Edit3, MessageCircle, Send, Trash2, Undo2, XCircle } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useDir } from '@/hooks/useDir';
import { useAuthStore } from '@/stores/authStore';
import {
  fetchCancelPreview,
  useCancelScratchCampaign,
  useDeleteScratchCampaign,
  useDuplicateScratchCampaign,
  useExtendScratchDates,
  useMerchantCoupons,
  useReshareClaim,
  useScratchCampaign,
  useScratchCampaignStats,
  useScratchClientsWithoutApp,
  useUnscheduleScratchCampaign,
} from '@/hooks/useScratchHooks';
import { getErrorMessage } from '@/utils/error';
import { formatDateTime } from '@/utils/date';
import { formatCurrency, DEFAULT_CURRENCY, getIntlLocale } from '@/config/currency';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import {
  SCRATCH_LIMITS,
  addDaysYmd,
  formatRewardValue,
  rewardProbabilities,
  type CancelPreview,
  type ScratchCampaignDto,
  type ScratchClientWithoutApp,
} from '@jitplus/shared/src/scratch';
import { Button, CampaignStatusPill, Notice, ScreenHeader, Section } from '@/components/scratch/ScratchUI';
import { DateField, formatYmd } from '@/components/scratch/DateField';
import { moroccoToday, moroccoYmdOf } from '@/components/scratch/campaignForm';

const CANCEL_DELAY_S = 3;

export default function ScratchCampaignDetail() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { row, textAlign } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();
  const merchant = useAuthStore((s) => s.merchant);
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const isOwner = !isTeamMember;
  const { isPremium } = usePlanStatus(merchant);
  const merchantName = merchant?.nom;

  const campaignQuery = useScratchCampaign(id);
  const campaign = campaignQuery.data;
  const sent = !!campaign && ['SENDING', 'SENT', 'ENDED', 'CANCELLED'].includes(campaign.status);
  const statsQuery = useScratchCampaignStats(id, sent, campaign?.status === 'SENDING');
  const stats = statsQuery.data;
  const withoutAppQuery = useScratchClientsWithoutApp(id, sent && isOwner && (stats?.withoutApp ?? 0) > 0);
  const couponsQuery = useMerchantCoupons('REDEEMED', id, sent);
  const redeemedCoupons = useMemo(() => couponsQuery.data?.pages.flatMap((p) => p.coupons) ?? [], [couponsQuery.data]);

  const unscheduleMutation = useUnscheduleScratchCampaign();
  const cancelMutation = useCancelScratchCampaign();
  const duplicateMutation = useDuplicateScratchCampaign();
  const deleteMutation = useDeleteScratchCampaign();
  const extendMutation = useExtendScratchDates();
  const reshareMutation = useReshareClaim();

  const [cancelPreview, setCancelPreview] = useState<CancelPreview | null>(null);
  const [finalCancelVisible, setFinalCancelVisible] = useState(false);
  const [extendVisible, setExtendVisible] = useState(false);
  const [sharingClientId, setSharingClientId] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const loadingPreviewRef = useRef(false);

  // refetch functions are stable, unlike the query result objects.
  const { refetch: refetchCampaign } = campaignQuery;
  const { refetch: refetchStats } = statsQuery;
  const { refetch: refetchCoupons } = couponsQuery;
  const { refetch: refetchWithoutApp } = withoutAppQuery;
  const onRefresh = useCallback(() => {
    refetchCampaign();
    if (sent) {
      refetchStats();
      refetchCoupons();
      refetchWithoutApp();
    }
  }, [refetchCampaign, refetchStats, refetchCoupons, refetchWithoutApp, sent]);

  const fail = useCallback((e: unknown) => Alert.alert(t('common.error'), getErrorMessage(e, t('common.genericError'))), [t]);

  const handleUnschedule = useCallback(async () => {
    if (!id) return;
    try {
      await unscheduleMutation.mutateAsync(id);
      Alert.alert(t('scratch.detail.unscheduled'));
    } catch (e) { fail(e); }
  }, [id, unscheduleMutation, t, fail]);

  const handleDuplicate = useCallback(async () => {
    if (!id) return;
    try {
      const copy = await duplicateMutation.mutateAsync(id);
      Alert.alert(t('scratch.detail.duplicated'));
      router.replace({ pathname: '/scratch-campaigns/create', params: { id: copy.id } });
    } catch (e) { fail(e); }
  }, [id, duplicateMutation, router, t, fail]);

  const handleDelete = useCallback(() => {
    if (!id) return;
    Alert.alert(t('scratch.detail.delete'), t('scratch.detail.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteMutation.mutateAsync(id);
            router.back();
          } catch (e) { fail(e); }
        },
      },
    ]);
  }, [id, deleteMutation, router, t, fail]);

  const handleCancel = useCallback(async () => {
    if (!id || loadingPreviewRef.current) return;
    loadingPreviewRef.current = true;
    setLoadingPreview(true);
    try {
      const preview = await fetchCancelPreview(qc, id);
      setCancelPreview(preview);
      Alert.alert(
        t('scratch.detail.cancelTitle'),
        t('scratch.detail.cancelStep1', { cards: preview.pendingCards, coupons: preview.activeCoupons, redeemed: preview.redeemedCoupons }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('scratch.detail.cancelContinue'), style: 'destructive', onPress: () => setFinalCancelVisible(true) },
        ],
      );
    } catch (e) {
      fail(e);
    } finally {
      loadingPreviewRef.current = false;
      setLoadingPreview(false);
    }
  }, [id, qc, t, fail]);

  const confirmCancel = useCallback(async () => {
    if (!id) return;
    try {
      await cancelMutation.mutateAsync(id);
      setFinalCancelVisible(false);
      Alert.alert(t('scratch.detail.cancelled'));
    } catch (e) {
      setFinalCancelVisible(false);
      fail(e);
    }
  }, [id, cancelMutation, t, fail]);

  const shareOnWhatsApp = useCallback(async (entry: ScratchClientWithoutApp) => {
    if (sharingClientId) return;
    setSharingClientId(entry.client.id);
    try {
      const res = await reshareMutation.mutateAsync(entry.client.id);
      const message = t('scratch.detail.whatsAppMessage', {
        name: res.client.prenom?.trim() || entry.client.prenom?.trim() || '',
        merchant: merchantName ?? 'JitPlus',
        url: res.claim.url,
      });
      const phone = (res.client.telephone || '').replace(/[^\d]/g, '');
      const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
      const canOpen = await Linking.canOpenURL(waUrl).catch(() => false);
      if (canOpen) {
        await Linking.openURL(waUrl);
      } else {
        await Clipboard.setStringAsync(message);
        Alert.alert(t('scratch.detail.whatsAppUnavailable'));
      }
    } catch (e) {
      fail(e);
    } finally {
      setSharingClientId(null);
    }
  }, [sharingClientId, reshareMutation, merchantName, t, fail]);

  if (shouldWait) return null;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/scratch-campaigns'));

  if (campaignQuery.isLoading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }
  if (!campaign) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <ScreenHeader title={t('scratch.list.title')} onBack={goBack} />
        <View style={styles.content}><Notice tone="danger" text={t('scratch.detail.notFound')} /></View>
      </View>
    );
  }

  const status = campaign.status;
  const canEdit = isOwner && isPremium && (status === 'DRAFT' || status === 'SCHEDULED');
  const canCancel = isOwner && ['SCHEDULED', 'SENDING', 'SENT'].includes(status);
  const canExtend = isOwner && isPremium && (status === 'SENDING' || status === 'SENT');
  const money = (n: number) => formatCurrency(n, DEFAULT_CURRENCY, getIntlLocale(locale));
  const probabilities = rewardProbabilities(campaign.rewards.map((r) => r.weight));

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScreenHeader title={campaign.name} onBack={goBack} right={<CampaignStatusPill status={status} />} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={<RefreshControl refreshing={campaignQuery.isRefetching} onRefresh={onRefresh} tintColor={theme.primary} />}
      >
        {status === 'SENDING' && <Notice text={t('scratch.detail.sendingNow')} />}

        <Section>
          {campaign.sendAt && status === 'SCHEDULED' && (
            <InfoLine text={t('scratch.list.sendAt', { date: formatDateTime(campaign.sendAt, locale) })} />
          )}
          {campaign.sentAt && <InfoLine text={t('scratch.list.sentAt', { date: formatDateTime(campaign.sentAt, locale) })} />}
          <InfoLine text={t('scratch.list.cardUntil', { date: formatYmd(campaign.cardExpiresOn, locale) })} />
          <InfoLine text={t('scratch.list.couponUntil', { date: formatYmd(campaign.couponExpiresOn, locale) })} />
          <InfoLine text={t(`scratch.wizard.audienceType.${campaign.audienceType}`) + (campaign.audienceValue ? ` (${campaign.audienceValue})` : '')} />
          {campaign.recipientCount > 0 && <InfoLine text={t('scratch.list.recipients', { count: campaign.recipientCount })} />}
          {campaign.message ? <InfoLine text={`« ${campaign.message} »`} muted /> : null}
        </Section>

        {(canEdit || canCancel || canExtend || (isOwner && isPremium)) && (
          <View style={styles.actions}>
            {canEdit && (
              <Button
                icon={status === 'DRAFT' ? Send : Edit3}
                label={status === 'DRAFT' ? t('scratch.detail.send') : t('scratch.detail.edit')}
                onPress={() => router.push({ pathname: '/scratch-campaigns/create', params: { id: campaign.id } })}
              />
            )}
            {status === 'SCHEDULED' && isOwner && (
              <Button variant="secondary" icon={Undo2} label={t('scratch.detail.unschedule')} onPress={handleUnschedule} loading={unscheduleMutation.isPending} />
            )}
            {canExtend && (
              <Button variant="secondary" icon={CalendarPlus} label={t('scratch.detail.extend')} onPress={() => setExtendVisible(true)} />
            )}
            {isOwner && isPremium && (
              <Button variant="secondary" icon={Copy} label={t('scratch.detail.duplicate')} onPress={handleDuplicate} loading={duplicateMutation.isPending} />
            )}
            {status === 'DRAFT' && isOwner && (
              <Button variant="ghost" icon={Trash2} label={t('scratch.detail.delete')} onPress={handleDelete} loading={deleteMutation.isPending} />
            )}
            {canCancel && (
              <Button variant="danger" icon={XCircle} label={t('scratch.detail.cancel')} onPress={handleCancel} loading={cancelMutation.isPending || loadingPreview} />
            )}
          </View>
        )}

        {sent && stats && (
          <Section title={t('scratch.detail.stats')}>
            <Funnel
              steps={[
                { label: t('scratch.detail.sent'), value: stats.sent },
                { label: t('scratch.detail.opened'), value: stats.opened },
                { label: t('scratch.detail.scratched'), value: stats.scratched },
                { label: t('scratch.detail.redeemed'), value: stats.redeemed },
              ]}
            />
            <View style={[styles.kpiRow, { flexDirection: row }]}>
              <Kpi label={t('scratch.detail.revenue')} value={money(stats.revenue)} />
              <Kpi label={t('scratch.detail.discountGiven')} value={money(stats.discountGiven)} />
              <Kpi label={t('scratch.detail.bonusStamps')} value={String(stats.bonusStamps)} />
            </View>
            <InfoLine text={t('scratch.detail.pushDelivered', { count: stats.pushDelivered })} muted />
            {stats.cancelledCoupons > 0 && <InfoLine text={t('scratch.detail.cancelledCoupons', { count: stats.cancelledCoupons })} muted />}
          </Section>
        )}

        <Section title={sent ? t('scratch.detail.rewards') : t('scratch.detail.rewardsList')}>
          {campaign.rewards.map((r, i) => {
            const rs = stats?.rewards.find((x) => x.rewardId === r.id);
            const remaining = rs ? rs.remaining : r.remaining;
            return (
              <View key={r.id} style={[styles.rewardRow, { borderBottomColor: theme.borderLight }]}>
                <View style={[styles.rewardTop, { flexDirection: row }]}>
                  <Text style={[styles.rewardLabel, { color: theme.text, textAlign }]} numberOfLines={2}>{r.label}</Text>
                  <Text style={[styles.rewardValue, { color: theme.primary }]}>{formatRewardValue(r, t)}</Text>
                </View>
                <Text style={[styles.rewardMeta, { color: theme.textMuted, textAlign }]}>
                  {sent && rs
                    ? `${t('scratch.detail.won', { count: rs.won })} · ${t('scratch.detail.rewardRedeemed', { count: rs.redeemed })} · `
                    : `${t('scratch.wizard.chance', { percent: probabilities[i] ?? 0 })} · `}
                  {remaining == null ? t('scratch.detail.remainingUnlimited') : t('scratch.detail.remaining', { count: remaining })}
                </Text>
              </View>
            );
          })}
        </Section>

        {sent && isOwner && stats && stats.withoutApp > 0 && (
          <Section title={t('scratch.detail.withoutApp')}>
            <Text style={[styles.hint, { color: theme.textSecondary, textAlign }]}>
              {t('scratch.detail.withoutAppHint', { date: formatYmd(campaign.cardExpiresOn, locale, false) })}
            </Text>
            {stats.convertedFromGhost > 0 && <InfoLine text={t('scratch.detail.converted', { count: stats.convertedFromGhost })} muted />}
            {withoutAppQuery.isLoading && <ActivityIndicator color={theme.primary} />}
            {(withoutAppQuery.data ?? []).length === 0 && !withoutAppQuery.isLoading && (
              <InfoLine text={t('scratch.detail.withoutAppNone')} muted />
            )}
            {(withoutAppQuery.data ?? []).map((entry) => (
              <View key={entry.cardId} style={[styles.clientRow, { flexDirection: row, borderBottomColor: theme.borderLight }]}>
                <View style={styles.flex}>
                  <Text style={[styles.clientName, { color: theme.text, textAlign }]} numberOfLines={1}>
                    {[entry.client.prenom, entry.client.nom].filter(Boolean).join(' ') || entry.client.telephone || '?'}
                  </Text>
                  <Text style={[styles.rewardMeta, { color: theme.textMuted, textAlign }]}>{t(`scratch.cardStatus.${entry.status}`)}</Text>
                </View>
                {entry.status === 'PENDING' && entry.client.telephone && (
                  <TouchableOpacity
                    onPress={() => shareOnWhatsApp(entry)}
                    disabled={!!sharingClientId}
                    style={[styles.waBtn, { opacity: sharingClientId && sharingClientId !== entry.client.id ? 0.5 : 1, flexDirection: row }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('scratch.detail.sendWhatsApp')}, ${entry.client.prenom ?? ''}`}
                  >
                    {sharingClientId === entry.client.id
                      ? <ActivityIndicator color="#FFFFFF" size="small" />
                      : <MessageCircle size={16} color="#FFFFFF" strokeWidth={icon.stroke} />}
                    <Text style={styles.waText}>{t('scratch.detail.sendWhatsApp')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </Section>
        )}

        {sent && (
          <Section title={t('scratch.detail.couponsRedeemed')}>
            {redeemedCoupons.length === 0 && !couponsQuery.isLoading && <InfoLine text={t('scratch.detail.noCoupons')} muted />}
            {redeemedCoupons.map((c) => (
              <View key={c.id} style={[styles.clientRow, { flexDirection: row, borderBottomColor: theme.borderLight }]}>
                <View style={styles.flex}>
                  <Text style={[styles.clientName, { color: theme.text, textAlign }]} numberOfLines={1}>
                    {[c.client.prenom, c.client.nom].filter(Boolean).join(' ') || '?'} · {c.label}
                  </Text>
                  <Text style={[styles.rewardMeta, { color: theme.textMuted, textAlign }]} numberOfLines={1}>
                    {c.redeemedAt ? formatDateTime(c.redeemedAt, locale) : ''}
                    {c.redeemedByName ? ` · ${t('scratch.detail.by', { name: c.redeemedByName })}` : ''}
                  </Text>
                </View>
                {(c.discountAmount ?? 0) > 0 && (
                  <Text style={[styles.rewardValue, { color: theme.success }]}>-{money(c.discountAmount ?? 0)}</Text>
                )}
              </View>
            ))}
            {couponsQuery.hasNextPage && (
              <Button variant="ghost" label={t('scratch.detail.loadMore')} onPress={() => couponsQuery.fetchNextPage()} loading={couponsQuery.isFetchingNextPage} />
            )}
          </Section>
        )}
      </ScrollView>

      <FinalCancelModal
        visible={finalCancelVisible}
        preview={cancelPreview}
        loading={cancelMutation.isPending}
        onConfirm={confirmCancel}
        onClose={() => setFinalCancelVisible(false)}
      />
      {canExtend && (
        <ExtendDatesModal
          visible={extendVisible}
          campaign={campaign}
          loading={extendMutation.isPending}
          onClose={() => setExtendVisible(false)}
          onSave={async (dates) => {
            try {
              await extendMutation.mutateAsync({ id: campaign.id, ...dates });
              setExtendVisible(false);
              Alert.alert(t('scratch.detail.extended'));
            } catch (e) { fail(e); }
          }}
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

function Kpi({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.kpi, { backgroundColor: theme.bgElevated }]}>
      <Text style={[styles.kpiValue, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>{value}</Text>
      <Text style={[styles.kpiLabel, { color: theme.textMuted }]} numberOfLines={2} maxFontSizeMultiplier={1.2}>{label}</Text>
    </View>
  );
}

function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const theme = useTheme();
  const { row, alignStart } = useDir();
  const max = Math.max(1, steps[0]?.value ?? 1);
  return (
    <View style={styles.funnel}>
      {steps.map((s) => {
        const pct = Math.round((s.value / max) * 100);
        return (
          <View key={s.label} style={styles.funnelStep}>
            <View style={[styles.funnelHeader, { flexDirection: row }]}>
              <Text style={[styles.funnelLabel, { color: theme.textSecondary }]}>{s.label}</Text>
              <Text style={[styles.funnelValue, { color: theme.text }]}>{s.value} · {pct} %</Text>
            </View>
            <View style={[styles.funnelTrack, { backgroundColor: theme.bgInput, alignItems: alignStart }]}>
              <View style={[styles.funnelFill, { backgroundColor: theme.primary, width: `${Math.max(2, pct)}%` }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function FinalCancelModal({ visible, preview, loading, onConfirm, onClose }: {
  visible: boolean;
  preview: CancelPreview | null;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const [remaining, setRemaining] = useState(CANCEL_DELAY_S);

  // Restart the countdown each time the modal opens.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setRemaining(CANCEL_DELAY_S);
  }

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setRemaining((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(timer);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: theme.bgCard }]} onPress={(e) => e.stopPropagation()} accessibilityViewIsModal>
          <Text style={[styles.modalTitle, { color: theme.danger }]}>{t('scratch.detail.cancelFinalTitle')}</Text>
          {preview && (
            <Text style={[styles.modalBody, { color: theme.textSecondary }]}>
              {t('scratch.detail.cancelStep1', { cards: preview.pendingCards, coupons: preview.activeCoupons, redeemed: preview.redeemedCoupons })}
            </Text>
          )}
          <Text style={[styles.modalBody, { color: theme.text }]}>{t('scratch.detail.cancelFinalBody')}</Text>
          <Button
            variant="danger"
            label={remaining > 0 ? t('scratch.detail.cancelWait', { seconds: remaining }) : t('scratch.detail.cancelFinal')}
            disabled={remaining > 0}
            loading={loading}
            onPress={onConfirm}
          />
          <Button variant="ghost" label={t('common.cancel')} onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ExtendDatesModal({ visible, campaign, loading, onClose, onSave }: {
  visible: boolean;
  campaign: ScratchCampaignDto;
  loading: boolean;
  onClose: () => void;
  onSave: (dates: { cardExpiresOn?: string; couponExpiresOn?: string }) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const [card, setCard] = useState(campaign.cardExpiresOn);
  const [coupon, setCoupon] = useState(campaign.couponExpiresOn);

  // Start from the saved dates on each opening (and when they change while open).
  const syncKey = visible ? `${campaign.cardExpiresOn}|${campaign.couponExpiresOn}` : null;
  const [syncedKey, setSyncedKey] = useState(syncKey);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    if (syncKey) {
      setCard(campaign.cardExpiresOn);
      setCoupon(campaign.couponExpiresOn);
    }
  }

  const today = moroccoToday();
  const cardMin = campaign.cardExpiresOn > today ? campaign.cardExpiresOn : today;
  const sentYmd = campaign.sentAt ? moroccoYmdOf(new Date(campaign.sentAt)) : today;
  const couponMin = addDaysYmd(card, SCRATCH_LIMITS.MIN_COUPON_AFTER_CARD_DAYS);
  const changed = card !== campaign.cardExpiresOn || coupon !== campaign.couponExpiresOn;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.modal, { backgroundColor: theme.bgCard }]} onPress={(e) => e.stopPropagation()} accessibilityViewIsModal>
          <Text style={[styles.modalTitle, { color: theme.text }]}>{t('scratch.detail.extendTitle')}</Text>
          <Text style={[styles.modalBody, { color: theme.textSecondary }]}>{t('scratch.detail.extendHint')}</Text>
          <DateField
            label={t('scratch.wizard.cardDeadline')}
            value={card}
            minYmd={cardMin}
            maxYmd={addDaysYmd(sentYmd, SCRATCH_LIMITS.MAX_CARD_DAYS)}
            onChange={(v) => {
              setCard(v);
              const minCoupon = addDaysYmd(v, SCRATCH_LIMITS.MIN_COUPON_AFTER_CARD_DAYS);
              if (minCoupon > coupon) setCoupon(minCoupon);
            }}
          />
          <DateField
            label={t('scratch.wizard.couponDeadline')}
            value={coupon}
            minYmd={couponMin > campaign.couponExpiresOn ? couponMin : campaign.couponExpiresOn}
            maxYmd={addDaysYmd(sentYmd, SCRATCH_LIMITS.MAX_COUPON_DAYS)}
            onChange={setCoupon}
          />
          <Button
            label={t('scratch.detail.extendSave')}
            disabled={!changed}
            loading={loading}
            onPress={() => onSave({
              cardExpiresOn: card !== campaign.cardExpiresOn ? card : undefined,
              couponExpiresOn: coupon !== campaign.couponExpiresOn ? coupon : undefined,
            })}
          />
          <Button variant="ghost" label={t('common.cancel')} onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 14 },
  actions: { gap: 10 },
  info: { fontSize: ms(14), lineHeight: ms(20), fontFamily: font.regular },
  hint: { fontSize: ms(13), lineHeight: ms(19), fontFamily: font.regular },
  kpiRow: { gap: 8 },
  kpi: { flex: 1, borderRadius: 12, padding: 10, gap: 4 },
  kpiValue: { fontSize: ms(15), fontFamily: font.bold },
  kpiLabel: { fontSize: ms(11), fontFamily: font.regular },
  funnel: { gap: 10 },
  funnelStep: { gap: 4 },
  funnelHeader: { justifyContent: 'space-between' },
  funnelLabel: { fontSize: ms(13), fontFamily: font.medium },
  funnelValue: { fontSize: ms(13), fontFamily: font.semibold },
  funnelTrack: { height: 10, borderRadius: 999, overflow: 'hidden' },
  funnelFill: { height: 10, borderRadius: 999 },
  rewardRow: { gap: 4, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rewardTop: { alignItems: 'center', gap: 8 },
  rewardLabel: { flex: 1, fontSize: ms(14), fontFamily: font.semibold },
  rewardValue: { fontSize: ms(13), fontFamily: font.semibold },
  rewardMeta: { fontSize: ms(12), fontFamily: font.regular },
  clientRow: { alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  clientName: { fontSize: ms(14), fontFamily: font.medium },
  waBtn: { alignItems: 'center', gap: 6, backgroundColor: '#25D366', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36 },
  waText: { color: '#FFFFFF', fontSize: ms(13), fontFamily: font.semibold },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 20 },
  modal: { borderRadius: 24, padding: 20, gap: 12 },
  modalTitle: { fontSize: ms(17), fontFamily: font.bold, textAlign: 'center' },
  modalBody: { fontSize: ms(14), lineHeight: ms(20), fontFamily: font.regular, textAlign: 'center' },
});
