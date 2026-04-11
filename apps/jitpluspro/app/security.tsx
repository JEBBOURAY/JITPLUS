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
import { useTheme, brandGradient, type ThemeColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useGoogleIdToken } from '@/hooks/useGoogleIdToken';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

// â”€â”€ PwdField (dÃ©fini HORS du composant pour Ã©viter le re-mount du TextInput) â”€â”€
interface PwdFieldProps {
  label: string;
  value: string;
  setValue: (v: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
  placeholder: string;
  theme: ThemeColors;
}

function PwdField({ label, value, setValue, show, setShow, placeholder, theme }: PwdFieldProps) {
  return (
    <>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
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
        />
        <TouchableOpacity onPress={() => setShow(!show)} hitSlop={8}>
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

  // â”€â”€ Delete account state â”€â”€
  const [deletePwd, setDeletePwd] = useState('');
  const [showDeletePwd, setShowDeletePwd] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteGoogleToken, setDeleteGoogleToken] = useState<string | null>(null);
  const googleDelete = useGoogleIdToken((idToken) => setDeleteGoogleToken(idToken));

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

  // â”€â”€ Load devices â”€â”€
  const loadDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const res = await api.get('/merchant/devices');
      setDevices(res.data ?? []);
    } catch (error) {
      logError('Security', 'Échec du chargement des appareils:', error);
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'devices') loadDevices();
  }, [activeTab, loadDevices]);

  // â”€â”€ Change password â”€â”€
  const executePasswordChange = useCallback(async (logoutOthers: boolean) => {
    setSaving(true);
    try {
      const res = await api.patch('/merchant/password', {
        ...(isGoogleAccount ? {} : { currentPassword: currentPwd }),
        newPassword: newPwd,
        logoutOthers,
      });

      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');

      const count = res.data?.devicesDisconnected || 0;
      if (logoutOthers && count > 0) {
        Alert.alert(t('common.confirm'), t('security.changePwdSuccessLogout', { count }));
      } else {
        Alert.alert(t('common.confirm'), t('security.changePwdSuccess'));
      }

      if (activeTab === 'devices') loadDevices();
    } catch (err: unknown) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('security.changePwdError')));
    } finally {
      setSaving(false);
    }
  }, [isGoogleAccount, currentPwd, newPwd, activeTab, loadDevices, t]);

  const handleChangePassword = useCallback(async () => {
    if (!isGoogleAccount && !currentPwd.trim()) {
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
  }, [isGoogleAccount, currentPwd, newPwd, confirmPwd, executePasswordChange, t]);

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

  if (shouldWait) return null;

  if (isTeamMember) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <ShieldCheck size={48} color={theme.textMuted} strokeWidth={1.5} />
        <Text style={{ color: theme.text, fontWeight: '600', fontSize: 16, marginTop: 16, fontFamily: 'Lexend_600SemiBold' }}>{t('common.ownerOnly')}</Text>
        <Text style={{ color: theme.textMuted, textAlign: 'center', marginTop: 8, fontFamily: 'Lexend_400Regular' }}>{t('common.ownerOnlyMsg')}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: theme.primary, borderRadius: 10 }}>
          <Text style={{ color: '#fff', fontWeight: '600', fontFamily: 'Lexend_600SemiBold' }}>{t('common.back')}</Text>
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
      <View collapsable={false}>
        <LinearGradient
          colors={[...brandGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerGradient}
        >
          <BlurView
            intensity={Platform.OS === 'ios' ? 40 : 20}
            tint={theme.mode === 'dark' ? 'dark' : 'default'}
            style={[styles.headerBlur, { paddingTop: insets.top + 16 }]}
          >
            <View style={styles.glassOverlay} />
            <View style={styles.header}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                <ArrowLeft size={22} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>{t('security.title')}</Text>
              <ShieldCheck size={22} color="rgba(255,255,255,0.8)" />
            </View>
          </BlurView>
        </LinearGradient>
        <LinearGradient
          colors={['rgba(124,58,237,0.3)', 'transparent']}
          style={styles.headerFade}
        />
      </View>

        {/* ── Guide text ── */}
        <View style={[styles.guideContainer, { backgroundColor: theme.primaryBg || (theme.primary + '10'), borderLeftColor: theme.primary }]}>
          <Text style={[styles.guideText, { color: theme.textSecondary }]}>
            {t('account.securityGuideText')}
          </Text>
        </View>

      {/* â”€â”€ Tab Switcher â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <View style={[styles.tabBar, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, isActive && { backgroundColor: tab.id === 'delete' ? theme.danger : theme.primary }]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
            >
              {tab.icon}
              <Text style={[styles.tabLabel, { color: isActive ? '#fff' : tab.id === 'delete' ? theme.danger : theme.textMuted }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16, paddingTop: 16 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === 'delete' ? (
          <View key="delete">
            <View style={[styles.dangerZone, { backgroundColor: theme.danger + '08', borderColor: theme.danger + '25' }]}>
              <View style={styles.dangerHeader}>
                <Trash2 size={20} color={theme.danger} />
                <Text style={[styles.dangerTitle, { color: theme.danger }]}>{t('security.dangerZone')}</Text>
              </View>
              <Text style={[styles.dangerText, { color: theme.textMuted }]}>
                {t('security.dangerText')}
              </Text>

              {isGoogleAccount ? (
                /* â”€â”€ Google account: re-authenticate with Google â”€â”€ */
                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
                    {t('security.deleteGooglePrompt')}
                  </Text>
                  {deleteGoogleToken ? (
                    <View style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.danger }]}>
                      <Check size={18} color={theme.danger} />
                      <Text style={[styles.input, { color: theme.danger, fontWeight: '600' }]}>
                        {t('security.googleVerified')}
                      </Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.inputWrapper, { backgroundColor: theme.bgInput, borderColor: theme.border, justifyContent: 'center' }]}
                      onPress={googleDelete.promptGoogle}
                      disabled={googleDelete.isLoading}
                      activeOpacity={0.7}
                    >
                      {googleDelete.isLoading ? (
                        <ActivityIndicator size="small" color={theme.danger} />
                      ) : (
                        <Text style={[styles.input, { color: theme.danger, fontWeight: '600', textAlign: 'center' }]}>
                          {t('security.deleteGoogleBtn')}
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                  {googleDelete.error ? (
                    <Text style={{ color: theme.danger, fontSize: 12, marginTop: 4, fontFamily: 'Lexend_400Regular' }}>{googleDelete.error}</Text>
                  ) : null}
                </View>
              ) : (
                /* â”€â”€ Email account: enter password â”€â”€ */
                <View style={{ marginTop: 16 }}>
                  <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{t('security.currentPassword')}</Text>
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
                    />
                    <TouchableOpacity onPress={() => setShowDeletePwd(!showDeletePwd)} hitSlop={8}>
                      {showDeletePwd ? <EyeOff size={18} color={theme.textMuted} /> : <Eye size={18} color={theme.textMuted} />}
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={{ marginTop: 12 }}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
                  onPress={() => setDeleteConfirmed((v) => !v)}
                  activeOpacity={0.7}
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
                      (isGoogleAccount ? !!deleteGoogleToken : deletePwd.length >= 6) && deleteConfirmed
                        ? theme.danger
                        : theme.border,
                  },
                ]}
                disabled={deleting || (isGoogleAccount ? !deleteGoogleToken : deletePwd.length < 6) || !deleteConfirmed}
                activeOpacity={0.8}
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
                          setDeleting(true);
                          try {
                            const body = isGoogleAccount
                              ? { idToken: deleteGoogleToken }
                              : { password: deletePwd };
                            await api.post('/merchant/delete-account', body);
                            Alert.alert(
                              t('security.deletedTitle'),
                              t('security.deletedSuccess'),
                              [{ text: 'OK', onPress: () => signOut() }],
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
            {isGoogleAccount ? (
              <Text style={[styles.dangerText, { color: theme.textMuted, marginBottom: 12 }]}>
                {t('security.googleSetPasswordHint')}
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
              />
            </View>

            {/* Strength bar */}
            {newPwd.length > 0 && (
              <View style={styles.strengthRow}>
                <View style={[styles.strengthBar, { backgroundColor: theme.border }]}>
                  <View
                    style={[styles.strengthFill, { backgroundColor: strength.color, width: strength.width }]}
                  />
                </View>
                <Text style={[styles.strengthLabel, { color: strength.color }]}>
                  {strength.label}
                </Text>
              </View>
            )}

            <View style={{ marginTop: 16 }}>
              <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>
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
                    (isGoogleAccount || currentPwd) && isValidPassword(newPwd) && newPwd === confirmPwd
                      ? theme.primary
                      : theme.border,
                },
              ]}
              onPress={handleChangePassword}
              disabled={saving || (!isGoogleAccount && !currentPwd) || !isValidPassword(newPwd) || newPwd !== confirmPwd}
              activeOpacity={0.8}
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
                <Text style={[styles.emptyTitle, { color: theme.text }]}>
                  {t('security.noDevices')}
                </Text>
                <Text style={[styles.emptyText, { color: theme.textMuted }]}>
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
                        <Text style={[styles.deviceName, { color: theme.text }]}>
                          {device.deviceName}
                        </Text>
                        {device.isCurrentDevice && (
                          <View style={[styles.currentBadge, { backgroundColor: theme.success + '18' }]}>
                            <Text style={[styles.currentBadgeText, { color: theme.success }]}>
                              {t('security.currentDevice')}
                            </Text>
                          </View>
                        )}
                      </View>
                      {device.deviceOS && (
                        <Text style={[styles.deviceOS, { color: theme.textMuted }]}>
                          {device.deviceOS}
                        </Text>
                      )}
                      {device.userName && (
                        <View style={[styles.deviceMeta, { marginTop: 3 }]}>
                          <User size={11} color={device.userType === 'team_member' ? theme.warning : theme.primary} />
                          <Text style={[styles.deviceMetaText, { color: device.userType === 'team_member' ? theme.warning : theme.primary, fontWeight: '600' }]}>
                            {device.userName}
                          </Text>
                          <View style={[
                            styles.userTypeBadge,
                            { backgroundColor: device.userType === 'team_member' ? theme.warning + '18' : theme.primary + '12' },
                          ]}>
                            <Text style={[
                              styles.userTypeBadgeText,
                              { color: device.userType === 'team_member' ? theme.warning : theme.primary },
                            ]}>
                              {device.userType === 'team_member' ? t('security.teamBadge') : t('security.ownerBadge')}
                            </Text>
                          </View>
                        </View>
                      )}
                      <View style={styles.deviceMeta}>
                        <Clock size={11} color={theme.textMuted} />
                        <Text style={[styles.deviceMetaText, { color: theme.textMuted }]}>
                          {timeAgo(device.lastActiveAt)}
                        </Text>
                        {device.ipAddress && (
                          <>
                            <Wifi size={11} color={theme.textMuted} style={{ marginLeft: 8 }} />
                            <Text style={[styles.deviceMetaText, { color: theme.textMuted }]}>
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

  // Header — glassmorphism
  headerGradient: { overflow: 'hidden' },
  headerBlur: { overflow: 'hidden' },
  glassOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '700', marginLeft: 8, color: '#FFFFFF', fontFamily: 'Lexend_700Bold', letterSpacing: -0.3 },
  headerFade: { height: 4 },

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
  input: { flex: 1, fontSize: 15, paddingVertical: 13, fontFamily: 'Lexend_500Medium' },

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
