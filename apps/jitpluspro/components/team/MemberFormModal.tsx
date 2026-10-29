import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Mail, User, ArrowLeft, Check, X, Eye, EyeOff } from 'lucide-react-native';
import { JitLock } from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_PASSWORD_LENGTH } from '@/constants/app';
import { isValidEmail } from '@/utils/validation';
import { font, icon } from '@/constants/design';
import { useDir } from '@/hooks/useDir';
import type { TeamMember } from '@/types';

const HAS_UPPER = /[A-Z]/;
const HAS_DIGIT = /\d/;
const HAS_SPECIAL = /[^A-Za-z0-9]/;
const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const ALLOWED_PERMS = ['team.permScanQR', 'team.permAwardStamps', 'team.permViewClients'] as const;
const DENIED_PERMS = ['team.permNoProfile', 'team.permNoSettings', 'team.permNoTeam'] as const;
const STRENGTH_BARS = [0, 1, 2, 3] as const;

type PwChecks = {
  length: boolean;
  upper: boolean;
  digit: boolean;
  special: boolean;
  score: 0 | 1 | 2 | 3 | 4;
};

function computePasswordChecks(pw: string): PwChecks {
  const length = pw.length >= MIN_PASSWORD_LENGTH;
  const upper = HAS_UPPER.test(pw);
  const digit = HAS_DIGIT.test(pw);
  const special = HAS_SPECIAL.test(pw);
  const score = ((length ? 1 : 0) + (upper ? 1 : 0) + (digit ? 1 : 0) + (special ? 1 : 0)) as
    | 0
    | 1
    | 2
    | 3
    | 4;
  return { length, upper, digit, special, score };
}

const PasswordStrength = React.memo(function PasswordStrength({
  checks,
  visible,
}: {
  checks: PwChecks;
  visible: boolean;
}) {
  const theme = useTheme();
  const dir = useDir();
  const { t } = useLanguage();

  const { color, label } = useMemo(() => {
    switch (checks.score) {
      case 0:
      case 1:
        return { color: theme.danger, label: t('team.pwStrengthWeak') };
      case 2:
        return { color: theme.warning, label: t('team.pwStrengthFair') };
      case 3:
        return { color: theme.warning, label: t('team.pwStrengthGood') };
      case 4:
      default:
        return { color: theme.success, label: t('team.pwStrengthStrong') };
    }
  }, [checks.score, theme.danger, theme.warning, theme.success, t]);

  const items = useMemo<{ key: keyof Omit<PwChecks, 'score'>; label: string }[]>(
    () => [
      { key: 'length', label: t('team.pwCheckLength', { min: MIN_PASSWORD_LENGTH }) },
      { key: 'upper', label: t('team.pwCheckUpper') },
      { key: 'digit', label: t('team.pwCheckDigit') },
      { key: 'special', label: t('team.pwCheckSpecial') },
    ],
    [t],
  );

  if (!visible) return null;

  return (
    <View style={styles.pwStrengthContainer}>
      <View style={[styles.pwStrengthBars, { flexDirection: dir.row }]}>
        {STRENGTH_BARS.map((i) => (
          <View
            key={i}
            style={[
              styles.pwStrengthBar,
              {
                backgroundColor: i < checks.score ? color : theme.borderLight,
              },
            ]}
          />
        ))}
        <Text
          style={[styles.pwStrengthLabel, dir.isRTL ? styles.pwStrengthLabelRtl : styles.pwStrengthLabelLtr, { color }]}
          maxFontSizeMultiplier={1.3}
        >
          {label}
        </Text>
      </View>
      <View style={styles.pwCheckList}>
        {items.map((it) => {
          const ok = checks[it.key];
          return (
            <View key={it.key} style={[styles.pwCheckRow, { flexDirection: dir.row }]}>
              {ok ? (
                <Check size={13} color={theme.success} strokeWidth={icon.strokeSmall} />
              ) : (
                <X size={13} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
              )}
              <Text
                style={[styles.pwCheckText, { color: ok ? theme.success : theme.textMuted, textAlign: dir.textAlign }]}
                maxFontSizeMultiplier={1.3}
              >
                {it.label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

export type MemberFormPayload = {
  nom: string;
  email: string;
  password: string;
  isEdit: boolean;
  memberId?: string;
};

// Form state lives here so typing does not re-render the member list.
export default function AddEditMemberModal({
  visible,
  editingMember,
  existingEmails,
  onClose,
  onSubmit,
  submitting,
}: {
  visible: boolean;
  editingMember: TeamMember | null;
  existingEmails: string[];
  onClose: () => void;
  onSubmit: (payload: MemberFormPayload) => Promise<void>;
  submitting: boolean;
}) {
  const theme = useTheme();
  const dir = useDir();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const [nomError, setNomError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [emailTouched, setEmailTouched] = useState(false);
  const [pwFocused, setPwFocused] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  // Reset the form when the modal opens or switches member. Adjusting state
  // during render (instead of in an effect) avoids a stale first frame.
  const [formSource, setFormSource] = useState<{ visible: boolean; member: TeamMember | null }>({
    visible: false,
    member: null,
  });
  if (formSource.visible !== visible || formSource.member !== editingMember) {
    setFormSource({ visible, member: editingMember });
    if (visible) {
      setNom(editingMember?.nom ?? '');
      setEmail(editingMember?.email ?? '');
      setPassword('');
      setShowPw(false);
      setNomError(null);
      setEmailError(null);
      setPasswordError(null);
      setEmailTouched(false);
      setPwFocused(false);
    }
  }

  const pwChecks = useMemo(() => computePasswordChecks(password), [password]);
  const isEdit = !!editingMember;

  // Live validation
  const validateEmail = useCallback(
    (value: string): string | null => {
      const v = value.trim();
      if (!v) return t('team.nameEmailRequired');
      if (!isValidEmail(v)) return t('team.invalidEmail');
      if (!isEdit && existingEmails.includes(v.toLowerCase())) {
        return t('team.emailAlreadyExists');
      }
      return null;
    },
    [t, isEdit, existingEmails],
  );

  const onNomChange = useCallback((v: string) => {
    setNom(v);
    setNomError(null);
  }, []);
  const focusEmail = useCallback(() => emailRef.current?.focus(), []);
  const focusPassword = useCallback(() => passwordRef.current?.focus(), []);

  const onEmailBlur = useCallback(() => {
    setEmailTouched(true);
    setEmailError(validateEmail(email));
  }, [email, validateEmail]);

  const onEmailChange = useCallback(
    (v: string) => {
      setEmail(v);
      if (emailTouched) setEmailError(validateEmail(v));
    },
    [emailTouched, validateEmail],
  );

  const validatePassword = useCallback(
    (value: string): string | null => {
      if (!value) {
        return isEdit ? null : t('team.passwordRequired');
      }
      if (value.length < MIN_PASSWORD_LENGTH) {
        return t('team.passwordMinLength', { min: MIN_PASSWORD_LENGTH });
      }
      const checks = computePasswordChecks(value);
      if (!checks.upper || !checks.digit || !checks.special) {
        return t('team.passwordComplexity');
      }
      return null;
    },
    [isEdit, t],
  );

  const onPasswordChange = useCallback(
    (v: string) => {
      setPassword(v);
      if (passwordError) setPasswordError(validatePassword(v));
    },
    [passwordError, validatePassword],
  );

  const handleSubmit = useCallback(async () => {
    const trimmedNom = nom.trim();
    const nomErr = !trimmedNom ? t('team.nameEmailRequired') : null;
    const emailErr = validateEmail(email);
    const pwErr = validatePassword(password);

    setNomError(nomErr);
    setEmailError(emailErr);
    setPasswordError(pwErr);
    setEmailTouched(true);

    if (nomErr || emailErr || pwErr) return;

    await onSubmit({
      nom: trimmedNom,
      email: email.trim(),
      password,
      isEdit,
      memberId: editingMember?.id,
    });
  }, [nom, email, password, isEdit, editingMember, onSubmit, t, validateEmail, validatePassword]);

  const togglePwVisibility = useCallback(() => setShowPw((s) => !s), []);
  const onPwFocus = useCallback(() => setPwFocused(true), []);
  const onPwBlur = useCallback(() => {
    setPwFocused(false);
    setPasswordError(validatePassword(password));
  }, [password, validatePassword]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent={false}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.modalOverlay, { backgroundColor: theme.bg, paddingTop: insets.top }]}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View
          style={[
            styles.modalHeader,
            { flexDirection: dir.row, backgroundColor: theme.bgCard, borderBottomColor: theme.borderLight },
          ]}
        >
          <TouchableOpacity
            onPress={onClose}
            style={styles.backBtn}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <ArrowLeft size={24} color={theme.text} strokeWidth={icon.stroke} style={dir.flip} />
          </TouchableOpacity>
          <Text
            style={[styles.modalTitle, dir.isRTL ? styles.startGapRtl : styles.startGapLtr, { color: theme.text, textAlign: dir.textAlign }]}
            maxFontSizeMultiplier={1.3}
            numberOfLines={1}
          >
            {isEdit ? t('team.editMember') : t('team.addMember')}
          </Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            style={[
              styles.addBtn,
              { backgroundColor: theme.primary },
              submitting && { opacity: 0.5 },
            ]}
            activeOpacity={0.7}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={isEdit ? t('team.submitEdit') : t('team.submitAdd')}
            accessibilityState={{ disabled: submitting, busy: submitting }}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Check size={20} color="#fff" strokeWidth={icon.stroke} />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.modalContent}
        >
          <Text style={[styles.label, { color: theme.text, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
            {t('team.nameLabel')} *
          </Text>
          <View
            style={[
              styles.inputWrapper,
              {
                flexDirection: dir.row,
                backgroundColor: theme.bgInput,
                borderColor: nomError ? theme.danger : theme.border,
              },
            ]}
          >
            <User size={18} color={theme.textMuted} strokeWidth={icon.stroke} />
            <TextInput
              style={[styles.input, { color: theme.text, textAlign: dir.textAlign }]}
              placeholder={t('teamPlaceholders.namePlaceholder')}
              placeholderTextColor={theme.textMuted}
              value={nom}
              onChangeText={onNomChange}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={focusEmail}
              maxLength={100}
              maxFontSizeMultiplier={1.3}
              accessibilityLabel={t('team.nameLabel')}
            />
          </View>
          {nomError && <FieldError theme={theme} message={nomError} />}

          <Text style={[styles.label, { color: theme.text, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
            {t('team.emailLabel')} *
          </Text>
          <View
            style={[
              styles.inputWrapper,
              {
                flexDirection: dir.row,
                backgroundColor: theme.bgInput,
                borderColor: emailError ? theme.danger : theme.border,
              },
            ]}
          >
            <Mail size={18} color={theme.textMuted} strokeWidth={icon.stroke} />
            <TextInput
              ref={emailRef}
              style={[styles.input, { color: theme.text, textAlign: dir.textAlign }]}
              placeholder={t('teamPlaceholders.emailPlaceholder')}
              placeholderTextColor={theme.textMuted}
              value={email}
              onChangeText={onEmailChange}
              onBlur={onEmailBlur}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={focusPassword}
              maxLength={255}
              maxFontSizeMultiplier={1.3}
              accessibilityLabel={t('team.emailLabel')}
            />
          </View>
          {emailError && <FieldError theme={theme} message={emailError} />}

          <Text style={[styles.label, { color: theme.text, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
            {isEdit ? t('team.passwordOptional') : `${t('team.passwordLabel')} *`}
          </Text>
          <View
            style={[
              styles.inputWrapper,
              {
                flexDirection: dir.row,
                backgroundColor: theme.bgInput,
                borderColor: passwordError ? theme.danger : theme.border,
              },
            ]}
          >
            <JitLock size={18} color={theme.textMuted} strokeWidth={icon.stroke} />
            <TextInput
              ref={passwordRef}
              style={[styles.input, { color: theme.text, textAlign: dir.textAlign }]}
              placeholder={t('teamPlaceholders.passwordPlaceholder')}
              placeholderTextColor={theme.textMuted}
              value={password}
              onChangeText={onPasswordChange}
              onFocus={onPwFocus}
              onBlur={onPwBlur}
              secureTextEntry={!showPw}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              passwordRules={`minlength: ${MIN_PASSWORD_LENGTH}; required: upper; required: digit; required: special;`}
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              maxLength={100}
              maxFontSizeMultiplier={1.3}
              accessibilityLabel={t('team.passwordLabel')}
            />
            <TouchableOpacity
              onPress={togglePwVisibility}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={showPw ? t('team.hidePassword') : t('team.showPassword')}
            >
              {showPw ? (
                <EyeOff size={18} color={theme.textMuted} strokeWidth={icon.stroke} />
              ) : (
                <Eye size={18} color={theme.textMuted} strokeWidth={icon.stroke} />
              )}
            </TouchableOpacity>
          </View>
          {passwordError && <FieldError theme={theme} message={passwordError} />}

          <PasswordStrength checks={pwChecks} visible={pwFocused || password.length > 0} />

          <View
            style={[
              styles.permBox,
              { backgroundColor: theme.primary + '10', borderColor: theme.primary + '25' },
            ]}
          >
            <Text
              style={[styles.permBoxTitle, { color: theme.primary, textAlign: dir.textAlign }]}
              maxFontSizeMultiplier={1.3}
            >
              {t('team.permissionsTitle')}
            </Text>
            <View style={styles.permList}>
              {ALLOWED_PERMS.map((key) => (
                <View key={key} style={[styles.permRow, { flexDirection: dir.row }]}>
                  <Check size={14} color={theme.primary} strokeWidth={icon.strokeSmall} />
                  <Text
                    style={[styles.permItem, { color: theme.text, textAlign: dir.textAlign }]}
                    maxFontSizeMultiplier={1.4}
                  >
                    {t(key)}
                  </Text>
                </View>
              ))}

              <View style={[styles.permDivider, { backgroundColor: theme.borderLight }]} />

              {DENIED_PERMS.map((key) => (
                <View key={key} style={[styles.permRow, { flexDirection: dir.row }]}>
                  <X size={14} color={theme.danger} strokeWidth={icon.strokeSmall} />
                  <Text
                    style={[styles.permItem, { color: theme.danger, textAlign: dir.textAlign }]}
                    maxFontSizeMultiplier={1.4}
                  >
                    {t(key)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FieldError({ theme, message }: { theme: ReturnType<typeof useTheme>; message: string }) {
  const dir = useDir();
  return (
    <Text
      style={[styles.fieldError, dir.isRTL ? styles.fieldErrorRtl : styles.fieldErrorLtr, { color: theme.danger }]}
      maxFontSizeMultiplier={1.4}
      accessibilityLiveRegion="polite"
    >
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  backBtn: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startGapLtr: { marginLeft: 12 },
  startGapRtl: { marginRight: 12 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalOverlay: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: font.bold,
  },
  modalContent: { padding: 16 },

  label: {
    fontSize: 14,
    marginTop: 18,
    marginBottom: 6,
    fontFamily: font.semibold,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 10,
    minHeight: 48,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 13,
    fontFamily: font.medium,
  },
  fieldError: {
    fontSize: 12,
    marginTop: 6,
    fontFamily: font.medium,
  },
  fieldErrorLtr: { marginLeft: 2 },
  fieldErrorRtl: { marginRight: 2, textAlign: 'right' },

  pwStrengthContainer: {
    marginTop: 10,
    gap: 8,
  },
  pwStrengthBars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pwStrengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 999,
  },
  pwStrengthLabel: {
    fontSize: 11,
    fontFamily: font.bold,
    minWidth: 50,
  },
  pwStrengthLabelLtr: { marginLeft: 6, textAlign: 'right' },
  pwStrengthLabelRtl: { marginRight: 6, textAlign: 'left' },
  pwCheckList: {
    gap: 4,
    marginTop: 2,
  },
  pwCheckRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pwCheckText: {
    fontSize: 12,
    fontFamily: font.regular,
    lineHeight: 16,
  },

  permBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  permBoxTitle: { fontSize: 14, marginBottom: 10, fontFamily: font.bold },
  permList: { gap: 4 },
  permItem: { fontSize: 13, lineHeight: 20, fontFamily: font.regular, flex: 1 },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  permDivider: { height: 1, marginVertical: 6 },
});
