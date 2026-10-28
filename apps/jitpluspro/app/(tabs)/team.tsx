import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { MIN_PASSWORD_LENGTH } from '@/constants/app';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import {
  Mail,
  User,
  ArrowLeft,
  Trash2,
  Edit3,
  Shield,
  Activity,
  Check,
  X,
  Eye,
  EyeOff,
  Power,
} from 'lucide-react-native';
import { JitLock, JitPersonAdd, JitTeam } from '@/components/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/stores/authStore';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getErrorMessage } from '@/utils/error';
import { TeamMember } from '@/types';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  useTeamMembers,
  useCreateTeamMember,
  useUpdateTeamMember,
  useDeleteTeamMember,
} from '@/hooks/useQueryHooks';
import { isValidEmail } from '@/utils/validation';
import { initials as initialsOf } from '@/utils/stampTransaction';
import { ActionButton } from '@/components/ui/ActionButton';
import { font, icon } from '@/constants/design';
import { useDir } from '@/hooks/useDir';
import { useFocusFade } from '@/hooks/useFocusFade';

const HAS_UPPER = /[A-Z]/;
const HAS_DIGIT = /\d/;
const HAS_SPECIAL = /[^A-Za-z0-9]/;
const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const ALLOWED_PERMS = ['team.permScanQR', 'team.permAwardStamps', 'team.permViewClients'] as const;
const DENIED_PERMS = ['team.permNoProfile', 'team.permNoSettings', 'team.permNoTeam'] as const;

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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return initialsOf(parts[0], parts.length > 1 ? parts[parts.length - 1] : null);
}

const MemberCard = React.memo(function MemberCard({
  member,
  onToggle,
  onEdit,
  onDelete,
}: {
  member: TeamMember;
  onToggle: (m: TeamMember) => void;
  onEdit: (m: TeamMember) => void;
  onDelete: (m: TeamMember) => void;
}) {
  const theme = useTheme();
  const dir = useDir();
  const { t } = useLanguage();

  const handleToggle = useCallback(() => onToggle(member), [onToggle, member]);
  const handleEdit = useCallback(() => onEdit(member), [onEdit, member]);
  const handleDelete = useCallback(() => onDelete(member), [onDelete, member]);

  const initials = useMemo(() => getInitials(member.nom), [member.nom]);

  return (
    <View
      style={[
        styles.memberCard,
        {
          backgroundColor: theme.bgCard,
          borderColor: theme.borderLight,
          opacity: member.isActive ? 1 : 0.7,
        },
      ]}
    >
      <View style={[styles.memberTop, { flexDirection: dir.row }]}>
        <View style={[styles.memberAvatar, { backgroundColor: theme.primary + '18' }]}>
          <Text style={[styles.memberAvatarText, { color: theme.primary }]} maxFontSizeMultiplier={1.2}>
            {initials}
          </Text>
        </View>
        <View style={[styles.memberInfo, dir.isRTL ? styles.startGapRtl : styles.startGapLtr]}>
          <View style={[styles.memberNameRow, { flexDirection: dir.row }]}>
            <Text
              style={[styles.memberName, { color: theme.text, textAlign: dir.textAlign }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
            >
              {member.nom}
            </Text>
            {member.isActive ? (
              <View style={[styles.statusDot, { backgroundColor: theme.success }]} />
            ) : (
              <View style={[styles.badge, { backgroundColor: theme.danger + '15' }]}>
                <Text
                  style={[styles.badgeText, { color: theme.danger }]}
                  maxFontSizeMultiplier={1.3}
                >
                  {t('team.inactive')}
                </Text>
              </View>
            )}
          </View>
          <Text
            style={[styles.memberEmail, { color: theme.textMuted, textAlign: dir.textAlign }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
          >
            {member.email}
          </Text>
        </View>
      </View>

      <View style={[styles.metaRow, { flexDirection: dir.row, borderTopColor: theme.borderLight }]}>
        <View style={[styles.metaItem, { flexDirection: dir.row }]}>
          <Shield size={13} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
          <Text
            style={[styles.metaText, { color: theme.textMuted }]}
            maxFontSizeMultiplier={1.3}
          >
            {t('team.restrictedAccess')}
          </Text>
        </View>
        <View style={[styles.metaItem, { flexDirection: dir.row }]}>
          <Activity size={13} color={theme.textMuted} strokeWidth={icon.strokeSmall} />
          <Text
            style={[styles.metaText, { color: theme.textMuted }]}
            maxFontSizeMultiplier={1.3}
          >
            {t(member.transactionsCount === 1 ? 'team.transactionsCount_one' : 'team.transactionsCount_other', { count: member.transactionsCount || 0 })}
          </Text>
        </View>
      </View>

      <View style={[styles.actionsRow, { flexDirection: dir.row }]}>
        <TouchableOpacity
          style={[
            styles.actionChip,
            {
              flexDirection: dir.row,
              backgroundColor: member.isActive ? theme.success + '12' : theme.textMuted + '12',
            },
          ]}
          onPress={handleToggle}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={
            member.isActive
              ? t('team.deactivateA11y', { name: member.nom })
              : t('team.activateA11y', { name: member.nom })
          }
        >
          <Power size={15} color={member.isActive ? theme.success : theme.textMuted} strokeWidth={icon.stroke} />
          <Text
            style={[
              styles.actionChipText,
              { color: member.isActive ? theme.success : theme.textMuted },
            ]}
            maxFontSizeMultiplier={1.3}
          >
            {member.isActive ? t('stores.active') : t('stores.inactive')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionChip, { flexDirection: dir.row, backgroundColor: theme.primary + '12' }]}
          onPress={handleEdit}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('team.editMemberA11y', { name: member.nom })}
        >
          <Edit3 size={15} color={theme.primary} strokeWidth={icon.stroke} />
          <Text
            style={[styles.actionChipText, { color: theme.primary }]}
            maxFontSizeMultiplier={1.3}
          >
            {t('stores.editBtn')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionChip, { flexDirection: dir.row, backgroundColor: theme.danger + '12' }]}
          onPress={handleDelete}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('team.deleteMemberA11y', { name: member.nom })}
        >
          <Trash2 size={15} color={theme.danger} strokeWidth={icon.stroke} />
          <Text
            style={[styles.actionChipText, { color: theme.danger }]}
            maxFontSizeMultiplier={1.3}
          >
            {t('common.delete')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

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

  if (!visible) return null;

  const items: { key: keyof Omit<PwChecks, 'score'>; label: string }[] = [
    { key: 'length', label: t('team.pwCheckLength', { min: MIN_PASSWORD_LENGTH }) },
    { key: 'upper', label: t('team.pwCheckUpper') },
    { key: 'digit', label: t('team.pwCheckDigit') },
    { key: 'special', label: t('team.pwCheckSpecial') },
  ];

  return (
    <View style={styles.pwStrengthContainer}>
      <View style={[styles.pwStrengthBars, { flexDirection: dir.row }]}>
        {[0, 1, 2, 3].map((i) => (
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

// Form state lives here so typing does not re-render the member list.
function AddEditMemberModal({
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
  onSubmit: (payload: {
    nom: string;
    email: string;
    password: string;
    isEdit: boolean;
    memberId?: string;
  }) => Promise<void>;
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

  // Initialize form when modal opens or editingMember changes
  useEffect(() => {
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
  }, [visible, editingMember]);

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
      if (!HAS_UPPER.test(value) || !HAS_DIGIT.test(value) || !HAS_SPECIAL.test(value)) {
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

export default function TeamScreen() {
  const theme = useTheme();
  const { focusStyle } = useFocusFade();
  const dir = useDir();
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const {
    data: members = [],
    isLoading: loading,
    isRefetching: refreshing,
    refetch,
    error: teamError,
  } = useTeamMembers(!isTeamMember);

  // Detect 403 (Premium required) — backend PremiumGuard rejects non-Pro merchants.
  // We render a neutral "Pro feature" screen WITHOUT any external payment CTA
  // (no WhatsApp / web link) to comply with Apple Guideline 3.1.1 / 3.1.3.
  const teamErrorStatus = teamError as { response?: { status?: number }; status?: number } | null;
  const isPremiumRequired = (teamErrorStatus?.response?.status ?? teamErrorStatus?.status) === 403;

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  const createMember = useCreateTeamMember();
  const updateMember = useUpdateTeamMember();
  const deleteMemberMutation = useDeleteTeamMember();
  const formLoading = createMember.isPending || updateMember.isPending;

  const onRefresh = useGuardedCallback(async () => {
    await refetch();
  }, [refetch]);

  const existingEmails = useMemo(
    () => members.map((m) => m.email.toLowerCase()),
    [members],
  );

  const stats = useMemo(() => {
    let active = 0;
    let inactive = 0;
    for (const m of members) {
      if (m.isActive) active++;
      else inactive++;
    }
    return { active, inactive, total: members.length };
  }, [members]);

  const closeModal = useCallback(() => {
    setShowAddModal(false);
    setEditingMember(null);
  }, []);

  const openAddModal = useCallback(() => {
    setEditingMember(null);
    setShowAddModal(true);
  }, []);

  const openEditModal = useCallback((member: TeamMember) => {
    setEditingMember(member);
    setShowAddModal(true);
  }, []);

  const handleFormSubmit = useCallback(
    async (payload: {
      nom: string;
      email: string;
      password: string;
      isEdit: boolean;
      memberId?: string;
    }) => {
      try {
        if (payload.isEdit && payload.memberId) {
          const data: Record<string, string> = { nom: payload.nom, email: payload.email };
          if (payload.password) data.password = payload.password;
          await updateMember.mutateAsync({ id: payload.memberId, payload: data });
        } else {
          await createMember.mutateAsync({
            nom: payload.nom,
            email: payload.email,
            password: payload.password,
          });
        }
        closeModal();
      } catch (error: unknown) {
        // Special-case 429 (throttler) for friendlier message
        const err = error as { response?: { status?: number } };
        if (err?.response?.status === 429) {
          Alert.alert(t('team.limitReachedTitle'), t('team.limitReachedMsg'));
          return;
        }
        Alert.alert(t('common.error'), getErrorMessage(error, t('team.operationError')));
      }
    },
    [createMember, updateMember, closeModal, t],
  );

  const toggleActive = useGuardedCallback(
    async (member: TeamMember) => {
      try {
        await updateMember.mutateAsync({
          id: member.id,
          payload: { isActive: !member.isActive },
        });
      } catch {
        Alert.alert(t('common.error'), t('team.statusToggleError'));
      }
    },
    [updateMember, t],
  );

  const deleteMember = useCallback(
    (member: TeamMember) => {
      Alert.alert(t('team.deleteTitle'), t('team.deleteMsg', { name: member.nom }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMemberMutation.mutateAsync(member.id);
            } catch {
              Alert.alert(t('common.error'), t('team.deleteMemberError'));
            }
          },
        },
      ]);
    },
    [deleteMemberMutation, t],
  );

  const keyExtractor = useCallback((m: TeamMember) => m.id, []);

  const renderItem = useCallback(
    ({ item }: { item: TeamMember }) => (
      <MemberCard
        member={item}
        onToggle={toggleActive}
        onEdit={openEditModal}
        onDelete={deleteMember}
      />
    ),
    [toggleActive, openEditModal, deleteMember],
  );

  const listHeader = useMemo(
    () => (
      <View
        style={[
          styles.statsBanner,
          { flexDirection: dir.row, backgroundColor: theme.bgCard, borderColor: theme.borderLight },
        ]}
      >
        <View style={[styles.statItem, { flexDirection: dir.row }]}>
          <View style={[styles.statIcon, { backgroundColor: theme.primary + '15' }]}>
            <JitTeam size={16} color={theme.primary} strokeWidth={icon.stroke} />
          </View>
          <View>
            <Text
              style={[styles.statNumber, { color: theme.text }]}
              maxFontSizeMultiplier={1.3}
            >
              {stats.total}
            </Text>
            <Text
              style={[styles.statLabel, { color: theme.textMuted }]}
              maxFontSizeMultiplier={1.3}
            >
              {t(stats.total === 1 ? 'team.memberCount_one' : 'team.memberCount_other', { count: stats.total })}
            </Text>
          </View>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.borderLight }]} />
        <View style={[styles.statItem, { flexDirection: dir.row }]}>
          <View style={[styles.statDot, { backgroundColor: theme.success }]} />
          <Text
            style={[styles.statInlineText, { color: theme.text }]}
            maxFontSizeMultiplier={1.3}
          >
            {t(stats.active === 1 ? 'team.activeCount_one' : 'team.activeCount_other', { count: stats.active })}
          </Text>
        </View>
        {stats.inactive > 0 && (
          <View style={[styles.statItem, { flexDirection: dir.row }]}>
            <View style={[styles.statDot, { backgroundColor: theme.textMuted }]} />
            <Text
              style={[styles.statInlineText, { color: theme.textMuted }]}
              maxFontSizeMultiplier={1.3}
            >
              {t(stats.inactive === 1 ? 'team.inactiveCount_one' : 'team.inactiveCount_other', { count: stats.inactive })}
            </Text>
          </View>
        )}
      </View>
    ),
    [stats, theme, t, dir.row],
  );

  const listFooter = useMemo(() => {
    if (members.length === 0) return null;
    return (
      <>
        <ActionButton label={t('team.addMember')} icon={JitPersonAdd} onPress={openAddModal} />
        <View
          style={[
            styles.infoBox,
            { backgroundColor: theme.primary + '10', borderColor: theme.primary + '25' },
          ]}
        >
          <Text
            style={[styles.infoText, { color: theme.primary, textAlign: dir.textAlign }]}
            maxFontSizeMultiplier={1.4}
          >
            {t('team.infoHint')}
          </Text>
        </View>
      </>
    );
  }, [members.length, t, theme.primary, dir.textAlign, openAddModal]);

  const listEmpty = useMemo(
    () => (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIllustration, { backgroundColor: theme.primary + '10' }]}>
          <JitTeam size={40} color={theme.primary} strokeWidth={icon.stroke} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
          {t('team.noMembers')}
        </Text>
        <Text
          style={[styles.emptyText, { color: theme.textMuted }]}
          maxFontSizeMultiplier={1.4}
        >
          {t('team.noMembersHint')}
        </Text>
        <ActionButton
          label={t('team.addMember')}
          icon={JitPersonAdd}
          onPress={openAddModal}
          style={styles.emptyAddBtn}
        />
      </View>
    ),
    [t, theme.primary, theme.text, theme.textMuted, openAddModal],
  );

  const header = (
    <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
      <Text
        style={[styles.headerTitle, { color: theme.text }]}
        maxFontSizeMultiplier={1.4}
        accessibilityRole="header"
      >
        {t('team.title')}
      </Text>
    </View>
  );

  if (isTeamMember) {
    return (
      <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
        {header}
        <View style={styles.centered}>
          <Shield size={48} color={theme.textMuted} strokeWidth={icon.stroke} />
          <Text style={[styles.emptyTitle, { color: theme.text }]} maxFontSizeMultiplier={1.4}>
            {t('team.accessDenied')}
          </Text>
          <Text
            style={[styles.emptyText, { color: theme.textMuted }]}
            maxFontSizeMultiplier={1.4}
          >
            {t('team.accessDeniedMsg')}
          </Text>
        </View>
      </Animated.View>
    );
  }

  // Premium-required fallback (non-Pro merchant). Neutral UI — no external
  // payment link / CTA to stay compliant with Apple 3.1.1 / 3.1.3.
  if (isPremiumRequired) {
    return (
      <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
        {header}
        <View style={styles.centered}>
          <JitLock size={48} color={theme.primary} strokeWidth={icon.stroke} />
          <Text
            style={[styles.emptyTitle, { color: theme.text }]}
            maxFontSizeMultiplier={1.4}
          >
            {t('team.proRequiredTitle')}
          </Text>
          <Text
            style={[styles.emptyText, { color: theme.textMuted }]}
            maxFontSizeMultiplier={1.4}
          >
            {t('team.proRequiredMsg')}
          </Text>
          <ActionButton
            label={t('team.viewMyPlan')}
            onPress={() => router.push('/plan')}
            style={styles.emptyAddBtn}
          />
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
      {header}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={members}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={members.length > 0 ? listHeader : null}
          ListFooterComponent={listFooter}
          ListEmptyComponent={listEmpty}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 116 }]}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === 'android'}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.primary]}
              tintColor={theme.primary}
            />
          }
        />
      )}

      <AddEditMemberModal
        visible={showAddModal}
        editingMember={editingMember}
        existingEmails={existingEmails}
        onClose={closeModal}
        onSubmit={handleFormSubmit}
        submitting={formLoading}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },

  listContent: { paddingHorizontal: 16, paddingTop: 16 },

  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  backBtn: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: font.bold,
    letterSpacing: -0.5,
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

  statsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontFamily: font.bold,
    lineHeight: 22,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: font.regular,
    lineHeight: 14,
  },
  statDivider: {
    width: 1,
    height: 28,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  statInlineText: {
    fontSize: 13,
    fontFamily: font.semibold,
  },

  memberCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  memberTop: {
    flexDirection: 'row',
    padding: 14,
    alignItems: 'center',
  },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: 15,
    fontFamily: font.bold,
  },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberName: {
    fontSize: 15,
    fontFamily: font.semibold,
    flexShrink: 1,
  },
  memberEmail: { fontSize: 13, marginTop: 2, fontFamily: font.regular },
  statusDot: { width: 8, height: 8, borderRadius: 999 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 11, fontFamily: font.semibold },

  metaRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 16,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, fontFamily: font.regular },

  actionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 6,
  },
  actionChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    minHeight: 40,
  },
  actionChipText: { fontSize: 12, fontFamily: font.semibold },

  emptyContainer: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24 },
  emptyIllustration: {
    width: 80,
    height: 80,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, marginBottom: 6, fontFamily: font.bold },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: font.regular },
  emptyAddBtn: { marginTop: 20 },

  infoBox: {
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoText: { fontSize: 13, lineHeight: 20, fontFamily: font.regular },

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
