import {
  View, Text, TextInput, TouchableOpacity, Modal, Pressable, ActivityIndicator,
} from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ms, hp } from '@/utils/responsive';
import { profileStyles as styles } from './profileStyles';

interface Props {
  visible: boolean;
  targetValue: string;
  otpCode: string;
  otpError: string;
  isVerifying: boolean;
  isSending: boolean;
  resendTimer: number;
  onChangeCode: (code: string) => void;
  onVerify: () => void;
  onResend: () => void;
  onClose: () => void;
}

export default function OtpVerificationModal({
  visible, targetValue, otpCode, otpError,
  isVerifying, isSending, resendTimer,
  onChangeCode, onVerify, onResend, onClose,
}: Props) {
  const theme = useTheme();
  const { t } = useLanguage();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} accessibilityLabel={t('common.close')}>
        <Pressable style={[styles.otpModalCard, { backgroundColor: theme.bgCard }]} onPress={(e) => e.stopPropagation()} accessibilityRole="summary" accessibilityViewIsModal={true} accessibilityLabel={t('profile.otpVerifyTitle')}>
          <View style={[styles.modalIconCircle, { backgroundColor: `${palette.gold}15` }]}>
            <ShieldCheck size={ms(16)} color={palette.gold} strokeWidth={1.5} />
          </View>
          <Text style={[styles.modalTitle, { color: theme.text }]}>{t('profile.otpVerifyTitle')}</Text>
          <Text style={[styles.otpModalDesc, { color: theme.textMuted }]}>
            {t('profile.otpVerifyDesc', { value: targetValue })}
          </Text>

          <TextInput
            style={[styles.otpInput, {
              color: theme.text,
              borderColor: otpError ? theme.danger : otpCode.length === 6 ? palette.violet : theme.border,
              backgroundColor: theme.bgInput,
            }]}
            value={otpCode}
            onChangeText={(v) => onChangeCode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder={t('profile.otpVerifyPlaceholder')}
            placeholderTextColor={theme.textMuted}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            textAlign="center"
          />
          {!!otpError && (
            <Text style={[styles.otpErrorText, { color: theme.danger }]}>{otpError}</Text>
          )}

          <View style={styles.otpResendRow}>
            {resendTimer > 0 ? (
              <Text style={[styles.otpResendText, { color: theme.textMuted }]}>
                {t('profile.otpResendTimer', { seconds: resendTimer })}
              </Text>
            ) : (
              <TouchableOpacity onPress={onResend} disabled={isSending} activeOpacity={0.7}>
                {isSending ? (
                  <ActivityIndicator size="small" color={palette.violet} />
                ) : (
                  <Text style={[styles.otpResendText, { color: palette.violet }]}>
                    {t('profile.otpResend')}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: theme.bgInput }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.modalBtnText, { color: theme.text }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalBtn, {
                backgroundColor: otpCode.length === 6 ? palette.violet : `${palette.violet}30`,
              }]}
              onPress={onVerify}
              disabled={otpCode.length !== 6 || isVerifying}
              activeOpacity={0.7}
            >
              {isVerifying ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>{t('common.confirm')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
