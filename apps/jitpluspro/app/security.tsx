import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  DimensionValue,
  KeyboardAvoidingView,
  Platform,
  I18nManager,
} from 'react-native';
import { timeAgo } from '@/utils/date';
import { logError } from '@/utils/devLogger';
import {
  ArrowLeft,
  Lock,
  Eye,
  EyeOff,
  Smartphone,
  Trash2,
  ShieldCheck,
  Wifi,
  Clock,
  Check,
  User,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '@/services/api';
import { getErrorMessage } from '@/utils/error';
import { isValidPassword } from '@/utils/passwordStrength';
import { useAuth } from '@/contexts/AuthContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGoogleIdToken } from '@/hooks/useGoogleIdToken';
import { useAppleIdToken } from '@/hooks/useAppleIdToken';

// ── PwdField (défini HORS du composant pour éviter le re-mount du TextInput) ──
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
  /** a11y label for the show/hide toggle */
  showLabel?: string;
  hideLabel?: string;
  /** input ref helpers */
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
}

function PwdField({
  label, value, setValue, show, setShow, placeholder, theme,
  variant = 'current', showLabel, hideLabel, returnKeyType, onSubmitEditing,
}: PwdFieldProps) {
  return (
    <>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>{label}</Text>
      <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
        <Lock size={17} color={theme.textMuted} />
        <TextInput
          style={[styles.input, { color: theme.text }]}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={variant === 'new' ? 'new-password' : 'current-password'}
          textContentType={variant === 'new' ? 'newPassword' : 'password'}
          passwordRules={variant === 'new' ? 'minlength: 8; required: upper; required: digit; required: special;' : undefined}
          maxLength={128}
          maxFontSizeMultiplier={1.4}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={returnKeyType === 'done'}
        />
        <TouchableOpacity
          onPress={() => setShow(!show)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={show ? (hideLabel ?? 'Hide password') : (showLabel ?? 'Show password')}
          accessibilityState={{ checked: show }}
        >
          {show ? <EyeOff size={18} color={theme.textMuted} /> : <Eye size={18} color={theme.textMuted} />}
        </TouchableOpacity>
      </View>
    </>
  );
}

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface DeviceSession {
  id: string;
  deviceName: string;
  deviceOS?: string;
  userType?: string;
  userEmail?: string;
  userName?: string;
  lastActiveAt: string;
  ipAddress?: string;
  isCurrentDevice: boolean;
  createdAt: string;
}

type TabId = 'password' | 'devices' | 'delete';

export default function SecurityScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { signOut, merchant, isTeamMember } = useAuth();
  const { t } = useLanguage();

  const isGoogleAccount = !!merchant?.googleId;
  const isAppleAccount = !!merchant?.appleId;
  const isSocialAccount = isGoogleAccount || isAppleAccount;

  const [activeTab, setActiveTab] = useState<TabId>(
    params.tab === 'devices' ? 'devices' : params.tab === 'delete' ? 'delete' : 'password',
  );

  // â”€â”€ Password state â”€â”€
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Delete account state ──
  const [deletePwd, setDeletePwd] = useState('');
  const [showDeletePwd, setShowDeletePwd] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteGoogleToken, setDeleteGoogleToken] = useState<string | null>(null);
  const googleDelete = useGoogleIdToken((idToken) => setDeleteGoogleToken(idToken));
  const [deleteAppleToken, setDeleteAppleToken] = useState<string | null>(null);
  const appleDelete = useAppleIdToken((data) => setDeleteAppleToken(data.identityToken));

  // â”€â”€ Devices state â”€â”€
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(true);

  // ── Password strength ──
  const strength = useMemo(() => {
    if (newPwd.length === 0) return { label: '', color: theme.border, width: '0%' as DimensionValue };
    let score = 0;
    if (newPwd.length >= 8) score++;
    if (newPwd.length >= 10) score++;
    if (/[A-Z]/.test(newPwd)) score++;
    if (/[0-9]/.test(newPwd)) score++;
    if (/[^A-Za-z0-9]/.test(newPwd)) score++;

    if (score <= 1) return { label: t('security.strengthWeak'), color: theme.danger, width: '20%' as DimensionValue };
    if (score <= 2) return { label: t('security.strengthMedium'), color: theme.warning, width: '45%' as DimensionValue };
    if (score <= 3) return { label: t('security.strengthGood'), color: theme.primary, width: '70%' as DimensionValue };
    return { label: t('security.strengthStrong'), color: theme.success, width: '100%' as DimensionValue };
  }, [newPwd, theme, t]);

  // ── Load devices ──
  const loadDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const res = await api.get('/merchant/devices');
      setDevices(res.data ?? []);
    } catch (error) {
      logError('Security', 'Failed to load devices:', error);
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'devices') loadDevices();
  }, [activeTab, loadDevices]);

  // ── Change password ──
  const executePasswordChange = useCallback(async (logoutOthers: boolean) => {
    setSaving(true);
    try {
      const res = await api.patch('/merchant/password', {
        ...(isSocialAccount ? {} : { currentPassword: currentPwd }),
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
        Alert.alert(t('common.success'), t('security.changePwdSuccessLogout', { count }));
      } else {
        Alert.alert(t('common.success'), t('security.changePwdSuccess'));
      }

      if (activeTab === 'devices') loadDevices();
    } catch (err: unknown) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('security.changePwdError')));
    } finally {
      setSaving(false);
    }
  }, [isSocialAccount, currentPwd, newPwd, activeTab, loadDevices, t]);

  const handleChangePassword = useCallback(async () => {
    if (!isSocialAccount && !currentPwd.trim()) {
      Alert.alert(t('common.error'), t('security.enterCurrentPassword'));
      return;
    }
    if (!isValidPassword(newPwd)) {
      Alert.alert(t('common.error'), t('security.passwordRequirements'));
      return;
    }
    if (newPwd !== confirmPwd) {
      Alert.alert(t('common.error'), t('security.passwordMismatch'));
      return;
    }

    // Demander d'abord si on dÃ©connecte les autres, puis faire un seul appel API
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
  }, [isSocialAccount, currentPwd, newPwd, confirmPwd, executePasswordChange, t]);

  // â”€â”€ Remove device â”€â”€
  const handleRemoveDevice = useCallback((device: DeviceSession) => {
    Alert.alert(
      t('security.disconnectTitle'),
      t('security.disconnectMsg', { name: device.deviceName }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('security.disconnect'),
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/merchant/devices/${device.id}`);
              setDevices((prev) => prev.filter((d) => d.id !== device.id));
            } catch {
              Alert.alert(t('common.error'), t('security.disconnectError'));
            }
          },
        },
      ],
    );
  }, [t]);

  const goBack = useCallback(() => router.back(), [router]);

  if (shouldWait) return null;

  if (isTeamMember) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <ShieldCheck size={48} color={theme.textMuted} strokeWidth={1.5} />
        <Text
          style={{ color: theme.text, fontWeight: '600', fontSize: 16, marginTop: 16, fontFamily: 'Lexend_600SemiBold', textAlign: 'center' }}
          accessibilityRole="header"
          maxFontSizeMultiplier={1.4}
        >{t('common.ownerOnly')}</Text>
        <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 8, fontFamily: 'Lexend_400Regular' }} maxFontSizeMultiplier={1.4}>{t('common.ownerOnlyMsg')}</Text>
        <TouchableOpacity
          onPress={goBack}
          style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: theme.primary, borderRadius: 10 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: '#fff', fontWeight: '600', fontFamily: 'Lexend_600SemiBold' }} maxFontSizeMultiplier={1.3}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'password', label: t('security.tabPassword'), icon: <Lock size={15} color={activeTab === 'password' ? '#fff' : theme.textMuted} /> },
    { id: 'devices', label: t('security.tabDevices'), icon: <Smartphone size={15} color={activeTab === 'devices' ? '#fff' : theme.textMuted} /> },
    { id: 'delete', label: t('security.tabDelete'), icon: <Trash2 size={15} color={activeTab === 'delete' ? '#fff' : theme.danger} /> },
  ];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {/* ── Simple header — matches activity style ── */}
      <View style={[styles.headerBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={goBack}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <ArrowLeft
            size={22}
            color={theme.text}
            style={I18nManager.isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3} accessibilityRole="header">{t('security.title')}</Text>
      </View>

        {/* ── Guide text ── */}
        <View style={[styles.guideContainer, { backgroundColor: theme.primaryBg || (theme.primary + '10'), borderLeftColor: theme.primary }]}>
          <Text style={[styles.guideText, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>
            {t('account.securityGuideText')}
          </Text>
        </View>

      {/* â”€â”€ Tab Switcher â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <View style={[styles.tabBar, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, isActive && { backgroundColor: tab.id === 'delete' ? theme.danger : theme.primary }]}
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
        contentContainerStyle={{ paddingBottom: 100 + insets.bottom, paddingHorizontal: 16, paddingTop: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === 'delete' ? (
          <View key="delete">
            <View style={[styles.dangerZone, { backgroundColor: theme.danger + '08', borderColor: theme.danger + '25' }]}>
              <View style={styles.dangerHeader}>
                <Trash2 size={20} color={theme.danger} />
                <Text style={[styles.dangerTitle, { color: theme.danger }]} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{t('security.dangerZone')}</Text>
              </View>
              <Text style={[styles.dangerText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
                {t('security.dangerText')}
              </Text>

              {isGoogleAccount ? (
                /* -- Google account: re-authenticate with Google -- */
                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                    {t('security.deleteGooglePrompt')}
                  </Text>
                  {deleteGoogleToken ? (
                    <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.danger }]} accessible accessibilityLabel={t('security.googleVerified')}>
                      <Check size={18} color={theme.danger} accessibilityElementsHidden importantForAccessibility="no" />
                      <Text style={[styles.input, { color: theme.danger, fontWeight: '600' }]} maxFontSizeMultiplier={1.4}>
                        {t('security.googleVerified')}
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border, justifyContent: 'center' }]}
                      onPress={googleDelete.promptGoogle}
                      disabled={googleDelete.isLoading}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={t('security.deleteGoogleBtn')}
                      accessibilityState={{ busy: googleDelete.isLoading, disabled: googleDelete.isLoading }}
                    >
                      {googleDelete.isLoading ? (
                        <ActivityIndicator size="small" color={theme.danger} />
                      ) : (
                        <Text style={[styles.input, { color: theme.danger, fontWeight: '600', textAlign: 'center' }]} maxFontSizeMultiplier={1.4}>
                          {t('security.deleteGoogleBtn')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                  {googleDelete.error ? (
                    <Text
                      style={{ color: theme.danger, fontSize: 12, marginTop: 4, fontFamily: 'Lexend_400Regular' }}
                      accessibilityLiveRegion="polite"
                      accessibilityRole="alert"
                    >{googleDelete.error}</Text>
                  ) : null}
                </View>
              ) : isAppleAccount ? (
                /* -- Apple account: re-authenticate with Apple -- */
                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                    {t('security.deleteApplePrompt')}
                  </Text>
                  {deleteAppleToken ? (
                    <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.danger }]} accessible accessibilityLabel={t('security.appleVerified')}>
                      <Check size={18} color={theme.danger} accessibilityElementsHidden importantForAccessibility="no" />
                      <Text style={[styles.input, { color: theme.danger, fontWeight: '600' }]} maxFontSizeMultiplier={1.4}>
                        {t('security.appleVerified')}
                      </Text>
                    </View>
                  ) : appleDelete.isAvailable ? (
                    <TouchableOpacity
                      style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border, justifyContent: 'center' }]}
                      onPress={appleDelete.promptApple}
                      disabled={appleDelete.isLoading}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={t('security.deleteAppleBtn')}
                      accessibilityState={{ busy: appleDelete.isLoading, disabled: appleDelete.isLoading }}
                    >
                      {appleDelete.isLoading ? (
                        <ActivityIndicator size="small" color={theme.danger} />
                      ) : (
                        <Text style={[styles.input, { color: theme.danger, fontWeight: '600', textAlign: 'center' }]} maxFontSizeMultiplier={1.4}>
                          {t('security.deleteAppleBtn')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <Text style={[styles.fieldLabel, { color: theme.textMuted, marginTop: 8 }]} maxFontSizeMultiplier={1.4}>
                      {t('security.appleOnlyIos')}
                    </Text>
                  )}
                  {appleDelete.error ? (
                    <Text
                      style={{ color: theme.danger, fontSize: 12, marginTop: 4, fontFamily: 'Lexend_400Regular' }}
                      accessibilityLiveRegion="polite"
                      accessibilityRole="alert"
                    >{appleDelete.error}</Text>
                  ) : null}
                </View>
              ) : (
                /* -- Email account: enter password -- */
                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>{t('security.currentPassword')}</Text>
                  <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                    <Lock size={17} color={theme.textMuted} />
                    <TextInput
                      style={[styles.input, { color: theme.text }]}
                      value={deletePwd}
                      onChangeText={setDeletePwd}
                      placeholder={t('security.deletePasswordPlaceholder')}
                      placeholderTextColor={theme.textMuted}
                      secureTextEntry={!showDeletePwd}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="current-password"
                      textContentType="password"
                      maxLength={128}
                      maxFontSizeMultiplier={1.4}
                    />
                    <TouchableOpacity
                      onPress={() => setShowDeletePwd(!showDeletePwd)}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      accessibilityRole="button"
                      accessibilityLabel={showDeletePwd ? t('security.hidePassword') : t('security.showPassword')}
                      accessibilityState={{ checked: showDeletePwd }}
                    >
                      {showDeletePwd ? <EyeOff size={18} color={theme.textMuted} /> : <Eye size={18} color={theme.textMuted} />}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              <View style={{ marginTop: 12 }}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
                  onPress={() => setDeleteConfirmed((v) => !v)}
                  disabled={deleting}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: deleteConfirmed, disabled: deleting }}
                  accessibilityLabel={t('security.deleteConfirmLabel')}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <View style={[
                    { width: 22, height: 22, borderRadius: 4, borderWidth: 2, marginRight: 10, alignItems: 'center', justifyContent: 'center' },
                    { borderColor: deleteConfirmed ? theme.danger : theme.border, backgroundColor: deleteConfirmed ? theme.danger : 'transparent' },
                  ]}>
                    {deleteConfirmed && <Check size={14} color="#fff" strokeWidth={3} />}
                  </View>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary, marginBottom: 0, flex: 1 }]}>
                    {t('security.deleteConfirmLabel')}
                  </Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[
                  styles.deleteBtn,
                  {
                    backgroundColor:
                      (isGoogleAccount ? !!deleteGoogleToken : isAppleAccount ? !!deleteAppleToken : isValidPassword(deletePwd)) && deleteConfirmed
                        ? theme.danger
                        : theme.border,
                  },
                ]}
                disabled={deleting || (isGoogleAccount ? !deleteGoogleToken : isAppleAccount ? !deleteAppleToken : !isValidPassword(deletePwd)) || !deleteConfirmed}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('security.deleteForeverBtn')}
                accessibilityState={{ disabled: deleting || (isGoogleAccount ? !deleteGoogleToken : isAppleAccount ? !deleteAppleToken : !isValidPassword(deletePwd)) || !deleteConfirmed }}
                onPress={() => {
                  Alert.alert(
                    t('security.deleteFinalTitle'),
                    t('security.deleteFinalMsg'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      {
                        text: t('security.deleteForeverBtn'),
                        style: 'destructive',
                        onPress: async () => {
                          if (isGoogleAccount && !deleteGoogleToken) {
                            Alert.alert(t('common.error'), t('security.deleteGooglePrompt'));
                            return;
                          }
                          if (isAppleAccount && !deleteAppleToken) {
                            Alert.alert(t('common.error'), t('security.deleteApplePrompt'));
                            return;
                          }
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
                              [{ text: t('common.confirm'), onPress: () => signOut() }],
                              { cancelable: false },
                            );
                          } catch (err: unknown) {
                            Alert.alert(t('common.error'), getErrorMessage(err, t('security.deleteAccountError')));
                          } finally {
                            setDeleting(false);
                          }
                        },
                      },
                    ],
                  );
                }}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Trash2 size={18} color="#fff" strokeWidth={1.5} />
                    <Text style={styles.deleteBtnText}>{t('security.deleteForeverBtn')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : activeTab === 'password' ? (
          <View key="password">
            {isSocialAccount ? (
              <Text style={[styles.dangerText, { color: theme.textMuted, marginBottom: 12 }]} maxFontSizeMultiplier={1.4}>
                {t(isAppleAccount ? 'security.appleSetPasswordHint' : 'security.googleSetPasswordHint')}
              </Text>
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

            <View style={{ marginTop: 20 }}>
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

            {/* Strength bar */}
            {newPwd.length > 0 && (
              <View
                style={styles.strengthRow}
                accessibilityRole="progressbar"
                accessibilityLabel={t('security.strengthA11y', { level: strength.label })}
              >
                <View style={[styles.strengthBar, { backgroundColor: theme.border }]}>
                  <View
                    style={[styles.strengthFill, { backgroundColor: strength.color, width: strength.width }]}
                  />
                </View>
                <Text style={[styles.strengthLabel, { color: strength.color }]} maxFontSizeMultiplier={1.3}>
                  {strength.label}
                </Text>
              </View>
            )}

            <View style={{ marginTop: 16 }}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]} maxFontSizeMultiplier={1.4}>
                {t('security.confirmPassword')}
              </Text>
              <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border }]}>
                <Lock size={17} color={theme.textMuted} />
                <TextInput
                  style={[styles.input, { color: theme.text }]}
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
                  <Check size={18} color={theme.success} />
                )}
              </View>
            </View>

            {/* Save button */}
            <TouchableOpacity
              style={[
                styles.saveBtn,
                {
                  backgroundColor:
                    (isSocialAccount || currentPwd) && isValidPassword(newPwd) && newPwd === confirmPwd
                      ? theme.primary
                      : theme.border,
                },
              ]}
              onPress={handleChangePassword}
              disabled={saving || (!isSocialAccount && !currentPwd) || !isValidPassword(newPwd) || newPwd !== confirmPwd}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('security.changePwdBtn')}
              accessibilityState={{ disabled: saving || (!isSocialAccount && !currentPwd) || !isValidPassword(newPwd) || newPwd !== confirmPwd, busy: saving }}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <ShieldCheck size={18} color="#fff" strokeWidth={1.5} />
                  <Text style={styles.saveBtnText}>{t('security.changePwdBtn')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View key="devices">
            {loadingDevices ? (
              <View style={styles.loadingCenter}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            ) : devices.length === 0 ? (
              <View style={styles.emptyDevices}>
                <Smartphone size={48} color={theme.textMuted} strokeWidth={1.5} />
                <Text style={[styles.emptyTitle, { color: theme.text }]} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
                  {t('security.noDevices')}
                </Text>
                <Text style={[styles.emptyText, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
                  {t('security.noDevicesHint')}
                </Text>
              </View>
            ) : (
              devices.map((device) => (
                <View
                  key={device.id}
                  style={[styles.deviceCard, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}
                >
                  <View style={styles.deviceRow}>
                    <View
                      style={[
                        styles.deviceIcon,
                        {
                          backgroundColor: device.isCurrentDevice
                            ? theme.success + '15'
                            : theme.primary + '12',
                        },
                      ]}
                    >
                      <Smartphone
                        size={20}
                        color={device.isCurrentDevice ? theme.success : theme.primary}
                      />
                    </View>
                    <View style={styles.deviceInfo}>
                      <View style={styles.deviceNameRow}>
                        <Text style={[styles.deviceName, { color: theme.text }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                          {device.deviceName}
                        </Text>
                        {device.isCurrentDevice && (
                          <View style={[styles.currentBadge, { backgroundColor: theme.success + '18' }]}>
                            <Text style={[styles.currentBadgeText, { color: theme.success }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                              {t('security.currentDevice')}
                            </Text>
                          </View>
                        )}
                      </View>
                      {device.deviceOS && (
                        <Text style={[styles.deviceOS, { color: theme.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                          {device.deviceOS}
                        </Text>
                      )}
                      {device.userName && (
                        <View style={[styles.deviceMeta, { marginTop: 3 }]}>
                          <User size={11} color={device.userType === 'team_member' ? theme.warning : theme.primary} />
                          <Text style={[styles.deviceMetaText, { color: device.userType === 'team_member' ? theme.warning : theme.primary, fontWeight: '600' }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
                            {device.userName}
                          </Text>
                          <View style={[
                            styles.userTypeBadge,
                            { backgroundColor: device.userType === 'team_member' ? theme.warning + '18' : theme.primary + '12' },
                          ]}>
                            <Text style={[
                              styles.userTypeBadgeText,
                              { color: device.userType === 'team_member' ? theme.warning : theme.primary },
                            ]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                              {device.userType === 'team_member' ? t('security.teamBadge') : t('security.ownerBadge')}
                            </Text>
                          </View>
                        </View>
                      )}
                      <View style={styles.deviceMeta}>
                        <Clock size={11} color={theme.textMuted} />
                        <Text style={[styles.deviceMetaText, { color: theme.textMuted }]} numberOfLines={1}>
                          {timeAgo(device.lastActiveAt)}
                        </Text>
                        {device.ipAddress && (
                          <>
                            <Wifi size={11} color={theme.textMuted} style={{ marginLeft: 8 }} />
                            <Text
                              style={[styles.deviceMetaText, { color: theme.textMuted }]}
                              numberOfLines={1}
                              accessibilityLabel={`IP ${device.ipAddress.split('.').join(' ')}`}
                            >
                              {device.ipAddress}
                            </Text>
                          </>
                        )}
                      </View>
                    </View>

                    {!device.isCurrentDevice && (
                      <TouchableOpacity
                        onPress={() => handleRemoveDevice(device)}
                        style={[styles.removeBtn, { backgroundColor: theme.danger + '12' }]}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('security.removeDeviceA11y')}
                      >
                        <Trash2 size={16} color={theme.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const styles = StyleSheet.create({
  guideContainer: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderLeftWidth: 3,
  },
  guideText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Lexend_400Regular',
  },
  container: { flex: 1 },

  // Header — simple bar (activity style)
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    marginLeft: 8,
    fontFamily: 'Lexend_700Bold',
    letterSpacing: -0.5,
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 6,
  },
  tabLabel: { fontSize: 13, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },

  // Password form
  fieldLabel: { fontSize: 14, fontWeight: '600', marginBottom: 6, fontFamily: 'Lexend_600SemiBold' },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 10,
  },
  input: { flex: 1, fontSize: 15, paddingVertical: 13, fontFamily: 'Lexend_500Medium', textAlign: I18nManager.isRTL ? 'right' : 'left' },

  strengthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 10,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  strengthFill: { height: '100%', borderRadius: 2 },
  strengthLabel: { fontSize: 12, fontWeight: '600', minWidth: 45, fontFamily: 'Lexend_600SemiBold' },

  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 28,
    gap: 10,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'Lexend_700Bold' },

  // Devices
  loadingCenter: { alignItems: 'center', paddingTop: 60 },
  emptyDevices: { alignItems: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginTop: 16, fontFamily: 'Lexend_700Bold' },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 30,
    lineHeight: 20,
    fontFamily: 'Lexend_400Regular',
  },

  deviceCard: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  deviceRow: { flexDirection: 'row', alignItems: 'center' },
  deviceIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceInfo: { flex: 1, marginLeft: 14 },
  deviceNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deviceName: { fontSize: 15, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
  currentBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  currentBadgeText: { fontSize: 10, fontWeight: '700', fontFamily: 'Lexend_700Bold' },
  deviceOS: { fontSize: 12, marginTop: 2, fontFamily: 'Lexend_400Regular' },
  deviceMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  deviceMetaText: { fontSize: 11, fontFamily: 'Lexend_400Regular' },
  userTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 6,
  },
  userTypeBadgeText: { fontSize: 9, fontWeight: '700', fontFamily: 'Lexend_700Bold' },

  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Danger zone
  dangerZone: {
    marginTop: 32,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 40,
  },
  dangerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  dangerTitle: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
  dangerText: {
    fontSize: 13,
    lineHeight: 20,
    fontFamily: 'Lexend_400Regular',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
    gap: 10,
  },
  deleteBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Lexend_700Bold',
  },
});
