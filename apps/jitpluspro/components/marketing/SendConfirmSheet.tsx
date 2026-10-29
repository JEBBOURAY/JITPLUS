import { memo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { Mail, Info, Check, Send, History } from 'lucide-react-native';
import { JitBell, JitClients } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { ActionButton } from '@/components/ui/ActionButton';

interface SendConfirmSheetProps {
  visible: boolean;
  isEmail: boolean;
  heading: string;
  body: string;
  audience: string;
  isSending: boolean;
  /** Set once the send succeeded: switches the sheet to its success state. */
  successMessage: string | null;
  onConfirm: () => void;
  onClose: () => void;
  onViewHistory: () => void;
}

const noop = () => {};

/** Bottom sheet that recaps a campaign before sending, then confirms success. */
function SendConfirmSheet({
  visible,
  isEmail,
  heading,
  body,
  audience,
  isSending,
  successMessage,
  onConfirm,
  onClose,
  onViewHistory,
}: SendConfirmSheetProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  const insets = useSafeAreaInsets();
  const succeeded = successMessage != null;
  const ChannelIcon = isEmail ? Mail : JitBell;
  // The request cannot be cancelled once started, so the sheet stays open until it settles.
  const close = isSending ? noop : onClose;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={t('common.close')}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.bgCard, borderColor: theme.borderLight, paddingBottom: insets.bottom + 24 }]}
          onPress={(e) => e.stopPropagation()}
          accessibilityViewIsModal
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          {succeeded ? (
            <View style={styles.successWrap} accessibilityLiveRegion="assertive">
              <View style={[styles.successIcon, { backgroundColor: `${theme.primary}1A` }]}>
                <Check size={34} color={theme.primary} strokeWidth={icon.stroke} />
              </View>
              <Text style={[styles.title, styles.centered, { color: theme.text }]} maxFontSizeMultiplier={1.4} accessibilityRole="header">
                {t(isEmail ? 'messages.emailSuccessTitle' : 'messages.pushSuccessTitle')}
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
              <View style={[styles.titleRow, { flexDirection: row }]}>
                <View style={[styles.channelIcon, { backgroundColor: `${theme.primary}1A` }]}>
                  <ChannelIcon size={18} color={theme.primary} strokeWidth={icon.stroke} />
                </View>
                <Text style={[styles.title, styles.flex1, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.4} accessibilityRole="header">
                  {t('messages.confirmSheetTitle')}
                </Text>
              </View>

              <View style={[styles.recap, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
                <Text style={[styles.recapHeading, { color: theme.text, textAlign }]} numberOfLines={2} maxFontSizeMultiplier={1.4}>{heading}</Text>
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
                onPress={onConfirm}
                style={styles.cta}
              />
              <TouchableOpacity onPress={close} disabled={isSending} style={styles.secondaryBtn} accessibilityRole="button">
                <Text style={[styles.secondaryText, { color: isSending ? theme.border : theme.textMuted }]} maxFontSizeMultiplier={1.3}>
                  {t('messages.editMessage')}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default memo(SendConfirmSheet);

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 999, marginBottom: 18 },
  flex1: { flex: 1 },
  centered: { textAlign: 'center' },
  titleRow: { alignItems: 'center', gap: 12, marginBottom: 16 },
  channelIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontFamily: font.bold, letterSpacing: -0.4 },
  recap: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  recapHeading: { fontSize: 15, fontFamily: font.semibold },
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
  successWrap: { alignItems: 'center', paddingTop: 6 },
  successIcon: { width: 76, height: 76, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successMsg: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 6, marginBottom: 8, fontFamily: font.regular, paddingHorizontal: 8 },
});
