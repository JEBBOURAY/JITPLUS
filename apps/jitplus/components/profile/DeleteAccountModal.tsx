import { useState } from 'react';
import {
  View, TouchableOpacity, Modal, ActivityIndicator, KeyboardAvoidingView, Keyboard, Platform, Pressable,
} from 'react-native';
import { AxiosError } from 'axios';
import { Text, TextInput } from '@/components/AppText';
import { AlertTriangle } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { extractErrorMessage } from '@/utils/errorMessage';
import { ms } from '@/utils/responsive';
import { profileStyles as styles } from './profileStyles';

interface Props {
  visible: boolean;
  hasPassword: boolean;
  onClose: () => void;
  /** Rejects on failure; the modal stays open and shows the reason inline. */
  onConfirm: (password: string) => Promise<void>;
}

function deleteErrorMessage(error: unknown, t: (key: string) => string): string {
  // The throttler's raw message is English; give the localized one.
  if (error instanceof AxiosError && error.response?.status === 429) return t('errors.tooManyRequests');
  return extractErrorMessage(error);
}

export default function DeleteAccountModal({ visible, hasPassword, onClose, onConfirm }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const wordMatch = confirmText.trim().toUpperCase() === t('profile.deleteConfirmWord').toUpperCase();
  const canConfirm = wordMatch && (hasPassword ? password.length > 0 : true) && !submitting;

  const handleClose = () => {
    if (submitting) return;
    setConfirmText('');
    setPassword('');
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(password);
      setConfirmText('');
      setPassword('');
    } catch (err) {
      // Wrong password: clear it so the next attempt is a fresh one, not a replay.
      setPassword('');
      setError(deleteErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      {/* Two fields in a centered card: on small iPhones the keyboard covered
          Delete / Cancel. Lift the card above it; a tap outside hides it. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={styles.modalOverlay} onPress={Keyboard.dismiss} accessible={false}>
        <View style={[styles.modalCard, { backgroundColor: theme.bgCard }]} accessibilityRole="alert" accessibilityViewIsModal>
          <View style={[styles.modalIconCircle, { backgroundColor: `${theme.danger}12` }]}>
            <AlertTriangle size={ms(22)} color={theme.danger} strokeWidth={1.8} />
          </View>
          <Text style={[styles.modalTitle, { color: theme.text }]}>{t('profile.deleteModalTitle')}</Text>
          <Text style={[styles.modalBody, { color: theme.textMuted }]}>
            {t('profile.deleteModalBody')}
          </Text>
          <Text style={[styles.modalInstruction, { color: theme.textSecondary }]}>
            {t('profile.deleteConfirmPrompt')}
          </Text>
          <TextInput
            style={[styles.modalInput, {
              color: theme.text,
              borderColor: wordMatch ? theme.danger : theme.border,
              backgroundColor: theme.bgInput,
            }]}
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder={t('profile.deleteConfirmWord')}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {hasPassword ? (
            <>
              <Text style={[styles.modalInstruction, { color: theme.textSecondary, marginTop: ms(8) }]}>
                {t('profile.deletePasswordPrompt')}
              </Text>
              <TextInput
                style={[styles.modalInput, {
                  color: theme.text,
                  borderColor: password.length > 0 ? theme.danger : theme.border,
                  backgroundColor: theme.bgInput,
                }]}
                value={password}
                onChangeText={(v) => { setPassword(v); if (error) setError(null); }}
                placeholder={t('profile.deletePasswordPlaceholder')}
                placeholderTextColor={theme.textMuted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          ) : (
            <Text style={[styles.modalInstruction, { color: theme.danger, marginTop: ms(8) }]}>
              {t('profile.deleteNoPasswordWarning')}
            </Text>
          )}
          {error ? (
            <Text
              style={[styles.modalInstruction, { color: theme.danger, marginTop: ms(8) }]}
              accessibilityLiveRegion="polite"
              accessibilityRole="alert"
            >
              {error}
            </Text>
          ) : null}
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: theme.bgInput }]}
              onPress={handleClose}
              disabled={submitting}
              activeOpacity={0.7}
            >
              <Text style={[styles.modalBtnText, { color: theme.text }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, {
                backgroundColor: canConfirm ? theme.danger : `${theme.danger}30`,
              }]}
              onPress={handleConfirm}
              disabled={!canConfirm}
              accessibilityState={{ disabled: !canConfirm, busy: submitting }}
              activeOpacity={0.7}
            >
              {submitting
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[styles.modalBtnText, { color: '#fff' }]}>{t('common.delete')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
