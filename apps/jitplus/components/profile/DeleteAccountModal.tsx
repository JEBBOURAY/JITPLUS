import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal,
} from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms } from '@/utils/responsive';
import { profileStyles as styles } from './profileStyles';

interface Props {
  visible: boolean;
  hasPassword: boolean;
  onClose: () => void;
  onConfirm: (password: string) => void;
}

export default function DeleteAccountModal({ visible, hasPassword, onClose, onConfirm }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');

  const wordMatch = confirmText.trim().toUpperCase() === t('profile.deleteConfirmWord').toUpperCase();
  const canConfirm = wordMatch && (hasPassword ? password.length > 0 : true);

  const handleClose = () => {
    setConfirmText('');
    setPassword('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: theme.bgCard }]} accessibilityRole="alert" accessibilityViewIsModal>
          <View style={[styles.modalIconCircle, { backgroundColor: `${theme.danger}12` }]}>
            <AlertTriangle size={ms(16)} color={theme.danger} strokeWidth={1.5} />
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
                onChangeText={setPassword}
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
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: theme.bgInput }]}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.modalBtnText, { color: theme.text }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, {
                backgroundColor: canConfirm ? theme.danger : `${theme.danger}30`,
              }]}
              onPress={() => { onConfirm(password); setConfirmText(''); setPassword(''); }}
              disabled={!canConfirm}
              activeOpacity={0.7}
            >
              <Text style={[styles.modalBtnText, { color: '#fff' }]}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
