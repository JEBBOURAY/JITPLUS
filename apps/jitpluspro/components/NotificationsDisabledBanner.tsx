import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { BellOff } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font } from '@/constants/design';
import { useNotificationPermission } from '@/hooks/useNotificationPermission';

const WARN = '#D97706';

/**
 * Shown when the device blocks JitPlus Pro notifications. When the OS can
 * still ask, the button opens the system dialog; otherwise it opens the
 * app's system settings (the only way back after an iOS refusal).
 */
function NotificationsDisabledBanner({ style }: { style?: object }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  const { status, canAskAgain, request, openSystemSettings } = useNotificationPermission();

  if (status === null || status === 'granted') return null;
  const canPrompt = canAskAgain;

  return (
    <View style={[styles.card, { backgroundColor: WARN + '14', borderColor: WARN + '40', flexDirection: row }, style]}>
      <BellOff size={20} color={WARN} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.4}>
          {t('notifSettings.disabledTitle')}
        </Text>
        <Text style={[styles.body, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>
          {t('notifSettings.disabledBody')}
        </Text>
        <TouchableOpacity
          onPress={canPrompt ? () => { request().catch(() => {}); } : openSystemSettings}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.action}
        >
          <Text style={[styles.actionText, { color: WARN, textAlign }]} maxFontSizeMultiplier={1.4}>
            {t(canPrompt ? 'notifSettings.enableAction' : 'notifSettings.openSettingsAction')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default React.memo(NotificationsDisabledBanner);

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12, alignItems: 'flex-start' },
  text: { flex: 1 },
  title: { fontSize: 14, fontFamily: font.semibold },
  body: { fontSize: 13, lineHeight: 18, fontFamily: font.regular, marginTop: 2 },
  action: { marginTop: 8 },
  actionText: { fontSize: 13.5, fontFamily: font.semibold },
});
