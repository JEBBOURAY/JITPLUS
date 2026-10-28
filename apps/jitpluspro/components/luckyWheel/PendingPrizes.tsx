import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { useFulfilLuckyWheelPrize } from '@/hooks/useQueryHooks';
import { getErrorMessage } from '@/utils/error';
import { formatDateTime } from '@/utils/date';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { Button } from '@/components/scratch/ScratchUI';
import type { WheelFulfilledDraw, WheelPendingDraw } from './types';
import { WHEEL_TONE } from './colors';

const PAGE = 5;

const clientName = (c?: { prenom?: string | null; nom?: string | null; telephone?: string | null }) =>
  [c?.prenom, c?.nom].filter(Boolean).join(' ') || c?.telephone || '?';

/** Prizes won and not collected yet, each with a "given" button. */
export function PendingPrizeList({ draws, showCampaign }: { draws: WheelPendingDraw[]; showCampaign?: boolean }) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { row, textAlign } = useDir();
  const fulfil = useFulfilLuckyWheelPrize();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const give = useCallback((draw: WheelPendingDraw) => {
    const prize = draw.prize?.label ?? '';
    Alert.alert(t('luckyWheel.pending.giveTitle'), t('luckyWheel.pending.giveConfirm', { prize, client: clientName(draw.ticket?.client) }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.confirm'),
        onPress: async () => {
          setBusyId(draw.id);
          try {
            await fulfil.mutateAsync(draw.id);
          } catch (e) {
            Alert.alert(t('common.error'), getErrorMessage(e, t('luckyWheel.pending.giveError')));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }, [fulfil, t]);

  return (
    <View>
      {draws.slice(0, limit).map((draw) => (
        <View key={draw.id} style={[styles.row, { flexDirection: row, borderBottomColor: theme.borderLight }]}>
          <View style={styles.flex}>
            <Text style={[styles.prize, { color: theme.text, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {draw.prize?.label}
            </Text>
            <Text style={[styles.meta, { color: theme.textMuted, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {clientName(draw.ticket?.client)}
              {showCampaign && draw.ticket?.campaign?.name ? ` · ${draw.ticket.campaign.name}` : ''}
            </Text>
            {draw.claimBefore ? (
              <Text style={[styles.meta, { color: WHEEL_TONE.warning, textAlign }]} maxFontSizeMultiplier={1.3}>
                {t('luckyWheel.pending.until', { date: formatDateTime(draw.claimBefore, locale) })}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            onPress={() => give(draw)}
            disabled={!!busyId}
            style={[styles.giveBtn, { backgroundColor: theme.primary + '10', opacity: busyId && busyId !== draw.id ? 0.5 : 1, flexDirection: row }]}
            accessibilityRole="button"
            accessibilityLabel={`${t('luckyWheel.pending.give')}, ${draw.prize?.label ?? ''}`}
            accessibilityState={{ busy: busyId === draw.id }}
          >
            {busyId === draw.id ? <ActivityIndicator size="small" color={theme.primary} /> : <Check size={16} color={WHEEL_TONE.success} strokeWidth={icon.stroke} />}
            <Text style={[styles.giveText, { color: theme.primary }]} maxFontSizeMultiplier={1.2}>{t('luckyWheel.pending.give')}</Text>
          </TouchableOpacity>
        </View>
      ))}
      {draws.length > limit && (
        <Button variant="ghost" label={t('luckyWheel.pending.showMore', { count: draws.length - limit })} onPress={() => setLimit((l) => l + PAGE * 2)} />
      )}
    </View>
  );
}

export function FulfilledPrizeList({ draws }: { draws: WheelFulfilledDraw[] }) {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { row, textAlign } = useDir();
  const [limit, setLimit] = useState(PAGE);
  return (
    <View>
      {draws.slice(0, limit).map((draw) => (
        <View key={draw.id} style={[styles.row, { flexDirection: row, borderBottomColor: theme.borderLight }]}>
          <View style={styles.flex}>
            <Text style={[styles.prize, { color: theme.text, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {draw.prize?.label} · {clientName(draw.ticket?.client)}
            </Text>
            <Text style={[styles.meta, { color: theme.textMuted, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {formatDateTime(draw.fulfilledAt, locale)}
              {' · '}
              {draw.fulfilledByName ? t('luckyWheel.pending.givenBy', { name: draw.fulfilledByName }) : t('luckyWheel.pending.givenByOwner')}
            </Text>
          </View>
        </View>
      ))}
      {draws.length > limit && (
        <Button variant="ghost" label={t('luckyWheel.pending.showMore', { count: draws.length - limit })} onPress={() => setLimit((l) => l + PAGE * 2)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  row: { alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  prize: { fontSize: ms(14), fontFamily: font.semibold },
  meta: { fontSize: ms(12), fontFamily: font.regular },
  giveBtn: { alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36 },
  giveText: { fontSize: ms(13), fontFamily: font.semibold },
});
