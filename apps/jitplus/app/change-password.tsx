import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ScrollView, Keyboard, I18nManager,
} from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { router } from 'expo-router';
import { Lock, ArrowLeft, CheckCircle2 } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/services/api';
import { extractErrorMessage } from '@/utils/errorMessage';
import FormError from '@/components/FormError';
import { PasswordField, PasswordStrengthBar } from '@/components/PasswordField';
import { SafeAreaView } from 'react-native-safe-area-context';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';
import { getPasswordStrength, isValidPassword as checkPassword } from '@/utils/passwordStrength';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

// Directional arrows point the reading way: Arabic reloads the app with forceRTL.
const DIR_FLIP = I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined;

export default function ChangePasswordScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { client, refreshProfile } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect unauthenticated users
  useEffect(() => {
    if (!client?.id) router.replace('/login');
  }, [client]);

  const newRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const strength = getPasswordStrength(newPassword, t);
  const onCurrentChange = useCallback((text: string) => { setCurrentPassword(text); setError(''); }, []);
  const onNewChange = useCallback((text: string) => { setNewPassword(text); setError(''); }, []);
  const onConfirmChange = useCallback((text: string) => { setConfirmPassword(text); setError(''); }, []);
  const focusNew = useCallback(() => newRef.current?.focus(), []);
  const focusConfirm = useCallback(() => confirmRef.current?.focus(), []);

  const requiresCurrent = !!client?.hasPassword;
  const isValidPassword = checkPassword(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const canSubmit = isValidPassword && passwordsMatch && (!requiresCurrent || currentPassword.length > 0);

  const handleSubmit = async () => {
    if (requiresCurrent && !currentPassword.trim()) {
      setError(t('changePassword.errorCurrent'));
      return;
    }
    if (!isValidPassword) {
      setError(t('setPassword.validationError'));
      return;
    }
    if (!passwordsMatch) {
      setError(t('setPassword.mismatchError'));
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      await api.changePassword(
        requiresCurrent ? currentPassword : undefined,
        newPassword,
      );
      await refreshProfile().catch(() => {});
      Keyboard.dismiss();
      Alert.alert(t('changePassword.success'), '', [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (err: unknown) {
      setError(extractErrorMessage(err) || t('changePassword.errorGeneric'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={[styles.gradient, { backgroundColor: theme.bg }]}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={12} disabled={isLoading}>
              <ArrowLeft size={ms(24)} color={isLoading ? theme.textMuted : theme.text} style={DIR_FLIP} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]}>{t('changePassword.title')}</Text>
            <View style={{ width: ms(24) }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>
              {t('changePassword.subtitle')}
            </Text>

            {requiresCurrent && (
              <PasswordField
                icon={Lock}
                label={t('changePassword.currentPassword')}
                value={currentPassword}
                onChangeText={onCurrentChange}
                placeholder={t('changePassword.currentPasswordPlaceholder')}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={focusNew}
              />
            )}

            <PasswordField
              inputRef={newRef}
              icon={Lock}
              label={t('changePassword.newPassword')}
              value={newPassword}
              onChangeText={onNewChange}
              placeholder={t('changePassword.newPasswordPlaceholder')}
              valid={isValidPassword}
              autoFocus={!requiresCurrent}
              returnKeyType="next"
              onSubmitEditing={focusConfirm}
            />

            {newPassword.length > 0 && <PasswordStrengthBar strength={strength} />}

            <PasswordField
              inputRef={confirmRef}
              icon={CheckCircle2}
              label={t('changePassword.confirmPassword')}
              value={confirmPassword}
              onChangeText={onConfirmChange}
              placeholder={t('changePassword.confirmPasswordPlaceholder')}
              valid={passwordsMatch}
              returnKeyType="done"
              onSubmitEditing={canSubmit ? handleSubmit : undefined}
            />

            <FormError message={error} />

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isLoading}
              activeOpacity={0.85}
              style={[styles.button, { backgroundColor: canSubmit ? palette.violet : '#D4D0E8' }]}
            >
              {isLoading ? <ActivityIndicator color="#fff" /> : (
                <Text style={[styles.buttonText, { opacity: canSubmit ? 1 : 0.5 }]}>
                  {t('changePassword.submit')}
                </Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: wp(16),
    paddingVertical: hp(12),
  },
  headerTitle: {
    fontSize: ms(18),
    fontWeight: '600',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: wp(24),
    paddingVertical: hp(12),
  },
  subtitle: {
    fontSize: fontSize.sm,
    lineHeight: ms(22),
    marginBottom: hp(24),
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    height: hp(56),
    marginTop: hp(8),
  },
  buttonText: {
    color: '#fff',
    fontSize: fontSize.lg,
    fontWeight: '600',
  },
});
