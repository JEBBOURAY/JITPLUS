import React, { useState, useCallback, useMemo } from 'react';
import { toast } from '@/components/ui/Toast';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  DimensionValue,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import {
  Eye,
  EyeOff,
  Smartphone,
  Trash2,
  ShieldCheck,
  Check,
} from 'lucide-react-native';
import { JitLock } from '@/components/icons';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { isValidPassword } from '@/utils/passwordStrength';
import { useAuth } from '@/contexts/AuthContext';
import { useGoBack } from '@/hooks/useGoBack';
import { ScreenHeader } from '@/components/scratch/ScratchUI';
import { SecurityDevices, reRegisterThisDevicePush } from '@/components/account/SecurityDevices';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGoogleIdToken } from '@/hooks/useGoogleIdToken';
import { useAppleIdToken } from '@/hooks/useAppleIdToken';
import { useDir } from '@/hooks/useDir';
import { ActionButton } from '@/components/ui/ActionButton';
import { font, icon as iconTokens } from '@/constants/design';
import { MIN_PASSWORD_LENGTH } from '@/constants/app';

const HIT_SLOP_8 = { top: 8, bottom: 8, left: 8, right: 8 };
const HIT_SLOP_12 = { top: 12, bottom: 12, left: 12, right: 12 };
const NEW_PASSWORD_RULES = `minlength: ${MIN_PASSWORD_LENGTH}; required: upper; required: digit; required: special;`;

// Declared outside SecurityScreen so the TextInput is not re-mounted on every render.
interface PwdFieldProps {
  label: string;
  value: string;
  setValue: (v: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
  placeholder: string;
  theme: ThemeColors;
  /** iOS + Android autofill hint (newPassword / password) */
  variant?: 'current' | 'new';
  /** a11y labels for the show/hide toggle */
  showLabel: string;
  hideLabel: string;
  returnKeyType?: 'next' | 'done';
}

function PwdField({
  label, value, setValue, show, setShow, placeholder, theme,
  variant = 'current', showLabel, hideLabel, returnKeyType,
}: PwdFieldProps) {
  const dir = useDir();
  return (
    <>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>{label}</Text>
      <View style={[styles.inputWrapper, { flexDirection: dir.row, backgroundColor: theme.bgInput, borderColor: theme.border }]}>
        <JitLock size={17} color={theme.textMuted} strokeWidth={iconTokens.stroke} />
        <TextInput
          style={[styles.input, { color: theme.text, textAlign: dir.textAlign }]}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={variant === 'new' ? 'new-password' : 'current-password'}
          textContentType={variant === 'new' ? 'newPassword' : 'password'}
          passwordRules={variant === 'new' ? NEW_PASSWORD_RULES : undefined}
          maxLength={128}
          maxFontSizeMultiplier={1.4}
          returnKeyType={returnKeyType}
          blurOnSubmit={returnKeyType ? returnKeyType === 'done' : undefined}
        />
        <TouchableOpacity
          onPress={() => setShow(!show)}
          hitSlop={HIT_SLOP_12}
          accessibilityRole="button"
          accessibilityLabel={show ? hideLabel : showLabel}
          accessibilityState={{ checked: show }}
        >
          {show
            ? <EyeOff size={18} color={theme.textMuted} strokeWidth={iconTokens.stroke} />
            : <Eye size={18} color={theme.textMuted} strokeWidth={iconTokens.stroke} />}
        </TouchableOpacity>
      </View>
    </>
  );
}

interface ReauthStatusProps {
  theme: ThemeColors;
  verified: boolean;
  verifiedLabel: string;
  verifiedColor: string;
  /** False when the provider cannot be used on this device (Apple on Android). */
  available: boolean;
  unavailableLabel: string;
  buttonLabel: string;
  buttonColor: string;
  loading: boolean;
  onPress: () => void;
  error?: string | null;
}

/** Google / Apple re-authentication: verified badge, sign-in button, then any error. */
function ReauthStatus({
  theme, verified, verifiedLabel, verifiedColor, available, unavailableLabel,
  buttonLabel, buttonColor, loading, onPress, error,
}: ReauthStatusProps) {
  const dir = useDir();
  return (
    <>
      {verified ? (
        <View style={[styles.inputWrapper, { flexDirection: dir.row, backgroundColor: theme.bgInput, borderColor: verifiedColor }]} accessible accessibilityLabel={verifiedLabel}>
          <Check size={18} color={verifiedColor} strokeWidth={iconTokens.stroke} accessibilityElementsHidden importantForAccessibility="no" />
          <Text style={[styles.input, { color: verifiedColor, fontFamily: font.semibold }]} maxFontSizeMultiplier={1.4}>
            {verifiedLabel}
          </Text>
        </View>
      ) : available ? (
        <TouchableOpacity
          style={[styles.inputWrapper, { flexDirection: dir.row, backgroundColor: theme.bgInput, borderColor: theme.border, justifyContent: 'center' }]}
          onPress={onPress}
          disabled={loading}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={buttonLabel}
          accessibilityState={{ busy: loading, disabled: loading }}
        >
          {loading ? (
            <ActivityIndicator size="small" color={buttonColor} />
          ) : (
            <Text style={[styles.input, { color: buttonColor, fontFamily: font.semibold, textAlign: 'center' }]} maxFontSizeMultiplier={1.4}>
              {buttonLabel}
            </Text>
          )}
        </TouchableOpacity>
      ) : (
        <Text style={[styles.fieldLabel, styles.mt8, { color: theme.textMuted, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>
          {unavailableLabel}
        </Text>
      )}
      {error ? (
        <Text
          style={[styles.errorText, { color: theme.danger, textAlign: dir.textAlign }]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >{error}</Text>
      ) : null}
    </>
  );
}

type TabId = 'password' | 'devices' | 'delete';

export default function SecurityScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { signOut, merchant, isTeamMember } = useAuth();
  const { t } = useLanguage();
  const dir = useDir();

  const isGoogleAccount = !!merchant?.googleId;
  const isAppleAccount = !!merchant?.appleId;
  const isSocialAccount = isGoogleAccount || isAppleAccount;

  const [activeTab, setActiveTab] = useState<TabId>(
    params.tab === 'devices' ? 'devices' : params.tab === 'delete' ? 'delete' : 'password',
  );

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const [deletePwd, setDeletePwd] = useState('');
  const [showDeletePwd, setShowDeletePwd] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteGoogleToken, setDeleteGoogleToken] = useState<string | null>(null);
  const googleDelete = useGoogleIdToken((idToken) => setDeleteGoogleToken(idToken));
  const [deleteAppleToken, setDeleteAppleToken] = useState<string | null>(null);
  const appleDelete = useAppleIdToken((data) => setDeleteAppleToken(data.identityToken));
  // The re-auth tokens above also authorize a password change on Google/Apple
  // accounts, which have no current password to type.
  const socialReauth = useMemo(() => {
    if (isGoogleAccount) return deleteGoogleToken ? { idToken: deleteGoogleToken } : null;
    return isAppleAccount && deleteAppleToken ? { appleIdentityToken: deleteAppleToken } : null;
  }, [isGoogleAccount, isAppleAccount, deleteGoogleToken, deleteAppleToken]);
  const hasSocialReauth = socialReauth !== null;
  const socialReauthLoading = isGoogleAccount ? googleDelete.isLoading : appleDelete.isLoading;
  const canSubmitPassword = isSocialAccount ? hasSocialReauth : !!currentPwd;

  const strength = useMemo(() => {
    if (newPwd.length === 0) return { label: '', color: theme.border, width: '0%' as DimensionValue };
    let score = 0;
    if (newPwd.length >= MIN_PASSWORD_LENGTH) score++;
    if (newPwd.length >= 10) score++;
    if (/[A-Z]/.test(newPwd)) score++;
    if (/[0-9]/.test(newPwd)) score++;
    if (/[^A-Za-z0-9]/.test(newPwd)) score++;

    if (score <= 1) return { label: t('security.strengthWeak'), color: theme.danger, width: '20%' as DimensionValue };
    if (score <= 2) return { label: t('security.strengthMedium'), color: theme.warning, width: '45%' as DimensionValue };
    if (score <= 3) return { label: t('security.strengthGood'), color: theme.primary, width: '70%' as DimensionValue };
    return { label: t('security.strengthStrong'), color: theme.success, width: '100%' as DimensionValue };
  }, [newPwd, theme, t]);

  const executePasswordChange = useCallback(async (logoutOthers: boolean) => {
    setSaving(true);
    try {
      const res = await api.patch('/merchant/password', {
        ...(isSocialAccount ? socialReauth ?? {} : { currentPassword: currentPwd }),
        newPassword: newPwd,
        logoutOthers,
      });

      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setShowCurrent(false);
      setShowNew(false);

      const count = res.data?.devicesDisconnected || 0;
      if (logoutOthers && count > 0) {
        reRegisterThisDevicePush();
        toast.success(t(count === 1 ? 'security.changePwdSuccessLogout_one' : 'security.changePwdSuccessLogout_other', { count }));
      } else {
        toast.success(t('security.changePwdSuccess'));
      }
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, t('security.changePwdError')));
    } finally {
      setSaving(false);
    }
  }, [isSocialAccount, socialReauth, currentPwd, newPwd, t]);

  const handleChangePassword = useCallback(async () => {
    if (isSocialAccount && !hasSocialReauth) return;
    if (!isSocialAccount && !currentPwd.trim()) {
      toast.error(t('security.enterCurrentPassword'));
      return;
    }
    if (!isValidPassword(newPwd)) {
      toast.error(t('security.passwordRequirements'));
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error(t('security.passwordMismatch'));
      return;
    }

    // Ask about logging out other devices first so a single API call is made.
    Alert.alert(
      t('security.changePwdTitle'),
      t('security.changePwdLogoutQuestion'),
      [
        {
          text: t('security.changePwdOnly'),
          onPress: () => executePasswordChange(false),
        },
        {
          text: t('security.changePwdAndLogout'),
          style: 'destructive',
          onPress: () => executePasswordChange(true),
        },
        { text: t('common.cancel'), style: 'cancel' },
      ],
    );
  }, [isSocialAccount, hasSocialReauth, currentPwd, newPwd, confirmPwd, executePasswordChange, t]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      t('security.deleteFinalTitle'),
      t('security.deleteFinalMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('security.deleteForeverBtn'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const body = isGoogleAccount
                ? { idToken: deleteGoogleToken }
                : isAppleAccount
                  ? { appleIdentityToken: deleteAppleToken }
                  : { password: deletePwd };
              await api.post('/merchant/delete-account', body);
              Alert.alert(
                t('security.deletedTitle'),
                t('security.deletedSuccess'),
                [{ text: t('common.confirm'), onPress: () => signOut({ sessionRevoked: true }) }],
                { cancelable: false },
              );
            } catch (err: unknown) {
              toast.error(getErrorMessage(err, t('security.deleteAccountError')));
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }, [isGoogleAccount, isAppleAccount, deleteGoogleToken, deleteAppleToken, deletePwd, signOut, t]);

  const goBack = useGoBack();

  const tabs = useMemo<{ id: TabId; label: string; icon: React.ReactNode }[]>(() => [
    { id: 'password', label: t('security.tabPassword'), icon: <JitLock size={15} strokeWidth={iconTokens.stroke} color={activeTab === 'password' ? '#fff' : theme.textMuted} /> },
    { id: 'devices', label: t('security.tabDevices'), icon: <Smartphone size={15} strokeWidth={iconTokens.stroke} color={activeTab === 'devices' ? '#fff' : theme.textMuted} /> },
    { id: 'delete', label: t('security.tabDelete'), icon: <Trash2 size={15} strokeWidth={iconTokens.stroke} color={activeTab === 'delete' ? '#fff' : theme.danger} /> },
  ], [activeTab, theme.danger, theme.textMuted, t]);

  const deleteReady = (isGoogleAccount ? !!deleteGoogleToken : isAppleAccount ? !!deleteAppleToken : isValidPassword(deletePwd)) && deleteConfirmed;
  const passwordReady = canSubmitPassword && isValidPassword(newPwd) && newPwd === confirmPwd;

  if (shouldWait) return null;

  if (isTeamMember) {
    return (
      <View style={[styles.container, styles.ownerOnly, { backgroundColor: theme.bg }]}>
        <ShieldCheck size={48} color={theme.textMuted} strokeWidth={iconTokens.stroke} />
        <Text
          style={[styles.ownerOnlyTitle, { color: theme.text }]}
          accessibilityRole="header"
          maxFontSizeMultiplier={1.4}
        >{t('common.ownerOnly')}</Text>
        <Text style={[styles.ownerOnlyText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>{t('common.ownerOnlyMsg')}</Text>
        <ActionButton
          label={t('common.back')}
          onPress={goBack}
          style={styles.ownerOnlyBtn}
          hitSlop={HIT_SLOP_8}
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScreenHeader title={t('security.title')} />

      <View
        style={[
          styles.guideContainer,
          dir.isRTL ? styles.guideAccentRight : styles.guideAccentLeft,
          { backgroundColor: theme.primaryBg, borderColor: theme.primary },
        ]}
      >
        <Text style={[styles.guideText, { color: theme.textSecondary, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>
          {t('account.securityGuideText')}
        </Text>
      </View>

      <View style={[styles.tabBar, { flexDirection: dir.row, backgroundColor: theme.bgCard, borderColor: theme.borderLight }]} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, { flexDirection: dir.row }, isActive && { backgroundColor: tab.id === 'delete' ? theme.danger : theme.primary }]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
            >
              {tab.icon}
              <Text
                style={[styles.tabLabel, { color: isActive ? '#fff' : tab.id === 'delete' ? theme.danger : theme.textMuted }]}
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={{ backgroundColor: theme.bg }}
        contentContainerStyle={[styles.scrollContent, { backgroundColor: theme.bg, paddingBottom: 100 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === 'delete' ? (
          <View key="delete">
            <View style={[styles.dangerZone, { backgroundColor: theme.danger + '08', borderColor: theme.danger + '25' }]}>
              <View style={[styles.dangerHeader, { flexDirection: dir.row }]}>
                <Trash2 size={20} color={theme.danger} strokeWidth={iconTokens.stroke} />
                <Text style={[styles.dangerTitle, { color: theme.danger }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{t('security.dangerZone')}</Text>
              </View>
              <Text style={[styles.dangerText, { color: theme.textMuted, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>
                {t('security.dangerText')}
              </Text>

              {isGoogleAccount ? (
                /* -- Google account: re-authenticate with Google -- */
                <View style={styles.mt16}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary, textAlign: dir.textAlign }]}>
                    {t('security.deleteGooglePrompt')}
                  </Text>
                  <ReauthStatus
                    theme={theme}
                    verified={!!deleteGoogleToken}
                    verifiedLabel={t('security.googleVerified')}
                    verifiedColor={theme.danger}
                    available
                    unavailableLabel={t('security.appleOnlyIos')}
                    buttonLabel={t('security.deleteGoogleBtn')}
                    buttonColor={theme.danger}
                    loading={googleDelete.isLoading}
                    onPress={googleDelete.promptGoogle}
                    error={googleDelete.error}
                  />
                </View>
              ) : isAppleAccount ? (
                /* -- Apple account: re-authenticate with Apple -- */
                <View style={styles.mt16}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary, textAlign: dir.textAlign }]}>
                    {t('security.deleteApplePrompt')}
                  </Text>
                  <ReauthStatus
                    theme={theme}
                    verified={!!deleteAppleToken}
                    verifiedLabel={t('security.appleVerified')}
                    verifiedColor={theme.danger}
                    available={appleDelete.isAvailable}
                    unavailableLabel={t('security.appleOnlyIos')}
                    buttonLabel={t('security.deleteAppleBtn')}
                    buttonColor={theme.danger}
                    loading={appleDelete.isLoading}
                    onPress={appleDelete.promptApple}
                    error={appleDelete.error}
                  />
                </View>
              ) : (
                /* -- Email account: enter password -- */
                <View style={styles.mt16}>
                  <PwdField
                    label={t('security.currentPassword')}
                    value={deletePwd}
                    setValue={setDeletePwd}
                    show={showDeletePwd}
                    setShow={setShowDeletePwd}
                    placeholder={t('security.deletePasswordPlaceholder')}
                    theme={theme}
                    variant="current"
                    showLabel={t('security.showPassword')}
                    hideLabel={t('security.hidePassword')}
                  />
                </View>
              )}
              <View style={styles.mt12}>
                <TouchableOpacity
                  style={[styles.checkboxRow, { flexDirection: dir.row }]}
                  onPress={() => setDeleteConfirmed((v) => !v)}
                  disabled={deleting}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: deleteConfirmed, disabled: deleting }}
                  accessibilityLabel={t('security.deleteConfirmLabel')}
                  hitSlop={HIT_SLOP_12}
                >
                  <View style={[
                    styles.checkbox,
                    { borderColor: deleteConfirmed ? theme.danger : theme.border, backgroundColor: deleteConfirmed ? theme.danger : 'transparent' },
                  ]}>
                    {deleteConfirmed && <Check size={14} color="#fff" strokeWidth={iconTokens.strokeSmall} />}
                  </View>
                  <Text style={[styles.fieldLabel, styles.checkboxLabel, { color: theme.textSecondary, textAlign: dir.textAlign }]}>
                    {t('security.deleteConfirmLabel')}
                  </Text>
                </TouchableOpacity>
              </View>

              <ActionButton
                label={t('security.deleteForeverBtn')}
                variant="danger"
                size="lg"
                icon={Trash2}
                loading={deleting}
                disabled={!deleteReady}
                style={[styles.deleteBtn, !deleteReady && { backgroundColor: theme.border, borderColor: theme.border }]}
                onPress={handleDeleteAccount}
              />
            </View>
          </View>
        ) : activeTab === 'password' ? (
          <View key="password">
            {isSocialAccount ? (
              <View style={styles.mb12}>
                <Text style={[styles.dangerText, styles.mb12, { color: theme.textMuted, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>
                  {t(isAppleAccount ? 'security.appleSetPasswordHint' : 'security.googleSetPasswordHint')}
                </Text>
                <ReauthStatus
                  theme={theme}
                  verified={hasSocialReauth}
                  verifiedLabel={t(isGoogleAccount ? 'security.googleVerified' : 'security.appleVerified')}
                  verifiedColor={theme.success}
                  available={isGoogleAccount || appleDelete.isAvailable}
                  unavailableLabel={t('security.appleOnlyIos')}
                  buttonLabel={t(isGoogleAccount ? 'security.deleteGoogleBtn' : 'security.deleteAppleBtn')}
                  buttonColor={theme.primary}
                  loading={socialReauthLoading}
                  onPress={isGoogleAccount ? googleDelete.promptGoogle : appleDelete.promptApple}
                  error={isGoogleAccount ? googleDelete.error : appleDelete.error}
                />
              </View>
            ) : (
              <PwdField
                label={t('security.currentPassword')}
                value={currentPwd}
                setValue={setCurrentPwd}
                show={showCurrent}
                setShow={setShowCurrent}
                placeholder={t('security.currentPwdPlaceholder')}
                theme={theme}
                variant="current"
                showLabel={t('security.showPassword')}
                hideLabel={t('security.hidePassword')}
                returnKeyType="next"
              />
            )}

            <View style={styles.mt20}>
              <PwdField
                label={t('security.newPassword')}
                value={newPwd}
                setValue={setNewPwd}
                show={showNew}
                setShow={setShowNew}
                placeholder={t('security.newPwdPlaceholder')}
                theme={theme}
                variant="new"
                showLabel={t('security.showPassword')}
                hideLabel={t('security.hidePassword')}
                returnKeyType="next"
              />
            </View>

            {newPwd.length > 0 && (
              <View
                style={[styles.strengthRow, { flexDirection: dir.row }]}
                accessibilityRole="progressbar"
                accessibilityLabel={t('security.strengthA11y', { level: strength.label })}
              >
                <View style={[styles.strengthBar, { backgroundColor: theme.border }]}>
                  <View
                    style={[styles.strengthFill, { backgroundColor: strength.color, width: strength.width }]}
                  />
                </View>
                <Text style={[styles.strengthLabel, { color: strength.color, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
                  {strength.label}
                </Text>
              </View>
            )}

            <View style={styles.mt16}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary, textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.4}>
                {t('security.confirmPassword')}
              </Text>
              <View style={[styles.inputWrapper, { flexDirection: dir.row, backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                <JitLock size={17} color={theme.textMuted} strokeWidth={iconTokens.stroke} />
                <TextInput
                  style={[styles.input, { color: theme.text, textAlign: dir.textAlign }]}
                  value={confirmPwd}
                  onChangeText={setConfirmPwd}
                  placeholder={t('security.confirmPwdPlaceholder')}
                  placeholderTextColor={theme.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  maxLength={128}
                  maxFontSizeMultiplier={1.4}
                  returnKeyType="done"
                  onSubmitEditing={handleChangePassword}
                />
                {confirmPwd.length > 0 && newPwd === confirmPwd && (
                  <Check size={18} color={theme.success} strokeWidth={iconTokens.stroke} />
                )}
              </View>
            </View>

            <ActionButton
              label={t('security.changePwdBtn')}
              size="lg"
              icon={ShieldCheck}
              loading={saving}
              disabled={!passwordReady}
              onPress={handleChangePassword}
              style={[styles.saveBtn, !passwordReady && { backgroundColor: theme.border, borderColor: theme.border }]}
            />
          </View>
        ) : (
          <View key="devices">
            <SecurityDevices />
          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  ownerOnly: { justifyContent: 'center', alignItems: 'center', padding: 32 },
  ownerOnlyTitle: { fontSize: 16, marginTop: 16, fontFamily: font.semibold, textAlign: 'center' },
  ownerOnlyText: { textAlign: 'center', marginTop: 8, fontFamily: font.regular },
  ownerOnlyBtn: { marginTop: 16, paddingHorizontal: 24 },

  mt8: { marginTop: 8 },
  mt12: { marginTop: 12 },
  mt16: { marginTop: 16 },
  mt20: { marginTop: 20 },
  mb12: { marginBottom: 12 },

  guideContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  guideAccentLeft: { borderLeftWidth: 3 },
  guideAccentRight: { borderRightWidth: 3 },
  guideText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: font.regular,
  },

  tabBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderWidth: 1,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  tabLabel: { fontSize: 13, fontFamily: font.semibold },

  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  fieldLabel: { fontSize: 14, marginBottom: 6, fontFamily: font.semibold },
  inputWrapper: {
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 13, fontFamily: font.medium },
  errorText: { fontSize: 12, marginTop: 4, fontFamily: font.regular },

  checkboxRow: { alignItems: 'center', paddingVertical: 8, gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLabel: { marginBottom: 0, flex: 1 },

  strengthRow: {
    alignItems: 'center',
    marginTop: 8,
    gap: 10,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  strengthFill: { height: '100%', borderRadius: 999 },
  strengthLabel: { fontSize: 12, minWidth: 45, fontFamily: font.semibold },

  saveBtn: { marginTop: 28 },

  dangerZone: {
    marginTop: 32,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 40,
  },
  dangerHeader: {
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  dangerTitle: {
    fontSize: 16,
    fontFamily: font.semibold,
  },
  dangerText: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: font.regular,
  },
  deleteBtn: { marginTop: 20 },
});
