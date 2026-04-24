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
} from 'react-native';
import {
  Users,
  UserPlus,
  Mail,
  Lock,
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
  Crown,
} from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
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

// ──────────────────────────────────────────────────────────────
// Constants / helpers
// ──────────────────────────────────────────────────────────────
// RFC 5322 simplified — aligned with backend class-validator @IsEmail
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HAS_UPPER = /[A-Z]/;
const HAS_DIGIT = /\d/;
const HAS_SPECIAL = /[^A-Za-z0-9]/;
const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

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
  const clean = name.trim();
  if (!clean) return '?';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ──────────────────────────────────────────────────────────────
// MemberCard
// ──────────────────────────────────────────────────────────────
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
      <View style={styles.memberTop}>
        <View style={[styles.memberAvatar, { backgroundColor: theme.primary + '18' }]}>
          <Text style={[styles.memberAvatarText, { color: theme.primary }]} maxFontSizeMultiplier={1.2}>
            {initials}
          </Text>
        </View>
        <View style={styles.memberInfo}>
          <View style={styles.memberNameRow}>
            <Text
              style={[styles.memberName, { color: theme.text }]}
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
            style={[styles.memberEmail, { color: theme.textMuted }]}
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
          >
            {member.email}
          </Text>
        </View>
      </View>

      <View style={[styles.metaRow, { borderTopColor: theme.borderLight }]}>
        <View style={styles.metaItem}>
          <Shield size={13} color={theme.textMuted} />
          <Text
            style={[styles.metaText, { color: theme.textMuted }]}
            maxFontSizeMultiplier={1.3}
          >
            {t('team.restrictedAccess')}
          </Text>
        </View>
        <View style={styles.metaItem}>
          <Activity size={13} color={theme.textMuted} />
          <Text
            style={[styles.metaText, { color: theme.textMuted }]}
            maxFontSizeMultiplier={1.3}
          >
            {t('team.transactionsCount', { count: member.transactionsCount || 0 })}
          </Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[
            styles.actionChip,
            {
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
          <Power size={15} color={member.isActive ? theme.success : theme.textMuted} />
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
          style={[styles.actionChip, { backgroundColor: theme.primary + '12' }]}
          onPress={handleEdit}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('team.editMemberA11y', { name: member.nom })}
        >
          <Edit3 size={15} color={theme.primary} />
          <Text
            style={[styles.actionChipText, { color: theme.primary }]}
            maxFontSizeMultiplier={1.3}
          >
            {t('stores.editBtn')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionChip, { backgroundColor: theme.danger + '12' }]}
          onPress={handleDelete}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('team.deleteMemberA11y', { name: member.nom })}
        >
          <Trash2 size={15} color={theme.danger} />
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

// ──────────────────────────────────────────────────────────────
// PasswordStrength (visual indicator + checklist)
// ──────────────────────────────────────────────────────────────
const PasswordStrength = React.memo(function PasswordStrength({
  checks,
  visible,
}: {
  checks: PwChecks;
  visible: boolean;
}) {
  const theme = useTheme();
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
      <View style={styles.pwStrengthBars}>
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
        <Text style={[styles.pwStrengthLabel, { color }]} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
      </View>
      <View style={styles.pwCheckList}>
        {items.map((it) => {
          const ok = checks[it.key];
          return (
            <View key={it.key} style={styles.pwCheckRow}>
              {ok ? (
                <Check size={13} color={theme.success} strokeWidth={3} />
              ) : (
                <X size={13} color={theme.textMuted} strokeWidth={2.5} />
              )}
              <Text
                style={[styles.pwCheckText, { color: ok ? theme.success : theme.textMuted }]}
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

// ──────────────────────────────────────────────────────────────
// AddEditMemberModal (isolated form state — does not re-render list)
// ──────────────────────────────────────────────────────────────
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
      if (!EMAIL_REGEX.test(v)) return t('team.invalidEmail');
      if (!isEdit && existingEmails.includes(v.toLowerCase())) {
        return t('team.emailAlreadyExists');
      }
      return null;
    },
    [t, isEdit, existingEmails],
  );

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
            { backgroundColor: theme.bgCard, borderBottomColor: theme.borderLight },
          ]}
        >
          <TouchableOpacity
            onPress={onClose}
            style={styles.backBtn}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <ArrowLeft size={24} color={theme.text} />
          </TouchableOpacity>
          <Text
            style={[styles.modalTitle, { color: theme.text }]}
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
              <Check size={20} color="#fff" strokeWidth={2.5} />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.modalContent}
        >
          {/* Name */}
          <Text style={[styles.label, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
            {t('team.nameLabel')} *
          </Text>
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: theme.bgInput,
                borderColor: nomError ? theme.danger : theme.border,
              },
            ]}
          >
            <User size={18} color={theme.textMuted} />
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder={t('teamPlaceholders.namePlaceholder')}
              placeholderTextColor={theme.textMuted}
              value={nom}
              onChangeText={(v) => {
                setNom(v);
                if (nomError) setNomError(null);
              }}
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              maxLength={100}
              maxFontSizeMultiplier={1.3}
              accessibilityLabel={t('team.nameLabel')}
            />
          </View>
          {nomError && <FieldError theme={theme} message={nomError} />}

          {/* Email */}
          <Text style={[styles.label, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
            {t('team.emailLabel')} *
          </Text>
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: theme.bgInput,
                borderColor: emailError ? theme.danger : theme.border,
              },
            ]}
          >
            <Mail size={18} color={theme.textMuted} />
            <TextInput
              ref={emailRef}
              style={[styles.input, { color: theme.text }]}
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
              onSubmitEditing={() => passwordRef.current?.focus()}
              maxLength={255}
              maxFontSizeMultiplier={1.3}
              accessibilityLabel={t('team.emailLabel')}
            />
          </View>
          {emailError && <FieldError theme={theme} message={emailError} />}

          {/* Password */}
          <Text style={[styles.label, { color: theme.text }]} maxFontSizeMultiplier={1.3}>
            {isEdit ? t('team.passwordOptional') : `${t('team.passwordLabel')} *`}
          </Text>
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: theme.bgInput,
                borderColor: passwordError ? theme.danger : theme.border,
              },
            ]}
          >
            <Lock size={18} color={theme.textMuted} />
            <TextInput
              ref={passwordRef}
              style={[styles.input, { color: theme.text }]}
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
                <EyeOff size={18} color={theme.textMuted} />
              ) : (
                <Eye size={18} color={theme.textMuted} />
              )}
            </TouchableOpacity>
          </View>
          {passwordError && <FieldError theme={theme} message={passwordError} />}

          <PasswordStrength checks={pwChecks} visible={pwFocused || password.length > 0} />

          {/* Permissions info */}
          <View
            style={[
              styles.permBox,
              { backgroundColor: theme.primary + '10', borderColor: theme.primary + '25' },
            ]}
          >
            <Text
              style={[styles.permBoxTitle, { color: theme.primary }]}
              maxFontSizeMultiplier={1.3}
            >
              {t('team.permissionsTitle')}
            </Text>
            <View style={styles.permList}>
              {[
                { ok: true, key: 'team.permScanQR' },
                { ok: true, key: 'team.permAwardPoints' },
                { ok: true, key: 'team.permViewClients' },
              ].map((p) => (
                <View key={p.key} style={styles.permRow}>
                  <Check size={14} color={theme.primary} />
                  <Text
                    style={[styles.permItem, { color: theme.text }]}
                    maxFontSizeMultiplier={1.4}
                  >
                    {t(p.key)}
                  </Text>
                </View>
              ))}

              <View style={[styles.permDivider, { backgroundColor: theme.borderLight }]} />

              {[
                { key: 'team.permNoProfile' },
                { key: 'team.permNoSettings' },
                { key: 'team.permNoTeam' },
              ].map((p) => (
                <View key={p.key} style={styles.permRow}>
                  <X size={14} color={theme.danger} />
                  <Text
                    style={[styles.permItem, { color: theme.danger }]}
                    maxFontSizeMultiplier={1.4}
                  >
                    {t(p.key)}
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
  return (
    <Text
      style={[styles.fieldError, { color: theme.danger }]}
      maxFontSizeMultiplier={1.4}
      accessibilityLiveRegion="polite"
    >
      {message}
    </Text>
  );
}

// ──────────────────────────────────────────────────────────────
// Screen
// ──────────────────────────────────────────────────────────────
export default function TeamManagementScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { isTeamMember } = useAuth();
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
  const isPremiumRequired = useMemo(() => {
    const status = (teamError as any)?.response?.status ?? (teamError as any)?.status;
    return status === 403;
  }, [teamError]);

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
          { backgroundColor: theme.bgCard, borderColor: theme.borderLight },
        ]}
      >
        <View style={styles.statItem}>
          <View style={[styles.statIcon, { backgroundColor: theme.primary + '15' }]}>
            <Users size={16} color={theme.primary} />
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
              {t('team.memberCount', { count: stats.total })}
            </Text>
          </View>
        </View>
        <View style={[styles.statDivider, { backgroundColor: theme.borderLight }]} />
        <View style={styles.statItem}>
          <View style={[styles.statDot, { backgroundColor: theme.success }]} />
          <Text
            style={[styles.statInlineText, { color: theme.text }]}
            maxFontSizeMultiplier={1.3}
          >
            {t('team.activeCount', { count: stats.active })}
          </Text>
        </View>
        {stats.inactive > 0 && (
          <View style={styles.statItem}>
            <View style={[styles.statDot, { backgroundColor: theme.textMuted }]} />
            <Text
              style={[styles.statInlineText, { color: theme.textMuted }]}
              maxFontSizeMultiplier={1.3}
            >
              {t('team.inactiveCount', { count: stats.inactive })}
            </Text>
          </View>
        )}
      </View>
    ),
    [stats, theme, t],
  );

  const listFooter = useMemo(() => {
    if (members.length === 0) return null;
    return (
      <View
        style={[
          styles.infoBox,
          { backgroundColor: theme.primary + '10', borderColor: theme.primary + '25' },
        ]}
      >
        <Text
          style={[styles.infoText, { color: theme.primary }]}
          maxFontSizeMultiplier={1.4}
        >
          {t('team.infoHint')}
        </Text>
      </View>
    );
  }, [members.length, t, theme.primary]);

  const listEmpty = useMemo(
    () => (
      <View style={styles.emptyContainer}>
        <View style={[styles.emptyIllustration, { backgroundColor: theme.primary + '10' }]}>
          <Users size={40} color={theme.primary} strokeWidth={1.5} />
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
        <TouchableOpacity
          style={[styles.emptyAddBtn, { backgroundColor: theme.primary }]}
          onPress={openAddModal}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('team.addMember')}
        >
          <UserPlus size={18} color="#fff" />
          <Text style={styles.emptyAddBtnText} maxFontSizeMultiplier={1.3}>
            {t('team.addMember')}
          </Text>
        </TouchableOpacity>
      </View>
    ),
    [t, theme.primary, theme.text, theme.textMuted, openAddModal],
  );

  // ── Guards ──
  if (shouldWait) return null;

  if (isTeamMember) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View
          style={[
            styles.headerBar,
            {
              paddingTop: insets.top + 8,
              backgroundColor: theme.bgCard,
              borderBottomColor: theme.borderLight,
              borderBottomWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <ArrowLeft size={24} color={theme.text} />
          </TouchableOpacity>
          <Text
            style={[styles.headerTitle, { color: theme.text }]}
            maxFontSizeMultiplier={1.3}
          >
            {t('team.title')}
          </Text>
        </View>
        <View style={styles.centered}>
          <Shield size={48} color={theme.textMuted} strokeWidth={1.5} />
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
      </View>
    );
  }

  // Premium-required fallback (non-Pro merchant). Neutral UI — no external
  // payment link / CTA to stay compliant with Apple 3.1.1 / 3.1.3.
  if (isPremiumRequired) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        <View
          style={[
            styles.headerBar,
            {
              paddingTop: insets.top + 8,
              backgroundColor: theme.bgCard,
              borderBottomColor: theme.borderLight,
              borderBottomWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <ArrowLeft size={24} color={theme.text} />
          </TouchableOpacity>
          <Text
            style={[styles.headerTitle, { color: theme.text }]}
            maxFontSizeMultiplier={1.3}
          >
            {t('team.title')}
          </Text>
        </View>
        <View style={styles.centered}>
          <Crown size={48} color={theme.primary} strokeWidth={1.5} />
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
          <TouchableOpacity
            onPress={() => router.push('/plan')}
            style={[styles.emptyAddBtn, { backgroundColor: theme.primary, marginTop: 20 }]}
            accessibilityRole="button"
            accessibilityLabel={t('team.viewMyPlan')}
          >
            <Text style={styles.emptyAddBtnText} maxFontSizeMultiplier={1.3}>
              {t('team.viewMyPlan')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft size={22} color={theme.text} />
        </TouchableOpacity>
        <Text
          style={[styles.headerTitle, { color: theme.text }]}
          maxFontSizeMultiplier={1.3}
        >
          {t('team.title')}
        </Text>
        <TouchableOpacity
          onPress={openAddModal}
          style={[styles.addBtn, { backgroundColor: theme.primary + '18' }]}
          activeOpacity={0.7}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('team.addMember')}
        >
          <UserPlus size={20} color={theme.primary} strokeWidth={2} />
        </TouchableOpacity>
      </View>

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
          contentContainerStyle={styles.listContent}
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
    </View>
  );
}

// ──────────────────────────────────────────────────────────────
// Styles
// ──────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },

  listContent: { paddingBottom: 100, paddingHorizontal: 16, paddingTop: 16 },

  // Header
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 10,
  },
  backBtn: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    marginLeft: 12,
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Stats banner
  statsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
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
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    lineHeight: 22,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Lexend_400Regular',
    lineHeight: 14,
  },
  statDivider: {
    width: 1,
    height: 28,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statInlineText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
  },

  // Member card
  memberCard: {
    borderRadius: 14,
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
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  memberInfo: { flex: 1, marginLeft: 12 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberName: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Lexend_600SemiBold',
    flexShrink: 1,
  },
  memberEmail: { fontSize: 13, marginTop: 2, fontFamily: 'Lexend_400Regular' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // Meta row
  metaRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 16,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText: { fontSize: 12, fontFamily: 'Lexend_400Regular' },

  // Action chips
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
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
    minHeight: 40,
  },
  actionChipText: { fontSize: 12, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // Empty state
  emptyContainer: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24 },
  emptyIllustration: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 6, fontFamily: 'Lexend_700Bold' },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: 'Lexend_400Regular' },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 20,
    minHeight: 44,
  },
  emptyAddBtnText: { fontSize: 14, fontWeight: '700', color: '#fff', fontFamily: 'Lexend_700Bold' },

  // Info box
  infoBox: {
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  infoText: { fontSize: 13, lineHeight: 20, fontFamily: 'Lexend_400Regular' },

  // Modal
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
    fontWeight: '700',
    marginLeft: 12,
    fontFamily: 'Lexend_700Bold',
  },
  modalContent: { padding: 16 },

  // Form
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 18,
    marginBottom: 6,
    fontFamily: 'Lexend_600SemiBold',
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
    fontFamily: 'Lexend_500Medium',
  },
  fieldError: {
    fontSize: 12,
    marginTop: 6,
    marginLeft: 2,
    fontFamily: 'Lexend_500Medium',
  },

  // Password strength
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
    borderRadius: 2,
  },
  pwStrengthLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
    marginLeft: 6,
    minWidth: 50,
    textAlign: 'right',
  },
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
    fontFamily: 'Lexend_400Regular',
    lineHeight: 16,
  },

  // Permissions box
  permBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  permBoxTitle: { fontSize: 14, fontWeight: '700', marginBottom: 10, fontFamily: 'Lexend_700Bold' },
  permList: { gap: 4 },
  permItem: { fontSize: 13, lineHeight: 20, fontFamily: 'Lexend_400Regular', flex: 1 },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  permDivider: { height: 1, marginVertical: 6 },
});
