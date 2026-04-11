import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, RefreshControl, Pressable, Alert, Platform, Linking,
  TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Image,
  AppState, AppStateStatus,
} from 'react-native';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import {
  User, LogOut, Phone, Mail, Pencil, Check, X, Trash2, AlertTriangle,
  Share2, MessageCircle, ChevronDown, ChevronRight, Moon, Globe, FileDown, Shield,
  Star, MessageSquare, Calendar, Sparkles, Lock, ShieldCheck, Gift,
} from 'lucide-react-native';
import { haptic, HapticStyle } from '@/utils/haptics';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/services/api';
import FadeInView from '@/components/FadeInView';
import GuestGuard from '@/components/GuestGuard';
import Skeleton from '@/components/Skeleton';
import { DeleteAccountModal, OtpVerificationModal, LanguageModal, profileStyles as styles } from '@/components/profile';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { isValidEmail } from '@/utils/validation';
import { extractErrorMessage } from '@/utils/errorMessage';
import { formatDateInput, toIsoDate, isoDtoDmy } from '@/utils/dateInput';
import { DRAFT_PERSIST_DEBOUNCE_MS, OTP_RESEND_COOLDOWN_S, getStoreUrl } from '@/constants';
import PremiumPhoneInput from '@/components/PremiumPhoneInput';
import { DEFAULT_COUNTRY, COUNTRY_CODES, isValidPhoneForCountry, type CountryCode } from '@/utils/countryCodes';

export default function ProfileScreen() {
  const theme = useTheme();
  const { t, locale, setLocale } = useLanguage();
  const { client, logout, refreshProfile, isGuest } = useAuth();
  const router = useRouter();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(!client);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [prefExpanded, setPrefExpanded] = useState(false);
  const [compteExpanded, setCompteExpanded] = useState(false);

  // Editable fields
  const [editPrenom, setEditPrenom] = useState('');
  const [editNom, setEditNom] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTelephone, setEditTelephone] = useState('');
  const [editPhoneCountry, setEditPhoneCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [editPhoneLocal, setEditPhoneLocal] = useState('');
  const [editDateNaissance, setEditDateNaissance] = useState('');

  // Preferences
  const [shareInfoMerchants, setShareInfoMerchants] = useState(client?.shareInfoMerchants ?? false);
  const [notifWhatsapp, setNotifWhatsapp] = useState(client?.notifWhatsapp ?? true);
  const [isSavingPref, setIsSavingPref] = useState<string | null>(null);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // OTP verification for contact changes
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpTarget, setOtpTarget] = useState<{ type: 'email' | 'telephone'; value: string } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [otpResendTimer, setOtpResendTimer] = useState(0);


  // ── Profile completion progress ──
  const profileChecklist = useMemo(() => ([
    { key: 'email', done: !!client?.email, label: t('home.profileFieldEmail') },
    { key: 'emailVerified', done: !!client?.emailVerified, label: t('home.profileFieldEmailVerified') },
    { key: 'phone', done: !!client?.telephone, label: t('home.profileFieldPhone') },
    { key: 'phoneVerified', done: !!client?.telephoneVerified, label: t('home.profileFieldPhoneVerified') },
    { key: 'birthDate', done: !!client?.dateNaissance, label: t('home.profileFieldBirthDate') },
  ]), [client?.email, client?.emailVerified, client?.telephone, client?.telephoneVerified, client?.dateNaissance, t]);

  const profileCompletionPercent = useMemo(() => {
    const doneCount = profileChecklist.filter((f) => f.done).length;
    return Math.round((doneCount / profileChecklist.length) * 100);
  }, [profileChecklist]);

  const missingProfileLabels = useMemo(
    () => profileChecklist.filter((f) => !f.done).map((f) => f.label),
    [profileChecklist],
  );

  const profileSummaryTitle = missingProfileLabels.length
    ? t('home.completeProfileTitle')
    : t('home.profileCompleteTitle');

  const profileSummaryHint = missingProfileLabels.length
    ? t('home.completeProfileHint', { fields: missingProfileLabels.join(', ') })
    : t('home.profileCompleteHint');

  // ── Persist editing draft when user leaves app (call, task switch) ──
  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced draft values — captured via ref so AppState listener doesn't
  // cause re-subscriptions on every keystroke.
  const draftRef = useRef({ editPrenom, editNom, editEmail, editTelephone, editPhoneLocal, editPhoneCountry: editPhoneCountry.code, editDateNaissance });
  draftRef.current = { editPrenom, editNom, editEmail, editTelephone, editPhoneLocal, editPhoneCountry: editPhoneCountry.code, editDateNaissance };

  useEffect(() => {
    const handleAppState = async (nextState: AppStateStatus) => {
      if (nextState === 'background' && isEditingRef.current) {
        // Debounce: only persist once when going to background
        if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        draftTimerRef.current = setTimeout(async () => {
          try {
            await SecureStore.setItemAsync('profile_draft', JSON.stringify(draftRef.current));
          } catch { /* best-effort */ }
        }, DRAFT_PERSIST_DEBOUNCE_MS);
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => {
      sub.remove();
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    };
  }, []);

  // Restore draft on mount (if the app was killed during editing)
  useEffect(() => {
    SecureStore.getItemAsync('profile_draft').then((raw) => {
      if (!raw) return;
      try {
        const d = JSON.parse(raw);
        setEditPrenom(d.editPrenom || '');
        setEditNom(d.editNom || '');
        setEditEmail(d.editEmail || '');
        setEditTelephone(d.editTelephone || '');
        setEditPhoneLocal(d.editPhoneLocal || '');
        if (d.editPhoneCountry) {
          const found = COUNTRY_CODES.find((c) => c.code === d.editPhoneCountry);
          if (found) setEditPhoneCountry(found);
        }
        setEditDateNaissance(d.editDateNaissance || '');
        setIsEditing(true);
        setInfoExpanded(true);
      } catch { /* corrupt draft, ignore */ }
      SecureStore.deleteItemAsync('profile_draft').catch(() => {});
    });
  }, []);

  useFocusEffect(useCallback(() => {
    // Reset banner visibility each time the screen is focused
    if (!client) refreshProfile?.().finally(() => setIsLoading(false));
    if (client) {
      setShareInfoMerchants(client.shareInfoMerchants ?? false);
      setNotifWhatsapp(client.notifWhatsapp ?? true);
    }
  }, [client, refreshProfile]));

  const startEditing = () => {
    setEditPrenom(client?.prenom || '');
    setEditNom(client?.nom || '');
    setEditEmail(client?.email || '');
    // Parse existing phone into country + local digits
    const rawPhone = client?.telephone || '';
    if (rawPhone.startsWith('+')) {
      const match = COUNTRY_CODES.find((c) => rawPhone.startsWith(c.dial));
      if (match) {
        setEditPhoneCountry(match);
        setEditPhoneLocal(rawPhone.slice(match.dial.length));
      } else {
        setEditPhoneCountry(DEFAULT_COUNTRY);
        setEditPhoneLocal(rawPhone.replace(/[^0-9]/g, ''));
      }
    } else {
      setEditPhoneCountry(DEFAULT_COUNTRY);
      setEditPhoneLocal(rawPhone.replace(/[^0-9]/g, ''));
    }
    setEditTelephone(rawPhone);
    setEditDateNaissance(isoDtoDmy(client?.dateNaissance));
    setInfoExpanded(true);
    setIsEditing(true);
    haptic(HapticStyle.Light);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    SecureStore.deleteItemAsync('profile_draft').catch(() => {});
    haptic(HapticStyle.Light);
  };

  // ── OTP resend timer ──
  useEffect(() => {
    if (otpResendTimer <= 0) return;
    const id = setTimeout(() => setOtpResendTimer((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [otpResendTimer]);

  const startOtpFlow = async (target: { type: 'email' | 'telephone'; value: string }) => {
    setOtpTarget(target);
    setOtpCode('');
    setOtpError('');
    setIsSendingOtp(true);
    try {
      await api.sendChangeContactOtp(target.type, target.value);
      setOtpResendTimer(OTP_RESEND_COOLDOWN_S);
      setShowOtpModal(true);
    } catch (error) {
      const msg = extractErrorMessage(error);
      Alert.alert(t('common.error'), msg);
    } finally {
      setIsSendingOtp(false);
    }
  };

  const verifyOtpAndApply = async () => {
    if (!otpTarget || otpCode.length !== 6) return;
    setIsVerifyingOtp(true);
    setOtpError('');
    try {
      await api.verifyChangeContactOtp(otpTarget.type, otpTarget.value, otpCode);
      setShowOtpModal(false);
      await refreshProfile?.();
      const fieldLabel = otpTarget.type === 'email' ? t('profile.email') : t('profile.phone');
      Alert.alert(t('common.success'), t('profile.otpContactUpdated', { field: fieldLabel }));
    } catch (error) {
      const msg = extractErrorMessage(error);
      setOtpError(msg || t('profile.otpVerifyError'));
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const resendOtp = async () => {
    if (!otpTarget || otpResendTimer > 0) return;
    setIsSendingOtp(true);
    setOtpError('');
    try {
      await api.sendChangeContactOtp(otpTarget.type, otpTarget.value);
      setOtpResendTimer(OTP_RESEND_COOLDOWN_S);
    } catch (error) {
      const msg = extractErrorMessage(error);
      setOtpError(msg || t('profile.otpSendError'));
    } finally {
      setIsSendingOtp(false);
    }
  };

  const dismissOtpModal = () => {
    setShowOtpModal(false);
  };

  const saveProfile = async () => {
    if (!editPrenom.trim() || !editNom.trim()) {
      Alert.alert(t('common.error'), t('profile.nameRequired'));
      return;
    }
    const emailTrimmed = editEmail.trim();
    if (emailTrimmed && !isValidEmail(emailTrimmed)) {
      Alert.alert(t('common.error'), t('profile.emailInvalid'));
      return;
    }
    const phoneTrimmed = editPhoneLocal.trim();
    if (phoneTrimmed && !isValidPhoneForCountry(phoneTrimmed, editPhoneCountry)) {
      Alert.alert(t('common.error'), t('profile.phoneInvalid'));
      return;
    }
    // dateNaissance: valid DD/MM/YYYY → ISO string | empty → null | invalid → block
    let dateNaissancePayload: string | null | undefined = undefined;
    if (editDateNaissance.trim() === '') {
      dateNaissancePayload = null; // clear it
    } else if (editDateNaissance.length === 10) {
      const iso = toIsoDate(editDateNaissance);
      if (!iso) {
        Alert.alert(t('common.error'), t('profile.dateInvalid'));
        return;
      }
      dateNaissancePayload = iso;
    } else if (editDateNaissance.length > 0) {
      Alert.alert(t('common.error'), t('profile.dateInvalid'));
      return;
    }
    setIsSaving(true);
    haptic(HapticStyle.Medium);
    try {
      // Save all fields including email/phone directly
      await api.updateProfile({
        prenom: editPrenom.trim(),
        nom: editNom.trim(),
        ...(emailTrimmed ? { email: emailTrimmed } : {}),
        ...(phoneTrimmed ? { telephone: `${editPhoneCountry.dial}${phoneTrimmed}` } : {}),
        ...(dateNaissancePayload !== undefined ? { dateNaissance: dateNaissancePayload } : {}),
      });
      await refreshProfile?.();
      setIsEditing(false);
      Alert.alert(t('common.success'), t('profile.updateSuccess'));
    } catch (error) {
      if (__DEV__) console.error('Update profile error:', error);
      const msg = extractErrorMessage(error);
      Alert.alert(t('common.error'), msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefresh = useGuardedCallback(async () => {
    setIsRefreshing(true);
    haptic(HapticStyle.Light);
    await refreshProfile?.();
    setIsRefreshing(false);
  }, [refreshProfile]);

  const togglePreference = async (key: 'shareInfoMerchants' | 'notifWhatsapp', value: boolean) => {
    setIsSavingPref(key);
    if (Platform.OS !== 'web') haptic(HapticStyle.Light);
    // Optimistic update
    if (key === 'shareInfoMerchants') setShareInfoMerchants(value);
    if (key === 'notifWhatsapp') setNotifWhatsapp(value);
    try {
      await api.updateProfile({ [key]: value });
      await refreshProfile?.();
    } catch {
      // Revert on error
      if (key === 'shareInfoMerchants') setShareInfoMerchants(!value);
      if (key === 'notifWhatsapp') setNotifWhatsapp(!value);
      Alert.alert(t('common.error'), t('profile.updateError'));
    } finally {
      setIsSavingPref(null);
    }
  };

  const handleLogout = () => {
    haptic(HapticStyle.Medium);
    Alert.alert(t('profile.logout'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('profile.logout'),
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/login');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    haptic(HapticStyle.Heavy);
    setShowDeleteModal(true);
  };

  const handleExportData = async () => {
    haptic(HapticStyle.Light);
    if (!FileSystem.documentDirectory) {
      Alert.alert(t('common.error'), t('profile.exportDataError'));
      return;
    }
    setIsExporting(true);
    try {
      const data = await api.exportPersonalData();
      const json = JSON.stringify(data, null, 2);
      const fileUri = `${FileSystem.documentDirectory}jitplus-donnees-personnelles.json`;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: t('profile.exportData'),
        });
      } else {
        Alert.alert(t('profile.exportDataSuccess'), t('profile.exportDataSuccessMsg'));
      }
      // Auto-delete the export file after sharing
      await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    } catch (err) {
      if (__DEV__) console.error('Export error:', err);
      Alert.alert(t('common.error'), t('profile.exportDataError'));
    } finally {
      setIsExporting(false);
    }
  };

  if (isGuest) return <GuestGuard />;

  const confirmDelete = async (password: string) => {
    setShowDeleteModal(false);
    setIsDeleting(true);
    try {
      await api.deleteAccount(password);
      Alert.alert(t('profile.accountDeleted'), t('profile.accountDeletedMsg'));
      await logout();
      router.replace('/login');
    } catch (error) {
      if (__DEV__) console.error('Delete account error:', error);
      Alert.alert(t('common.error'), t('profile.accountDeleteError'));
    } finally {
      setIsDeleting(false);
    }
  };

  const initials = client
    ? `${client.prenom?.charAt(0) || ''}${client.nom?.charAt(0) || ''}`
    : '?';

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh}
              tintColor={theme.primaryLight} colors={[theme.primary]} />
          }
        >

          {/* Content */}
          <View style={styles.contentContainer}>
            {/* Profile card */}
            <FadeInView delay={100}>
              <View style={[styles.profileCard, { backgroundColor: theme.bgCard }]}>
                <View style={styles.profileRow}>
                  <LinearGradient
                    colors={[palette.gold, palette.violetVivid]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.avatarGradient}
                  >
                    {isLoading ? (
                      <Skeleton width={ms(56)} height={ms(56)} borderRadius={ms(28)} />
                    ) : (
                      <Text style={styles.avatarText}>{initials.toUpperCase()}</Text>
                    )}
                  </LinearGradient>

                  <View style={styles.profileInfo}>
                    {isLoading ? (
                      <Skeleton width={wp(140)} height={hp(20)} borderRadius={6} />
                    ) : (
                      <Text style={[styles.profileName, { color: theme.text }]}>{client?.prenom} {client?.nom}</Text>
                    )}
                  </View>
                </View>
              </View>
            </FadeInView>

            {/* Profile completion progress card */}
            {!isLoading && (
              <FadeInView delay={200} duration={300}>
                <TouchableOpacity
                  style={[styles.profileCompletionCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
                  onPress={() => { if (profileCompletionPercent < 100) startEditing(); }}
                  activeOpacity={0.9}
                  accessibilityRole="button"
                  accessibilityLabel={t('home.completeProfileCta')}
                >
                  <View style={styles.profileCompletionHeader}>
                    <View style={[styles.profileCompletionBadge, { backgroundColor: `${palette.violet}12` }]}>
                      <Sparkles size={ms(14)} color={palette.violet} strokeWidth={1.5} />
                    </View>
                    <View style={styles.profileCompletionTextWrap}>
                      <Text style={[styles.profileCompletionTitle, { color: theme.text }]}>{profileSummaryTitle}</Text>
                      <Text style={[styles.profileCompletionHint, { color: theme.textMuted }]} numberOfLines={2}>
                        {profileSummaryHint}
                      </Text>
                    </View>
                    <Text style={[styles.profileCompletionPercent, { color: palette.violet }]}>
                      {profileCompletionPercent}%
                    </Text>
                  </View>

                  <View style={[styles.profileCompletionTrack, { backgroundColor: theme.borderLight }]}>
                    <View
                      style={[
                        styles.profileCompletionFill,
                        {
                          width: `${profileCompletionPercent}%`,
                          backgroundColor: profileCompletionPercent === 100 ? palette.emerald : palette.violet,
                        },
                      ]}
                    />
                  </View>

                  {profileCompletionPercent < 100 && (
                    <View style={styles.profileCompletionFooter}>
                      <Text style={[styles.profileCompletionCta, { color: theme.textSecondary }]}>
                        {t('home.completeProfileCta')}
                      </Text>
                      <ChevronRight size={ms(16)} color={theme.textMuted} strokeWidth={1.5} />
                    </View>
                  )}
                </TouchableOpacity>
              </FadeInView>
            )}

            {/* Referral promo banner */}
            <FadeInView delay={250} duration={300}>
              <Pressable
                onPress={() => { haptic(HapticStyle.Light); router.push('/referral'); }}
                style={({ pressed }) => [
                  styles.referralBanner,
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t('profile.referralBannerTitle')}
              >
                <LinearGradient
                  colors={[palette.violet, palette.violetVivid]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.referralBannerGradient}
                >
                  <View style={styles.referralBannerContent}>
                    <View style={styles.referralBannerIconWrap}>
                      <Gift size={ms(22)} color="#fff" strokeWidth={1.8} />
                    </View>
                    <View style={styles.referralBannerTextWrap}>
                      <Text style={styles.referralBannerTitle}>{t('profile.referralBannerTitle')}</Text>
                      <Text style={styles.referralBannerDesc}>{t('profile.referralBannerDesc')}</Text>
                    </View>
                    <ChevronRight size={ms(18)} color="rgba(255,255,255,0.7)" strokeWidth={1.8} />
                  </View>
                </LinearGradient>
              </Pressable>
            </FadeInView>

            {/* Personal Info Section */}
            <FadeInView delay={300}>
              <TouchableOpacity
                onPress={() => { if (!isEditing) setInfoExpanded(!infoExpanded); }}
                activeOpacity={0.7}
                style={styles.sectionHeaderRow}
              >
                <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('profile.personalInfo')}</Text>
                <View style={styles.editActions}>
                  {!isLoading && !isEditing && (
                    <ChevronDown
                      size={ms(18)}
                      color={theme.textMuted}
                      strokeWidth={1.5}
                      style={{ transform: [{ rotate: infoExpanded ? '180deg' : '0deg' }] }}
                    />
                  )}
                  {!isLoading && !isEditing && infoExpanded && (
                    <TouchableOpacity onPress={(e) => { e.stopPropagation(); startEditing(); }} style={[styles.editHeaderBtn, { backgroundColor: `${palette.violet}12` }]} activeOpacity={0.7}>
                      <Pencil size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                    </TouchableOpacity>
                  )}
                  {isEditing && (
                    <>
                      <TouchableOpacity onPress={cancelEditing} style={[styles.editActionBtn, { backgroundColor: `${theme.danger}12` }]} activeOpacity={0.7}>
                        <X size={ms(16)} color={theme.danger} strokeWidth={1.5} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={saveProfile} disabled={isSaving} style={[styles.editActionBtn, { backgroundColor: `${palette.violet}15` }]} activeOpacity={0.7}>
                        {isSaving ? (
                          <ActivityIndicator size="small" color={palette.violet} />
                        ) : (
                          <Check size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                        )}
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </TouchableOpacity>

              {(infoExpanded || isEditing) && (
              <View style={[styles.infoCard, { backgroundColor: theme.bgCard }]}>
                {/* Prénom */}
                <View style={[styles.infoRow, { borderBottomColor: theme.borderLight }]}>
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                    <User size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.firstName')}</Text>
                    {isEditing ? (
                      <TextInput
                        style={[styles.infoInput, { color: theme.text, borderBottomColor: palette.violet }]}
                        value={editPrenom}
                        onChangeText={setEditPrenom}
                        placeholder={t('profile.firstNamePlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        autoCapitalize="words"
                      />
                    ) : (
                      <Text style={[styles.infoValue, { color: theme.text }]}>{client?.prenom || '—'}</Text>
                    )}
                  </View>
                </View>

                {/* Nom */}
                <View style={[styles.infoRow, { borderBottomColor: theme.borderLight }]}>
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                    <User size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.lastName')}</Text>
                    {isEditing ? (
                      <TextInput
                        style={[styles.infoInput, { color: theme.text, borderBottomColor: palette.violet }]}
                        value={editNom}
                        onChangeText={setEditNom}
                        placeholder={t('profile.lastNamePlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        autoCapitalize="words"
                      />
                    ) : (
                      <Text style={[styles.infoValue, { color: theme.text }]}>{client?.nom || '—'}</Text>
                    )}
                  </View>
                </View>

                {/* Email */}
                <View style={[styles.infoRow, { borderBottomColor: theme.borderLight }]}>
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                    <Mail size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.email')}</Text>
                    {isEditing ? (
                      <TextInput
                        style={[styles.infoInput, { color: theme.text, borderBottomColor: palette.violet }]}
                        value={editEmail}
                        onChangeText={setEditEmail}
                        placeholder={t('profile.emailPlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        keyboardType="email-address"
                        autoCapitalize="none"
                      />
                    ) : (
                      <Text style={[styles.infoValue, { color: theme.text }]}>{client?.email || t('profile.notProvided')}</Text>
                    )}
                    {client?.email && !client.emailVerified && (
                      <TouchableOpacity
                        onPress={() => startOtpFlow({ type: 'email', value: client.email! })}
                        style={styles.pendingBadge}
                        activeOpacity={0.7}
                        disabled={isSendingOtp}
                      >
                        {isSendingOtp && otpTarget?.type === 'email' ? (
                          <ActivityIndicator size={ms(12)} color={palette.gold} />
                        ) : (
                          <ShieldCheck size={ms(12)} color={palette.gold} strokeWidth={1.5} />
                        )}
                        <Text style={styles.pendingBadgeText}>{t('profile.pendingVerification')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Phone (editable) */}
                <View style={[styles.infoRow, { borderBottomColor: theme.borderLight }]}>
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                    <Phone size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.phone')}</Text>
                    {isEditing ? (
                      <PremiumPhoneInput
                        value={editPhoneLocal}
                        onChangePhone={setEditPhoneLocal}
                        country={editPhoneCountry}
                        onChangeCountry={setEditPhoneCountry}
                        accentColor={palette.violet}
                        errorMessage={t('profile.phoneInvalid')}
                      />
                    ) : (
                      <Text style={[styles.infoValue, { color: theme.text }]}>{client?.telephone || '—'}</Text>
                    )}
                    {client?.telephone && !client.telephoneVerified && (
                      <TouchableOpacity
                        onPress={() => startOtpFlow({ type: 'telephone', value: client.telephone! })}
                        style={styles.pendingBadge}
                        activeOpacity={0.7}
                        disabled={isSendingOtp}
                      >
                        {isSendingOtp && otpTarget?.type === 'telephone' ? (
                          <ActivityIndicator size={ms(12)} color={palette.gold} />
                        ) : (
                          <ShieldCheck size={ms(12)} color={palette.gold} strokeWidth={1.5} />
                        )}
                        <Text style={styles.pendingBadgeText}>{t('profile.pendingVerification')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>

                {/* Date de naissance (optionnelle) */}
                <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                    <Calendar size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                      {t('profile.dateNaissance')}
                      <Text style={{ fontWeight: '400' }}>{' '}({t('profile.optional')})</Text>
                    </Text>
                    {isEditing ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: wp(8) }}>
                        <TextInput
                          style={[styles.infoInput, { color: theme.text, borderBottomColor: palette.violet, flex: 1 }]}
                          value={editDateNaissance}
                          onChangeText={(v) => setEditDateNaissance(formatDateInput(v))}
                          placeholder={t('profile.dateNaissancePlaceholder')}
                          placeholderTextColor={theme.textMuted}
                          keyboardType="number-pad"
                          maxLength={10}
                        />
                        {editDateNaissance.length > 0 && (
                          <TouchableOpacity
                            onPress={() => setEditDateNaissance('')}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <X size={ms(16)} color={theme.textMuted} strokeWidth={1.5} />
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      <Text style={[styles.infoValue, { color: theme.text }]}>
                        {client?.dateNaissance ? isoDtoDmy(client.dateNaissance) : t('profile.notProvided')}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
              )}
            </FadeInView>

            {/* Account info */}
            <FadeInView delay={400}>
              <TouchableOpacity
                onPress={() => setPrefExpanded(!prefExpanded)}
                activeOpacity={0.7}
                style={styles.sectionHeaderRow}
              >
                <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('profile.preferences')}</Text>
                <ChevronDown
                  size={ms(18)}
                  color={theme.textMuted}
                  strokeWidth={1.5}
                  style={{ transform: [{ rotate: prefExpanded ? '180deg' : '0deg' }] }}
                />
              </TouchableOpacity>
              {prefExpanded && (
              <View style={[styles.infoCard, { backgroundColor: theme.bgCard }]}>
                {/* Dark mode toggle */}
                <Pressable
                  onPress={() => { theme.toggleDarkMode(); if (Platform.OS !== 'web') haptic(HapticStyle.Light); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('profile.darkMode')}
                  android_ripple={{ color: `${palette.gold}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomColor: theme.borderLight },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                    <Moon size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.darkMode')}</Text>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                      {theme.themeMode === 'system' ? t('profile.themeSystem') : theme.themeMode === 'dark' ? t('profile.themeDark') : t('profile.themeLight')}
                    </Text>
                  </View>
                  <View style={[styles.toggle, theme.isDark ? styles.toggleOn : { backgroundColor: theme.borderLight }]}>
                    <View style={[styles.toggleKnob, theme.isDark && styles.toggleKnobOn]} />
                  </View>
                </Pressable>

                {/* Share info with merchants */}
                <Pressable
                  onPress={() => togglePreference('shareInfoMerchants', !shareInfoMerchants)}
                  disabled={isSavingPref === 'shareInfoMerchants'}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: shareInfoMerchants }}
                  accessibilityLabel={t('profile.shareInfoDesc')}
                  android_ripple={{ color: `${palette.gold}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomColor: theme.borderLight },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                    <Share2 size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.shareInfo')}</Text>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                      {t('profile.shareInfoDesc')}
                    </Text>
                  </View>
                  <View style={[styles.toggle, shareInfoMerchants ? styles.toggleOn : { backgroundColor: theme.borderLight }]}>
                    {isSavingPref === 'shareInfoMerchants' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <View style={[styles.toggleKnob, shareInfoMerchants && styles.toggleKnobOn]} />
                    )}
                  </View>
                </Pressable>



                {/* WhatsApp notifications */}
                <Pressable
                  onPress={() => togglePreference('notifWhatsapp', !notifWhatsapp)}
                  disabled={isSavingPref === 'notifWhatsapp'}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: notifWhatsapp }}
                  accessibilityLabel={t('profile.whatsappNotifsDesc')}
                  android_ripple={{ color: `${palette.gold}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomColor: theme.borderLight },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                    <MessageCircle size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.whatsappNotifs')}</Text>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                      {t('profile.whatsappNotifsDesc')}
                    </Text>
                  </View>
                  <View style={[styles.toggle, notifWhatsapp ? { ...styles.toggleOn, backgroundColor: '#25D366' } : { backgroundColor: theme.borderLight }]}>
                    {isSavingPref === 'notifWhatsapp' ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <View style={[styles.toggleKnob, notifWhatsapp && styles.toggleKnobOn]} />
                    )}
                  </View>
                </Pressable>

                {/* Language selector */}
                <Pressable
                  onPress={() => setShowLanguageModal(true)}
                  android_ripple={{ color: `${palette.gold}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomWidth: 0 },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                    <Globe size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.language')}</Text>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                      {t('profile.languageDesc')}
                    </Text>
                  </View>
                  <Text style={[styles.langBadge, { color: theme.primary, backgroundColor: `${theme.primary}15` }]}>
                    {t(`languages.${locale}`)}
                  </Text>
                </Pressable>
              </View>
              )}
            </FadeInView>

            {/* Compte */}
            <FadeInView delay={500}>
              <TouchableOpacity
                onPress={() => setCompteExpanded(!compteExpanded)}
                activeOpacity={0.7}
                style={styles.sectionHeaderRow}
              >
                <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('profile.account')}</Text>
                <ChevronDown
                  size={ms(18)}
                  color={theme.textMuted}
                  strokeWidth={1.5}
                  style={{ transform: [{ rotate: compteExpanded ? '180deg' : '0deg' }] }}
                />
              </TouchableOpacity>
              {compteExpanded && (
                <View style={[styles.infoCard, { backgroundColor: theme.bgCard }]}>
                  {/* ── Parrainage ── */}
                  <Pressable
                    onPress={() => router.push('/referral')}
                    android_ripple={{ color: `${palette.gold}10` }}
                    style={({ pressed }) => [
                      styles.infoRow,
                      pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                    ]}
                  >
                    <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                      <Gift size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                    </View>
                    <View style={styles.infoContent}>
                      <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.referral')}</Text>
                      <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.referralDesc')}</Text>
                    </View>
                    <ChevronRight size={ms(14)} color={theme.textMuted} strokeWidth={1.5} />
                  </Pressable>
                  {/* ── Changer / Définir mot de passe ── */}
                  <Pressable
                    onPress={() => router.push('/change-password')}
                    android_ripple={{ color: `${palette.gold}10` }}
                    style={({ pressed }) => [
                      styles.infoRow,
                      pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                    ]}
                  >
                    <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                      <Lock size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                    </View>
                    <View style={styles.infoContent}>
                      <Text style={[styles.infoValue, { color: theme.text }]}>
                        {client?.hasPassword ? t('profile.changePassword') : t('profile.setPasswordLink')}
                      </Text>
                      <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                        {client?.hasPassword ? t('profile.changePasswordDesc') : t('profile.setPasswordLinkDesc')}
                      </Text>
                    </View>
                    <ChevronRight size={ms(14)} color={theme.textMuted} strokeWidth={1.5} />
                  </Pressable>
                  {/* ── Contacter le support ── */}
                  <Pressable
                    onPress={() => {
                      const phone = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || '212675346486';
                      Linking.openURL(`whatsapp://send?phone=${phone}&text=Bonjour%2C%20j%27ai%20besoin%20d%27aide%20avec%20l%27app%20JitPlus`).catch(() => {
                        Linking.openURL(`https://wa.me/${phone}?text=Bonjour%2C%20j%27ai%20besoin%20d%27aide%20avec%20l%27app%20JitPlus`);
                      });
                    }}
                    android_ripple={{ color: `${palette.gold}10` }}
                    style={({ pressed }) => [
                      styles.infoRow,
                      pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                    ]}
                  >
                    <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                      <MessageSquare size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                    </View>
                    <View style={styles.infoContent}>
                      <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.contactSupport')}</Text>
                      <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                        {t('profile.contactSupportDesc')}
                      </Text>
                    </View>
                  </Pressable>
                  {/* ── Noter l'application ── */}
                  <Pressable
                    onPress={() => Linking.openURL(getStoreUrl())}
                    android_ripple={{ color: `${palette.gold}10` }}
                    style={({ pressed }) => [
                      styles.infoRow,
                      pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                    ]}
                  >
                    <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                      <Star size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                    </View>
                    <View style={styles.infoContent}>
                      <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.rateApp')}</Text>
                      <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                        {t('profile.rateAppDesc')}
                      </Text>
                    </View>
                  </Pressable>
                  {/* ── Export données (Loi 09-08) ── */}
                  <Pressable
                    onPress={handleExportData}
                    disabled={isExporting}
                    android_ripple={{ color: `${palette.gold}10` }}
                    style={({ pressed }) => [
                      styles.infoRow,
                      pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                    ]}
                  >
                    <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                      {isExporting ? (
                        <ActivityIndicator size="small" color={palette.gold} />
                      ) : (
                        <FileDown size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                      )}
                    </View>
                    <View style={styles.infoContent}>
                      <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.exportData')}</Text>
                      <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                        {t('profile.exportDataDesc')}
                      </Text>
                    </View>
                  </Pressable>
                  {/* ── Mentions légales / CNDP ── */}
                  <Pressable
                    onPress={() => router.push('/legal')}
                    android_ripple={{ color: `${palette.gold}10` }}
                    style={({ pressed }) => [
                      styles.infoRow,
                      pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                    ]}
                  >
                    <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                      <Shield size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                    </View>
                    <View style={styles.infoContent}>
                      <Text style={[styles.infoValue, { color: theme.text }]}>{t('profile.legalNotice')}</Text>
                      <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                        {t('profile.legalNoticeDesc')}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={handleLogout}
                    android_ripple={{ color: `${palette.gold}10` }}
                    style={({ pressed }) => [
                      styles.infoRow,
                      pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                    ]}
                  >
                    <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                      <LogOut size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                    </View>
                    <View style={styles.infoContent}>
                      <Text style={[styles.infoValue, { color: theme.danger }]}>{t('profile.logout')}</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={handleDeleteAccount}
                    disabled={isDeleting}
                    android_ripple={{ color: `${palette.gold}10` }}
                    style={({ pressed }) => [
                      styles.infoRow, { borderBottomWidth: 0 },
                      pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                    ]}
                  >
                    <View style={[styles.infoIconBox, { backgroundColor: `${palette.gold}15` }]}>
                      {isDeleting ? (
                        <ActivityIndicator size="small" color={palette.gold} />
                      ) : (
                        <Trash2 size={ms(16)} color={palette.gold} strokeWidth={1.5} />
                      )}
                    </View>
                    <View style={styles.infoContent}>
                      <Text style={[styles.infoValue, { color: theme.danger }]}>{t('profile.deleteAccount')}</Text>
                      <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                        {t('profile.deleteAccountDesc')}
                      </Text>
                    </View>
                    <AlertTriangle size={ms(14)} color={theme.danger} strokeWidth={1.5} />
                  </Pressable>
                </View>
              )}
            </FadeInView>

            {/* Logo footer */}
            <View style={styles.logoFooter}>
              <Image
                source={require('@/assets/images/jitpluslogo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
              <Text style={[styles.logoSubtext, { color: theme.textMuted }]}>
                {t('profile.footer')}
              </Text>
              <Text style={[styles.versionText, { color: theme.textMuted }]}>
                v{Constants.expoConfig?.version || '1.0.0'}
              </Text>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <DeleteAccountModal
        visible={showDeleteModal}
        hasPassword={!!client?.hasPassword}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
      />

      <OtpVerificationModal
        visible={showOtpModal}
        targetValue={otpTarget?.value || ''}
        otpCode={otpCode}
        otpError={otpError}
        isVerifying={isVerifyingOtp}
        isSending={isSendingOtp}
        resendTimer={otpResendTimer}
        onChangeCode={(code) => { setOtpCode(code); setOtpError(''); }}
        onVerify={verifyOtpAndApply}
        onResend={resendOtp}
        onClose={dismissOtpModal}
      />

      <LanguageModal
        visible={showLanguageModal}
        onClose={() => setShowLanguageModal(false)}
      />
    </View>
  );
}
