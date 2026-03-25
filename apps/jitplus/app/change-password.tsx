import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ScrollView, Keyboard,
} from 'react-native';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { router } from 'expo-router';
import { Lock, Eye, EyeOff, ArrowLeft, CheckCircle2 } from 'lucide-react-native';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/services/api';
import { extractErrorMessage } from '@/utils/errorMessage';
import FormError from '@/components/FormError';
import { SafeAreaView } from 'react-native-safe-area-context';
import { wp, hp, ms, fontSize, radius } from '@/utils/responsive';

type PasswordStrength = 'weak' | 'medium' | 'strong';

function getPasswordStrength(pw: string, t: (key: string) => string): { level: PasswordStrength; label: string; color: string; pct: number } {
  if (pw.length === 0) return { level: 'weak', label: '', color: '#D1D5DB', pct: 0 };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 2) return { level: 'weak', label: t('setPassword.strengthWeak'), color: '#EF4444', pct: 0.33 };
  if (score <= 3) return { level: 'medium', label: t('setPassword.strengthMedium'), color: '#F59E0B', pct: 0.66 };
  return { level: 'strong', label: t('setPassword.strengthStrong'), color: '#10B981', pct: 1 };
}

export default function ChangePasswordScreen() {
  const theme = useTheme();
  const { t } = useLanguage();
  const { client, refreshProfile } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect unauthenticated users
  useEffect(() => {
    if (!client?.id) router.replace('/login');
  }, [client]);

  const newRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const strength = getPasswordStrength(newPassword, t);
  const clearError = useCallback(() => { if (error) setError(''); }, [error]);

  const requiresCurrent = !!client?.hasPassword;
  const isValidPassword = newPassword.length >= 8 && /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword) && /[^A-Za-z0-9]/.test(newPassword);
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
        { text: 'OK', onPress: () => router.back() },
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
              <ArrowLeft size={ms(24)} color={isLoading ? theme.textMuted : theme.text} />
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

            {/* Current Password */}
            {requiresCurrent && (
              <View style={styles.inputContainer}>
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
                  {t('changePassword.currentPassword')}
                </Text>
                <View style={[styles.inputWrapper, {
                  backgroundColor: theme.inputBg,
                  borderColor: theme.inputBorder,
                  borderWidth: 1.5,
                }]}>
                  <Lock size={ms(18)} color={theme.inputPlaceholder} strokeWidth={1.5} />
                  <TextInput
                    style={[styles.input, { color: theme.text }]}
                    placeholder={t('changePassword.currentPasswordPlaceholder')}
                    placeholderTextColor={theme.inputPlaceholder}
                    value={currentPassword}
                    onChangeText={(text) => { setCurrentPassword(text); clearError(); }}
                    secureTextEntry={!showCurrent}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    returnKeyType="next"
                    onSubmitEditing={() => newRef.current?.focus()}
                  />
                  <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} hitSlop={8}>
                    {showCurrent
                      ? <EyeOff size={ms(20)} color={theme.inputPlaceholder} strokeWidth={1.5} />
                      : <Eye size={ms(20)} color={theme.inputPlaceholder} strokeWidth={1.5} />}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* New Password */}
            <View style={styles.inputContainer}>
              <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
                {t('changePassword.newPassword')}
              </Text>
              <View style={[styles.inputWrapper, {
                backgroundColor: theme.inputBg,
                borderColor: isValidPassword ? palette.violet : theme.inputBorder,
                borderWidth: isValidPassword ? 2 : 1.5,
              }]}>
                <Lock size={ms(18)} color={isValidPassword ? palette.violet : theme.inputPlaceholder} strokeWidth={1.5} />
                <TextInput
                  ref={newRef}
                  style={[styles.input, { color: theme.text }]}
                  placeholder={t('changePassword.newPasswordPlaceholder')}
                  placeholderTextColor={theme.inputPlaceholder}
                  value={newPassword}
                  onChangeText={(text) => { setNewPassword(text); clearError(); }}
                  secureTextEntry={!showNew}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus={!requiresCurrent}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmRef.current?.focus()}
                />
                <TouchableOpacity onPress={() => setShowNew(!showNew)} hitSlop={8}>
                  {showNew
                    ? <EyeOff size={ms(20)} color={theme.inputPlaceholder} strokeWidth={1.5} />
                    : <Eye size={ms(20)} color={theme.inputPlaceholder} strokeWidth={1.5} />}
                </TouchableOpacity>
              </View>
            </View>

            {/* Password Strength */}
            {newPassword.length > 0 && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBarTrack}>
                  <View style={[styles.strengthBarFill, { width: `${strength.pct * 100}%`, backgroundColor: strength.color }]} />
                </View>
                <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
              </View>
            )}

            {/* Confirm Password */}
            <View style={styles.inputContainer}>
              <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>
                {t('changePassword.confirmPassword')}
              </Text>
              <View style={[styles.inputWrapper, {
                backgroundColor: theme.inputBg,
                borderColor: passwordsMatch ? palette.violet : theme.inputBorder,
                borderWidth: passwordsMatch ? 2 : 1.5,
              }]}>
                <CheckCircle2 size={ms(18)} color={passwordsMatch ? palette.violet : theme.inputPlaceholder} strokeWidth={1.5} />
                <TextInput
                  ref={confirmRef}
                  style={[styles.input, { color: theme.text }]}
                  placeholder={t('changePassword.confirmPasswordPlaceholder')}
                  placeholderTextColor={theme.inputPlaceholder}
                  value={confirmPassword}
                  onChangeText={(text) => { setConfirmPassword(text); clearError(); }}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={canSubmit ? handleSubmit : undefined}
                />
                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} hitSlop={8}>
                  {showConfirm
                    ? <EyeOff size={ms(20)} color={theme.inputPlaceholder} strokeWidth={1.5} />
                    : <Eye size={ms(20)} color={theme.inputPlaceholder} strokeWidth={1.5} />}
                </TouchableOpacity>
              </View>
            </View>

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
    fontWeight: '700',
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
  fieldLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    marginBottom: hp(6),
    marginLeft: wp(4),
  },
  inputContainer: { marginBottom: hp(16) },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingHorizontal: wp(14),
    height: hp(58),
  },
  input: {
    flex: 1,
    fontSize: fontSize.md,
    fontWeight: '500',
    marginLeft: wp(10),
  },
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(10),
    marginTop: -hp(8),
    marginBottom: hp(16),
    paddingHorizontal: wp(4),
  },
  strengthBarTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  strengthBarFill: { height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: fontSize.xs, fontWeight: '700', width: wp(48) },
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
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
