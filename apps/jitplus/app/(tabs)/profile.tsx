import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, RefreshControl, StyleSheet, Pressable, Alert, Platform,
  TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Image,
  Modal, Linking, AppState, AppStateStatus,
} from 'react-native';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import {
  User, LogOut, Phone, Mail, Pencil, Check, X, Trash2, AlertTriangle,
  Share2, MessageCircle, ChevronDown, Moon, Info, Globe, FileDown, Shield,
  Star, MessageSquare, Calendar,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { isValidEmail } from '@/utils/validation';
import { extractErrorMessage } from '@/utils/errorMessage';
import { formatDateInput, toIsoDate, isoDtoDmy } from '@/utils/dateInput';

export default function ProfileScreen() {
  const theme = useTheme();
  const { t, locale, setLocale } = useLanguage();
  const { client, logout, refreshProfile, isGuest } = useAuth();
  const router = useRouter();

  if (isGuest) return <GuestGuard />;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(!client);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [prefExpanded, setPrefExpanded] = useState(false);
  const [compteExpanded, setCompteExpanded] = useState(false);

  // Editable fields
  const [editPrenom, setEditPrenom] = useState('');
  const [editNom, setEditNom] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTelephone, setEditTelephone] = useState('');
  const [editDateNaissance, setEditDateNaissance] = useState('');

  // Missing info banner
  const [showMissingBanner, setShowMissingBanner] = useState(true);

  // Preferences
  const [shareInfoMerchants, setShareInfoMerchants] = useState(client?.shareInfoMerchants ?? true);
  const [notifWhatsapp, setNotifWhatsapp] = useState(client?.notifWhatsapp ?? true);
  const [isSavingPref, setIsSavingPref] = useState<string | null>(null);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // Compute missing fields
  const missingFields: string[] = [];
  if (client) {
    if (!client.prenom) missingFields.push(t('profile.missingFirstName'));
    if (!client.nom) missingFields.push(t('profile.missingLastName'));
    if (!client.email) missingFields.push(t('profile.missingEmail'));
    if (!client.telephone) missingFields.push(t('profile.missingPhone'));
  }
  const hasMissingInfo = missingFields.length > 0;

  // ── Persist editing draft when user leaves app (call, task switch) ──
  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced draft values — captured via ref so AppState listener doesn’t
  // cause re-subscriptions on every keystroke.
  const draftRef = useRef({ editPrenom, editNom, editEmail, editTelephone, editDateNaissance });
  draftRef.current = { editPrenom, editNom, editEmail, editTelephone, editDateNaissance };

  useEffect(() => {
    const handleAppState = async (nextState: AppStateStatus) => {
      if (nextState === 'background' && isEditingRef.current) {
        // Debounce: only persist once when going to background
        if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
        draftTimerRef.current = setTimeout(async () => {
          try {
            await AsyncStorage.setItem('profile_draft', JSON.stringify(draftRef.current));
          } catch { /* best-effort */ }
        }, 300);
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
    AsyncStorage.getItem('profile_draft').then((raw) => {
      if (!raw) return;
      try {
        const d = JSON.parse(raw);
        setEditPrenom(d.editPrenom || '');
        setEditNom(d.editNom || '');
        setEditEmail(d.editEmail || '');
        setEditTelephone(d.editTelephone || '');
        setEditDateNaissance(d.editDateNaissance || '');
        setIsEditing(true);
        setInfoExpanded(true);
      } catch { /* corrupt draft, ignore */ }
      AsyncStorage.removeItem('profile_draft');
    });
  }, []);

  useFocusEffect(useCallback(() => {
    // Reset banner visibility each time the screen is focused
    setShowMissingBanner(true);
    if (!client) refreshProfile?.().finally(() => setIsLoading(false));
    if (client) {
      setShareInfoMerchants(client.shareInfoMerchants ?? true);
      setNotifWhatsapp(client.notifWhatsapp ?? true);
    }
  }, [client, refreshProfile]));

  const startEditing = () => {
    setEditPrenom(client?.prenom || '');
    setEditNom(client?.nom || '');
    setEditEmail(client?.email || '');
    setEditTelephone(client?.telephone || '');
    setEditDateNaissance(isoDtoDmy(client?.dateNaissance));
    setInfoExpanded(true);
    setIsEditing(true);
    haptic(HapticStyle.Light);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    AsyncStorage.removeItem('profile_draft').catch(() => {});
    haptic(HapticStyle.Light);
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
    const phoneTrimmed = editTelephone.trim();
    if (phoneTrimmed && (!/^[0-9+\s\-()]{10,15}$/.test(phoneTrimmed) || phoneTrimmed.replace(/\D/g, '').length < 8)) {
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
      await api.updateProfile({
        prenom: editPrenom.trim(),
        nom: editNom.trim(),
        email: emailTrimmed || undefined,
        telephone: phoneTrimmed || undefined,
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
    setDeleteConfirmText('');
    setDeletePassword('');
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
    } catch (err) {
      if (__DEV__) console.error('Export error:', err);
      Alert.alert(t('common.error'), t('profile.exportDataError'));
    } finally {
      setIsExporting(false);
    }
  };

  const confirmDelete = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== t('profile.deleteConfirmWord').toUpperCase()) return;
    if (!deletePassword) return;
    setShowDeleteModal(false);
    setIsDeleting(true);
    try {
      await api.deleteAccount(deletePassword);
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
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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

            {/* Missing info banner */}
            {hasMissingInfo && showMissingBanner && !isLoading && (
              <FadeInView delay={200} duration={300}>
                <View style={[styles.missingBanner, { backgroundColor: `${palette.amber}15`, borderColor: `${palette.amber}40` }]}>
                  <View style={styles.missingBannerContent}>
                    <View style={[styles.missingBannerIcon, { backgroundColor: `${palette.amber}20` }]}>
                      <Info size={ms(18)} color={palette.amber} strokeWidth={1.5} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.missingBannerTitle, { color: theme.text }]}>
                        {t('profile.incompleteProfile')}
                      </Text>
                      <Text style={[styles.missingBannerText, { color: theme.textMuted }]}>
                        {t('profile.incompleteHint', { fields: missingFields.join(', ') })}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => { setShowMissingBanner(false); haptic(HapticStyle.Light); }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      style={styles.missingBannerClose}
                    >
                      <X size={ms(16)} color={theme.textMuted} strokeWidth={1.5} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    onPress={() => { startEditing(); setShowMissingBanner(false); }}
                    activeOpacity={0.7}
                    style={[styles.missingBannerBtn, { backgroundColor: `${palette.amber}25` }]}
                  >
                    <Pencil size={ms(14)} color={palette.amber} strokeWidth={1.5} />
                    <Text style={[styles.missingBannerBtnText, { color: palette.amber }]}>{t('profile.completeProfile')}</Text>
                  </TouchableOpacity>
                </View>
              </FadeInView>
            )}

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
                      <Pencil size={ms(16)} color={palette.violet} strokeWidth={1.5} />
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
                  <View style={[styles.infoIconBox, { backgroundColor: theme.primaryBg }]}>
                    <User size={ms(16)} color={theme.primaryLight} strokeWidth={1.5} />
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
                  <View style={[styles.infoIconBox, { backgroundColor: theme.primaryBg }]}>
                    <User size={ms(16)} color={theme.primaryLight} strokeWidth={1.5} />
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
                  </View>
                </View>

                {/* Phone (editable) */}
                <View style={[styles.infoRow, { borderBottomColor: theme.borderLight }]}>
                  <View style={[styles.infoIconBox, { backgroundColor: `#10B98115` }]}>
                    <Phone size={ms(16)} color="#10B981" strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('profile.phone')}</Text>
                    {isEditing ? (
                      <TextInput
                        style={[styles.infoInput, { color: theme.text, borderBottomColor: palette.violet }]}
                        value={editTelephone}
                        onChangeText={setEditTelephone}
                        placeholder={t('profile.phonePlaceholder')}
                        placeholderTextColor={theme.textMuted}
                        keyboardType="phone-pad"
                      />
                    ) : (
                      <Text style={[styles.infoValue, { color: theme.text }]}>{client?.telephone || '—'}</Text>
                    )}
                  </View>
                </View>

                {/* Date de naissance (optionnelle) */}
                <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.violet}12` }]}>
                    <Calendar size={ms(16)} color={palette.violet} strokeWidth={1.5} />
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
                  android_ripple={{ color: `${palette.violet}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomColor: theme.borderLight },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.violetDark}15` }]}>
                    <Moon size={ms(16)} color={palette.violetDark} strokeWidth={1.5} />
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
                  android_ripple={{ color: `${palette.violet}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomColor: theme.borderLight },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.violet}12` }]}>
                    <Share2 size={ms(16)} color={palette.violet} strokeWidth={1.5} />
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
                  android_ripple={{ color: `#25D36610` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomColor: theme.borderLight },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `#25D36615` }]}>
                    <MessageCircle size={ms(16)} color="#25D366" strokeWidth={1.5} />
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
                  android_ripple={{ color: `${palette.violet}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomWidth: 0 },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.violet}12` }]}>
                    <Globe size={ms(16)} color={palette.violet} strokeWidth={1.5} />
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
                  {/* ── Contacter le support ── */}
                  <Pressable
                    onPress={() => Linking.openURL('https://wa.me/33767471397?text=Bonjour%2C%20j%27ai%20besoin%20d%27aide%20avec%20l%27app%20JitPlus')}
                    android_ripple={{ color: `${theme.primary}10` }}
                    style={({ pressed }) => [
                      styles.infoRow,
                      pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                    ]}
                  >
                    <View style={[styles.infoIconBox, { backgroundColor: '#25D36615' }]}>
                      <MessageSquare size={ms(16)} color="#25D366" strokeWidth={1.5} />
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
                    onPress={() => {
                      const url = Platform.OS === 'ios'
                        ? 'https://apps.apple.com/app/id6744903766'
                        : 'https://play.google.com/store/apps/details?id=com.jitplus.client';
                      Linking.openURL(url);
                    }}
                    android_ripple={{ color: `${theme.primary}10` }}
                    style={({ pressed }) => [
                      styles.infoRow,
                      pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                    ]}
                  >
                    <View style={[styles.infoIconBox, { backgroundColor: '#F59E0B15' }]}>
                      <Star size={ms(16)} color="#F59E0B" strokeWidth={1.5} />
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
                    android_ripple={{ color: `${theme.primary}10` }}
                    style={({ pressed }) => [
                      styles.infoRow,
                      pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                    ]}
                  >
                    <View style={[styles.infoIconBox, { backgroundColor: `${theme.primary}12` }]}>
                      {isExporting ? (
                        <ActivityIndicator size="small" color={theme.primary} />
                      ) : (
                        <FileDown size={ms(16)} color={theme.primary} strokeWidth={1.5} />
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
                    android_ripple={{ color: `${theme.primary}10` }}
                    style={({ pressed }) => [
                      styles.infoRow,
                      pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                    ]}
                  >
                    <View style={[styles.infoIconBox, { backgroundColor: `${theme.primary}12` }]}>
                      <Shield size={ms(16)} color={theme.primary} strokeWidth={1.5} />
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
                    android_ripple={{ color: `${theme.danger}10` }}
                    style={({ pressed }) => [
                      styles.infoRow,
                      pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                    ]}
                  >
                    <View style={[styles.infoIconBox, { backgroundColor: `${theme.danger}12` }]}>
                      <LogOut size={ms(16)} color={theme.danger} strokeWidth={1.5} />
                    </View>
                    <View style={styles.infoContent}>
                      <Text style={[styles.infoValue, { color: theme.danger }]}>{t('profile.logout')}</Text>
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={handleDeleteAccount}
                    disabled={isDeleting}
                    android_ripple={{ color: `${theme.danger}10` }}
                    style={({ pressed }) => [
                      styles.infoRow, { borderBottomWidth: 0 },
                      pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                    ]}
                  >
                    <View style={[styles.infoIconBox, { backgroundColor: `${theme.danger}12` }]}>
                      {isDeleting ? (
                        <ActivityIndicator size="small" color={theme.danger} />
                      ) : (
                        <Trash2 size={ms(16)} color={theme.danger} strokeWidth={1.5} />
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

      {/* ── Delete Account Confirmation Modal ── */}
      <Modal
        visible={showDeleteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeleteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.bgCard }]}>
            <View style={[styles.modalIconCircle, { backgroundColor: `${theme.danger}12` }]}>
              <AlertTriangle size={ms(28)} color={theme.danger} strokeWidth={1.5} />
            </View>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('profile.deleteModalTitle')}</Text>
            <Text style={[styles.modalBody, { color: theme.textMuted }]}>
              {t('profile.deleteModalBody')}
            </Text>
            <Text style={[styles.modalInstruction, { color: theme.textSecondary }]}>
              {t('profile.deleteConfirmPrompt')}
            </Text>
            <TextInput
              style={[styles.modalInput, {
                color: theme.text,
                  borderColor: deleteConfirmText.trim().toUpperCase() === t('profile.deleteConfirmWord').toUpperCase() ? theme.danger : theme.border,
                backgroundColor: theme.bgInput,
              }]}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder={t('profile.deleteConfirmWord')}
              placeholderTextColor={theme.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {client?.hasPassword ? (
              <>
                <Text style={[styles.modalInstruction, { color: theme.textSecondary, marginTop: ms(8) }]}>
                  {t('profile.deletePasswordPrompt')}
                </Text>
                <TextInput
                  style={[styles.modalInput, {
                    color: theme.text,
                    borderColor: deletePassword.length > 0 ? theme.danger : theme.border,
                    backgroundColor: theme.bgInput,
                  }]}
                  value={deletePassword}
                  onChangeText={setDeletePassword}
                  placeholder={t('profile.deletePasswordPlaceholder')}
                  placeholderTextColor={theme.textMuted}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            ) : (
              <Text style={[styles.modalInstruction, { color: theme.danger, marginTop: ms(8) }]}>
                {t('profile.deleteNoPasswordWarning')}
              </Text>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: theme.bgInput }]}
                onPress={() => setShowDeleteModal(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalBtnText, { color: theme.text }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, {
                  backgroundColor: (deleteConfirmText.trim().toUpperCase() === t('profile.deleteConfirmWord').toUpperCase() && deletePassword.length > 0) ? theme.danger : `${theme.danger}30`,
                }]}
                onPress={confirmDelete}
                disabled={deleteConfirmText.trim().toUpperCase() !== t('profile.deleteConfirmWord').toUpperCase() || !deletePassword}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>{t('common.delete')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Language Selector Modal ── */}
      <Modal
        visible={showLanguageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowLanguageModal(false)}>
          <View style={[styles.langModalCard, { backgroundColor: theme.bgCard }]}>
            <View style={[styles.modalIconCircle, { backgroundColor: `${palette.violet}12` }]}>
              <Globe size={ms(28)} color={palette.violet} strokeWidth={1.5} />
            </View>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('profile.language')}</Text>
            <Text style={[styles.langModalDesc, { color: theme.textMuted }]}>
              {t('profile.languageDesc')}
            </Text>

            {(['fr', 'en', 'ar'] as const).map((lang) => {
              const selected = locale === lang;
              return (
                <Pressable
                  key={lang}
                  onPress={async () => {
                    if (lang !== locale) {
                      await setLocale(lang);
                      if (lang === 'ar' || locale === 'ar') {
                        Alert.alert(
                          t('profile.language'),
                          t('profile.restartRequired'),
                          [{ text: t('common.ok') }],
                        );
                      }
                    }
                    setShowLanguageModal(false);
                  }}
                  android_ripple={{ color: `${palette.violet}10` }}
                  style={({ pressed }) => [
                    styles.langOption,
                    { borderColor: selected ? theme.primary : theme.borderLight },
                    selected && { backgroundColor: `${theme.primary}08` },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.langFlag}>
                    {lang === 'fr' ? '🇫🇷' : lang === 'en' ? '🇬🇧' : '🇸🇦'}
                  </Text>
                  <Text style={[styles.langOptionText, { color: selected ? theme.primary : theme.text }]}>
                    {t(`languages.${lang}`)}
                  </Text>
                  {selected && (
                    <View style={[styles.langCheck, { backgroundColor: theme.primary }]}>
                      <Check size={ms(12)} color="#fff" strokeWidth={3} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Header
  header: { paddingBottom: hp(24), borderBottomLeftRadius: ms(28), borderBottomRightRadius: ms(28) },
  headerContent: { paddingHorizontal: wp(24), paddingTop: hp(8) },
  headerTitle: { fontSize: FS['2xl'], fontWeight: '700', color: '#fff', letterSpacing: -0.3 },

  // Profile card
  profileCard: {
    borderRadius: radius.xl, padding: wp(16), marginBottom: hp(16),
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: wp(14) },
  avatarGradient: {
    width: ms(56), height: ms(56), borderRadius: ms(28),
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: FS.lg, fontWeight: '700', color: '#fff', letterSpacing: 1 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: FS.lg, fontWeight: '700', letterSpacing: -0.3 },
  editHeaderBtn: {
    width: ms(38), height: ms(38), borderRadius: ms(19),
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: `${palette.violet}20`,
  },


  // Content
  contentContainer: { paddingHorizontal: wp(20), paddingTop: hp(40), paddingBottom: hp(120), flexGrow: 1, justifyContent: 'center' },

  // Section
  sectionHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: hp(8), marginTop: hp(8),
  },
  sectionTitle: {
    fontSize: FS.xs, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: hp(8), marginLeft: wp(4), marginTop: hp(8),
  },
  editActions: { flexDirection: 'row', gap: wp(8) },
  editActionBtn: {
    width: ms(34), height: ms(34), borderRadius: ms(17),
    alignItems: 'center', justifyContent: 'center',
  },

  // Info card
  infoCard: {
    borderRadius: radius.xl, overflow: 'hidden', marginBottom: hp(16),
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 2,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: wp(16), paddingVertical: hp(14), gap: wp(12),
    borderBottomWidth: 0.5,
  },
  infoIconBox: {
    width: ms(36), height: ms(36), borderRadius: ms(12),
    alignItems: 'center', justifyContent: 'center',
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: FS.xs, marginBottom: hp(2) },
  infoValue: { fontSize: FS.md, fontWeight: '500' },
  infoInput: {
    fontSize: FS.md, fontWeight: '500', paddingVertical: hp(2),
    borderBottomWidth: 1.5, marginTop: hp(2),
  },

  // Delete
  deleteCard: {
    flexDirection: 'row', alignItems: 'center', gap: wp(14),
    padding: wp(16), borderRadius: radius.xl, borderWidth: 1, marginBottom: hp(16),
  },
  deleteIcon: {
    width: ms(44), height: ms(44), borderRadius: ms(14),
    alignItems: 'center', justifyContent: 'center',
  },
  deleteContent: { flex: 1 },
  deleteTitle: { fontSize: FS.md, fontWeight: '600', marginBottom: hp(2) },
  deleteDesc: { fontSize: FS.xs, lineHeight: ms(18) },

  // Logo footer
  logoFooter: { alignItems: 'center', paddingTop: hp(28), paddingBottom: hp(10) },
  logoRow: { flexDirection: 'row', alignItems: 'flex-start' },
  logoImage: { width: ms(64), height: ms(64), borderRadius: ms(14) },
  logoSubtext: { fontSize: FS.xs, marginTop: hp(8), fontWeight: '500', letterSpacing: 0.3 },
  versionText: { fontSize: FS.xs, marginTop: hp(4), opacity: 0.5, fontWeight: '400' },

  // Toggle
  toggle: {
    width: ms(48), height: ms(28), borderRadius: ms(14),
    justifyContent: 'center', paddingHorizontal: ms(3),
  },
  toggleOn: {
    backgroundColor: palette.violet,
  },
  toggleKnob: {
    width: ms(22), height: ms(22), borderRadius: ms(11),
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2, elevation: 2,
  },
  toggleKnobOn: {
    alignSelf: 'flex-end' as const,
  },

  /* ── Missing info banner ── */
  missingBanner: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: wp(14),
    marginBottom: hp(16),
  },
  missingBannerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: wp(10),
  },
  missingBannerIcon: {
    width: ms(34),
    height: ms(34),
    borderRadius: ms(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  missingBannerTitle: {
    fontSize: FS.md,
    fontWeight: '700',
    marginBottom: hp(2),
  },
  missingBannerText: {
    fontSize: FS.xs,
    lineHeight: ms(18),
  },
  missingBannerClose: {
    padding: ms(4),
  },
  missingBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(6),
    marginTop: hp(10),
    paddingVertical: hp(8),
    borderRadius: radius.lg,
  },
  missingBannerBtnText: {
    fontSize: FS.sm,
    fontWeight: '700',
  },

  /* ── Delete Modal ── */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: ms(24),
  },
  modalCard: {
    width: '100%',
    borderRadius: ms(20),
    padding: ms(24),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 6,
  },
  modalIconCircle: {
    width: ms(56),
    height: ms(56),
    borderRadius: ms(28),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: hp(12),
  },
  modalTitle: {
    fontSize: ms(18),
    fontWeight: '700',
    marginBottom: hp(8),
  },
  modalBody: {
    fontSize: ms(14),
    textAlign: 'center',
    lineHeight: ms(20),
    marginBottom: hp(16),
  },
  modalInstruction: {
    fontSize: ms(13),
    marginBottom: hp(8),
    textAlign: 'center',
  },
  modalInput: {
    width: '100%',
    borderWidth: 1.5,
    borderRadius: ms(12),
    paddingHorizontal: ms(14),
    paddingVertical: hp(10),
    fontSize: ms(16),
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: hp(16),
  },
  modalActions: {
    flexDirection: 'row',
    gap: ms(12),
    width: '100%',
  },
  modalBtn: {
    flex: 1,
    paddingVertical: hp(12),
    borderRadius: ms(12),
    alignItems: 'center',
  },
  modalBtnText: {
    fontSize: ms(14),
    fontWeight: '700',
  },

  /* ── Language selector ── */
  langBadge: {
    fontSize: FS.xs,
    fontWeight: '700',
    paddingHorizontal: ms(10),
    paddingVertical: hp(4),
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  langModalCard: {
    width: '100%',
    borderRadius: ms(20),
    padding: ms(24),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 6,
  },
  langModalDesc: {
    fontSize: ms(13),
    textAlign: 'center',
    marginBottom: hp(16),
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    padding: ms(14),
    borderRadius: ms(14),
    borderWidth: 1.5,
    marginBottom: hp(10),
    gap: ms(12),
  },
  langFlag: {
    fontSize: ms(22),
  },
  langOptionText: {
    flex: 1,
    fontSize: FS.md,
    fontWeight: '600',
  },
  langCheck: {
    width: ms(22),
    height: ms(22),
    borderRadius: ms(11),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
