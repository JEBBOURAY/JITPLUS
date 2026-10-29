import { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BellRing, CheckCircle2, X } from 'lucide-react-native';
import { moroccoCityLabel } from '@jitplus/shared/src/deals';
import { Text } from '@/components/AppText';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuthStore } from '@/stores/authStore';
import { useDealAlerts, useUpdateDealAlerts } from '@/hooks/useDealHooks';
import {
  DEAL_ALERT_CARD_DISMISSED_KEY, isAlertCardSnoozed, isDealAlertNeedsCityError, shouldShowAlertCard,
} from '@/utils/dealAlerts';
import { extractErrorMessage } from '@/utils/errorMessage';
import { useAppFonts } from '@/utils/fonts';
import { haptic, hapticSuccess } from '@/utils/haptics';
import { fontSize, hp, ms, wp } from '@/utils/responsive';

interface Props {
  /** City offered for one-tap activation; null sends the user to the preferences screen. */
  suggestedCityKey: string | null;
}

type Phase = 'idle' | 'saving' | 'done';

/**
 * Header card of the deals feed for clients without city alerts. It owns its
 * data and state so activating or closing it never re-renders the list.
 */
function DealAlertCard({ suggestedCityKey }: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t, locale } = useLanguage();
  const router = useRouter();
  const notifPush = useAuthStore((s) => s.client?.notifPush ?? true);
  const { data: prefs } = useDealAlerts();
  const update = useUpdateDealAlerts();
  const [snoozed, setSnoozed] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [enabledCity, setEnabledCity] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(DEAL_ALERT_CARD_DISMISSED_KEY)
      .then((v) => { if (alive) setSnoozed(isAlertCardSnoozed(v)); })
      .catch(() => { if (alive) setSnoozed(false); });
    return () => { alive = false; };
  }, []);

  const customize = useCallback(() => { haptic(); router.push('/deal-alerts'); }, [router]);

  const dismiss = useCallback(() => {
    haptic();
    if (phase === 'done') { setPhase('idle'); return; }
    setSnoozed(true);
    AsyncStorage.setItem(DEAL_ALERT_CARD_DISMISSED_KEY, String(Date.now())).catch(() => {});
  }, [phase]);

  const activate = useCallback(() => {
    if (!suggestedCityKey) { customize(); return; }
    haptic();
    const cityKey = suggestedCityKey;
    setPhase('saving');
    update.mutate({ enabled: true, cityKey }, {
      onSuccess: () => { hapticSuccess(); setEnabledCity(cityKey); setPhase('done'); },
      onError: (error) => {
        setPhase('idle');
        Alert.alert(t('common.error'), isDealAlertNeedsCityError(error) ? t('deals.alerts.needsCity') : extractErrorMessage(error));
      },
    });
  }, [suggestedCityKey, customize, update, t]);

  // The optimistic update turns `enabled` on before the answer: keep the card while saving.
  if (phase === 'idle' && !shouldShowAlertCard(prefs, snoozed)) return null;

  const done = phase === 'done';
  const city = suggestedCityKey ? moroccoCityLabel(suggestedCityKey, locale) : '';
  const title = done
    ? t('deals.alerts.card.doneTitle', { city: moroccoCityLabel(enabledCity, locale) })
    : city ? t('deals.alerts.card.title', { city }) : t('deals.alerts.card.titleNoCity');
  const body = done
    ? (notifPush ? t('deals.alerts.card.doneBody') : t('deals.alerts.card.donePushOff'))
    : t('deals.alerts.card.body');
  const Icon = done ? CheckCircle2 : BellRing;
  const accent = done ? palette.emerald : palette.violet;

  return (
    <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: `${accent}40` }]}>
      <View style={styles.top}>
        <View style={[styles.icon, { backgroundColor: `${accent}18` }]}>
          <Icon size={ms(18)} color={accent} strokeWidth={2} />
        </View>
        <View style={styles.texts}>
          <Text style={[styles.title, { color: theme.text, fontFamily: fonts.semibold }]}>{title}</Text>
          <Text style={[styles.body, { color: theme.textSecondary, fontFamily: fonts.regular }]}>{body}</Text>
        </View>
        <Pressable onPress={dismiss} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
          <X size={ms(16)} color={theme.textMuted} strokeWidth={2} />
        </Pressable>
      </View>
      <View style={styles.actions}>
        {!done && (
          <Pressable
            onPress={activate}
            disabled={phase === 'saving'}
            style={({ pressed }) => [styles.primary, { opacity: pressed ? 0.85 : 1 }]}
            accessibilityRole="button"
            accessibilityState={{ busy: phase === 'saving' }}
          >
            {phase === 'saving'
              ? <ActivityIndicator size="small" color="#FFFFFF" />
              : <Text style={[styles.primaryText, { fontFamily: fonts.semibold }]}>
                  {suggestedCityKey ? t('deals.alerts.card.activate') : t('deals.alerts.card.chooseCity')}
                </Text>}
          </Pressable>
        )}
        <Pressable onPress={customize} hitSlop={8} style={styles.link} accessibilityRole="link">
          <Text style={[styles.linkText, { color: palette.violet, fontFamily: fonts.semibold }]}>{t('deals.alerts.card.customize')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default memo(DealAlertCard);

const styles = StyleSheet.create({
  card: { borderRadius: ms(16), borderWidth: 1, padding: ms(14), marginBottom: hp(12) },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: wp(12) },
  icon: { width: ms(36), height: ms(36), borderRadius: ms(11), alignItems: 'center', justifyContent: 'center' },
  texts: { flex: 1 },
  title: { fontSize: fontSize.md, lineHeight: ms(21), textAlign: 'left' },
  body: { fontSize: ms(13), lineHeight: ms(18), marginTop: hp(2), textAlign: 'left' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: wp(16), marginTop: hp(12), marginStart: ms(36) + wp(12) },
  primary: {
    minWidth: wp(96), minHeight: ms(36), paddingHorizontal: wp(16), borderRadius: ms(12),
    alignItems: 'center', justifyContent: 'center', backgroundColor: palette.violet,
  },
  primaryText: { color: '#FFFFFF', fontSize: ms(13) },
  link: { paddingVertical: hp(6) },
  linkText: { fontSize: ms(13) },
});
