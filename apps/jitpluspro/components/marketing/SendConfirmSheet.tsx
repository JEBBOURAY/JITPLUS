import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Info, Check, Send, History } from 'lucide-react-native';
import { JitBell, JitClients } from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { ActionButton } from '@/components/ui/ActionButton';
import BottomSheet from '@/components/ui/BottomSheet';

interface SendConfirmSheetProps {
  visible: boolean;
  title: string;
  body: string;
  /** Who receives the notification, with the customer count when it is known. */
  audience: string;
  isSending: boolean;
  /** Why the send is refused or impossible, shown above the recap. */
  error: string | null;
  /** Nothing can be sent right now: `error` says why. */
  blocked: boolean;
  /** Set once the send succeeded: switches the step to its success state. */
  successMessage: string | null;
  onConfirm: () => void;
  onClose: () => void;
  onViewHistory: () => void;
}

/** Bottom sheet that recaps a notification before sending, then confirms success. */
function SendConfirmSheet({
  visible,
  title,
  body,
  audience,
  isSending,
  error,
  blocked,
  successMessage,
  onConfirm,
  onClose,
  onViewHistory,
}: SendConfirmSheetProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();

  return (
    // The request cannot be cancelled once started, so the sheet stays open until it settles.
    <BottomSheet visible={visible} onClose={onClose} dismissable={!isSending}>
      {successMessage != null ? (
        <View style={styles.successWrap} accessibilityLiveRegion="assertive">
          <View style={[styles.successIcon, { backgroundColor: `${theme.primary}1A` }]}>
            <Check size={34} color={theme.primary} strokeWidth={icon.stroke} />
          </View>
          <Text style={[styles.heading, styles.centered, { color: theme.text }]} maxFontSizeMultiplier={1.4} accessibilityRole="header">
            {t('messages.pushSuccessTitle')}
          </Text>
          <Text style={[styles.successMsg, { color: theme.textMuted }]} maxFontSizeMultiplier={1.5}>
            {successMessage}
          </Text>
          <ActionButton label={t('messages.done')} size="lg" onPress={onClose} style={styles.cta} />
          <TouchableOpacity onPress={onViewHistory} style={[styles.secondaryBtn, { flexDirection: row }]} accessibilityRole="button">
            <History size={16} color={theme.primary} strokeWidth={icon.stroke} />
            <Text style={[styles.secondaryText, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>{t('messages.viewHistory')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {error ? (
            <Text
              style={[styles.error, { color: theme.danger, backgroundColor: `${theme.danger}14` }]}
              maxFontSizeMultiplier={1.4}
              accessibilityRole="alert"
              accessibilityLiveRegion="assertive"
            >
              {error}
            </Text>
          ) : null}
          <View style={[styles.headingRow, { flexDirection: row }]}>
            <View style={[styles.channelIcon, { backgroundColor: `${theme.primary}1A` }]}>
              <JitBell size={18} color={theme.primary} strokeWidth={icon.stroke} />
            </View>
            <Text style={[styles.heading, styles.flex1, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.4} accessibilityRole="header">
              {t('messages.confirmSheetTitle')}
            </Text>
          </View>

          <View style={[styles.recap, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
            <Text style={[styles.recapTitle, { color: theme.text, textAlign }]} numberOfLines={2} maxFontSizeMultiplier={1.4}>{title}</Text>
            <Text style={[styles.recapBody, { color: theme.textSecondary, textAlign }]} numberOfLines={4} maxFontSizeMultiplier={1.4}>{body}</Text>
          </View>

          <View style={[styles.infoRow, { flexDirection: row }]}>
            <JitClients size={16} color={theme.textMuted} strokeWidth={icon.stroke} />
            <Text style={[styles.infoText, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.4}>{audience}</Text>
          </View>
          <View style={[styles.infoRow, { flexDirection: row }]}>
            <Info size={16} color={theme.textMuted} strokeWidth={icon.stroke} />
            <Text style={[styles.infoText, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>{t('messages.confirmIrreversible')}</Text>
          </View>

          <ActionButton
            label={t('messages.sendNow')}
            accessibilityLabel={isSending ? t('messages.sendingShort') : t('messages.sendNow')}
            icon={Send}
            size="lg"
            loading={isSending}
            disabled={blocked}
            onPress={onConfirm}
            style={styles.cta}
          />
          <TouchableOpacity onPress={onClose} disabled={isSending} style={styles.secondaryBtn} accessibilityRole="button">
            <Text style={[styles.secondaryText, { color: isSending ? theme.border : theme.textMuted }]} maxFontSizeMultiplier={1.3}>
              {t('messages.editMessage')}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.legal, { color: theme.textMuted }]} maxFontSizeMultiplier={1.6}>
            {t('messages.legalNote')}
          </Text>
        
        </>
      )}
    </BottomSheet>
  );
}

export default memo(SendConfirmSheet);

const styles = StyleSheet.create({
  error: { fontSize: 13, lineHeight: 18, fontFamily: font.medium, borderRadius: 12, padding: 12, marginBottom: 14, overflow: 'hidden' },
  flex1: { flex: 1 },
  centered: { textAlign: 'center' },
  headingRow: { alignItems: 'center', gap: 12, marginBottom: 16 },
  channelIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  heading: { fontSize: 19, fontFamily: font.semibold, letterSpacing: -0.4 },
  recap: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  recapTitle: { fontSize: 15, fontFamily: font.semibold },
  recapBody: { fontSize: 13, lineHeight: 19, marginTop: 4, fontFamily: font.regular },
  infoRow: { alignItems: 'flex-start', gap: 10, marginBottom: 10, paddingHorizontal: 2 },
  infoText: { flex: 1, fontSize: 13, lineHeight: 18, fontFamily: font.medium },
  cta: { marginTop: 10, alignSelf: 'stretch' },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    marginTop: 6,
  },
  secondaryText: { fontSize: 14, fontFamily: font.semibold },
  legal: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 4, fontFamily: font.regular },
  successWrap: { alignItems: 'center', paddingTop: 6 },
  successIcon: { width: 76, height: 76, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successMsg: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6, marginBottom: 8, fontFamily: font.regular, paddingHorizontal: 8 },
});
