import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Bell, Gift, TrendingUp, Sparkles, ShieldCheck, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font } from '@/constants/design';
import { ActionButton } from '@/components/ui/ActionButton';
import BottomSheet from '@/components/ui/BottomSheet';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { loadPromptState, recordPromptDismissed, shouldShowPrompt } from '@/utils/notifPrompt';
import { logWarn } from '@/utils/devLogger';

const BENEFITS: readonly { icon: LucideIcon; key: string }[] = [
  { icon: TrendingUp, key: 'notifPrompt.benefitReports' },
  { icon: Sparkles, key: 'notifPrompt.benefitNews' },
  { icon: Gift, key: 'notifPrompt.benefitTips' },
  { icon: ShieldCheck, key: 'notifPrompt.benefitAlerts' },
];

/** Leaves the home screen time to settle before asking. */
const SHOW_DELAY_MS = 1500;

/**
 * Pre-prompt explaining why JitPlus Pro sends notifications, shown on the home
 * screen after a first success (or a day after the first launch). The system
 * dialog only opens when the merchant taps "Activer". Shares the blocking
 * surface slot of the onboarding store so it never stacks on the intro video.
 */
function NotificationPermissionSheet({ enabled }: { enabled: boolean }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  const { status, canAskAgain, request } = useNotificationPermission();
  const requestSurface = useOnboardingStore((s) => s.request);
  const releaseSurface = useOnboardingStore((s) => s.release);
  const activeSurface = useOnboardingStore((s) => s.active);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    if (!enabled || status === null || checked.current || visible) return;
    if (activeSurface && activeSurface !== 'notif') return; // retry once the other surface closes
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const state = await loadPromptState();
        if (cancelled) return;
        checked.current = true;
        if (shouldShowPrompt(state, { status, canAskAgain }, Date.now()) && requestSurface('notif')) {
          setVisible(true);
        }
      } catch (e) {
        logWarn('NotifPrompt', 'check failed', e);
      }
    }, SHOW_DELAY_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, status, canAskAgain, activeSurface, visible, requestSurface]);

  const close = useCallback(() => {
    setVisible(false);
    releaseSurface('notif');
  }, [releaseSurface]);

  const onLater = useCallback(() => {
    recordPromptDismissed().catch(() => {});
    close();
  }, [close]);

  const onEnable = useCallback(async () => {
    setBusy(true);
    try {
      await request();
    } finally {
      setBusy(false);
      close();
    }
  }, [request, close]);

  return (
    <BottomSheet visible={visible} onClose={onLater} dismissable={!busy}>
      <View style={[styles.bell, { backgroundColor: theme.primaryBg }]}>
        <Bell size={26} color={theme.primary} strokeWidth={2} />
      </View>
      <Text style={[styles.title, { color: theme.text }]} maxFontSizeMultiplier={1.3} accessibilityRole="header">
        {t('notifPrompt.title')}
      </Text>
      <Text style={[styles.subtitle, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
        {t('notifPrompt.subtitle')}
      </Text>

      <View style={styles.list}>
        {BENEFITS.map(({ icon: Icon, key }) => (
          <View key={key} style={[styles.item, { flexDirection: row }]}>
            <View style={[styles.itemIcon, { backgroundColor: theme.primary + '17' }]}>
              <Icon size={16} color={theme.primary} strokeWidth={2} />
            </View>
            <Text style={[styles.itemText, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.4}>
              {t(key)}
            </Text>
          </View>
        ))}
      </View>

      <Text style={[styles.footnote, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
        {t('notifPrompt.footnote')}
      </Text>

      <ActionButton label={t('notifPrompt.enable')} onPress={onEnable} loading={busy} size="lg" />
      <TouchableOpacity onPress={onLater} disabled={busy} activeOpacity={0.7} style={styles.laterBtn} accessibilityRole="button">
        <Text style={[styles.laterText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.3}>
          {t('notifPrompt.later')}
        </Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}

export default React.memo(NotificationPermissionSheet);

const styles = StyleSheet.create({
  bell: { width: 56, height: 56, borderRadius: 999, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 19, fontFamily: font.semibold, letterSpacing: -0.3, textAlign: 'center' },
  subtitle: { fontSize: 13.5, lineHeight: 19, fontFamily: font.regular, marginTop: 6, marginBottom: 18, textAlign: 'center' },
  list: { gap: 12, marginBottom: 16 },
  item: { alignItems: 'center', gap: 12 },
  itemIcon: { width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  itemText: { flex: 1, fontSize: 14, lineHeight: 19, fontFamily: font.medium },
  footnote: { fontSize: 12, lineHeight: 17, fontFamily: font.regular, textAlign: 'center', marginBottom: 16 },
  laterBtn: { alignSelf: 'center', paddingVertical: 12, marginTop: 4 },
  laterText: { fontSize: 14, fontFamily: font.semibold },
});
