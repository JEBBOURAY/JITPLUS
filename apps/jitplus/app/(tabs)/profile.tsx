import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl, Pressable, Alert, Platform, TouchableOpacity,
  KeyboardAvoidingView, Image, Linking,
} from 'react-native';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { Gift, ChevronRight, Sparkles, ScanLine } from 'lucide-react-native';
import { haptic, HapticStyle } from '@/utils/haptics';
import { useGuardedCallback } from '@/hooks/useGuardedCallback';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { api } from '@/services/api';
import FadeInView from '@/components/FadeInView';
import GuestGuard from '@/components/GuestGuard';
import Skeleton from '@/components/Skeleton';
import {
  DeleteAccountModal, OtpVerificationModal, LanguageModal,
  PersonalInfoSection, PreferencesSection, AccountSection,
  profileStyles as styles,
} from '@/components/profile';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { useProfileEditing } from '@/hooks/useProfileEditing';
import { getPermissionStatus, isNativePushRuntimeAvailable } from '@/utils/notifications';

export default function ProfileScreen() {
  const theme = useTheme();
  const { t, locale } = useLanguage();
  const { client, logout, refreshProfile, isGuest } = useAuth();
  const router = useRouter();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(!client);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [profileStats, setProfileStats] = useState<{ totalScans: number; totalRewards: number } | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [infoExpanded, setInfoExpanded] = useState(false);
  const [prefExpanded, setPrefExpanded] = useState(false);
  const [compteExpanded, setCompteExpanded] = useState(false);

  // Preferences
  const [shareInfoMerchants, setShareInfoMerchants] = useState(client?.shareInfoMerchants ?? false);
  const [notifPush, setNotifPush] = useState(client?.notifPush ?? true);
  const [notifEmail, setNotifEmail] = useState(client?.notifEmail ?? false);
  const [isSavingPref, setIsSavingPref] = useState<string | null>(null);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  const editing = useProfileEditing(client, refreshProfile, t);

  useFocusEffect(useCallback(() => {
    if (!client) refreshProfile?.().finally(() => setIsLoading(false));
    if (client) {
      setShareInfoMerchants(client.shareInfoMerchants ?? false);
      setNotifPush(client.notifPush ?? true);
      setNotifEmail(client.notifEmail ?? false);
    }
    setIsLoadingStats(true);
    api.getProfileStats()
      .then(setProfileStats)
      .catch((e) => { if (__DEV__) console.warn('Failed to load profile stats', e); })
      .finally(() => setIsLoadingStats(false));
  }, [client, refreshProfile]));

  const handleRefresh = useGuardedCallback(async () => {
    setIsRefreshing(true);
    haptic(HapticStyle.Light);
    setIsLoadingStats(true);
    await Promise.all([
      refreshProfile?.(),
      api.getProfileStats()
        .then(setProfileStats)
        .catch((e) => { if (__DEV__) console.warn('Failed to refresh profile stats', e); }),
    ]);
    setIsLoadingStats(false);
    setIsRefreshing(false);
  }, [refreshProfile]);

  const togglePreference = async (key: 'shareInfoMerchants' | 'notifPush' | 'notifEmail', value: boolean) => {
    // When enabling push, verify the OS-level permission is granted. If not,
    // prompt the user to open Settings — toggling the DB flag alone would be
    // misleading since no notifications would actually arrive.
    if (key === 'notifPush' && value && isNativePushRuntimeAvailable()) {
      const granted = await getPermissionStatus();
      if (!granted) {
        Alert.alert(
          t('profile.pushPermissionTitle'),
          t('profile.pushPermissionBody'),
          [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('profile.openSettings'), onPress: () => Linking.openSettings().catch(() => {}) },
          ],
        );
        return;
      }
    }

    setIsSavingPref(key);
    if (Platform.OS !== 'web') haptic(HapticStyle.Light);
    if (key === 'shareInfoMerchants') setShareInfoMerchants(value);
    if (key === 'notifPush') setNotifPush(value);
    if (key === 'notifEmail') setNotifEmail(value);

    try {
      await api.updateProfile({ [key]: value });
      await refreshProfile?.();
    } catch {
      if (key === 'shareInfoMerchants') setShareInfoMerchants(!value);
      if (key === 'notifPush') setNotifPush(!value);
      if (key === 'notifEmail') setNotifEmail(!value);
      Alert.alert(t('common.error'), t('profile.updateError'));
    } finally {
      setIsSavingPref(null);
    }
  };

  const handleLogout = () => {
    haptic(HapticStyle.Medium);
    Alert.alert(t('profile.logout'), t('profile.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.logout'), style: 'destructive', onPress: async () => { await logout(); router.replace('/login'); } },
    ]);
  };

  const handleDeleteAccount = () => { haptic(HapticStyle.Heavy); setShowDeleteModal(true); };

  const handleExportData = async () => {
    haptic(HapticStyle.Light);
    const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!baseDir) { Alert.alert(t('common.error'), t('profile.exportDataError')); return; }
    setIsExporting(true);
    try {
      const data = await api.exportPersonalData();
      const json = JSON.stringify(data, null, 2);
      const fileUri = `${baseDir}jitplus-donnees-personnelles.json`;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: t('profile.exportData') });
      } else {
        Alert.alert(t('profile.exportDataSuccess'), t('profile.exportDataSuccessMsg'));
      }
      await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    } catch (err) {
      if (__DEV__) console.error('Export error:', err);
      Alert.alert(t('common.error'), t('profile.exportDataError'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.retry'), onPress: () => handleExportData() },
      ]);
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
      Alert.alert(t('common.error'), t('profile.accountDeleteError'), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.retry'), onPress: () => confirmDelete(password) },
      ]);
    } finally {
      setIsDeleting(false);
    }
  };

  const initials = client
    ? `${client.prenom?.charAt(0) || ''}${client.nom?.charAt(0) || ''}`
    : '?';

  const profileSummaryTitle = editing.missingProfileLabels.length
    ? t('home.completeProfileTitle')
    : t('home.profileCompleteTitle');
  const profileSummaryHint = editing.missingProfileLabels.length
    ? t('home.completeProfileHint', { fields: editing.missingProfileLabels.join(', ') })
    : t('home.profileCompleteHint');

  const startEditingWithExpand = () => { editing.startEditing(); setInfoExpanded(true); };

  const isRTL = locale === 'ar';

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
          <View style={styles.contentContainer}>
            {/* Profile card */}
            <FadeInView delay={100}>
              <View style={styles.profileCard}>
                <View style={styles.profileRow}>
                  <LinearGradient colors={[palette.gold, palette.violetVivid]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarGradient}>
                    {isLoading ? <Skeleton width={ms(56)} height={ms(56)} borderRadius={ms(28)} /> : <Text style={styles.avatarText}>{initials.toUpperCase()}</Text>}
                  </LinearGradient>
                  <View style={styles.profileInfo}>
                    {isLoading ? <Skeleton width={wp(140)} height={hp(20)} borderRadius={6} /> : <Text style={[styles.profileName, { color: theme.text }]}>{client?.prenom} {client?.nom}</Text>}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', marginTop: hp(14), gap: wp(12) }}>
                  <TouchableOpacity 
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: `${palette.violet}15`, borderRadius: radius.lg, paddingVertical: hp(10), paddingHorizontal: wp(12), gap: wp(8) }}
                    onPress={() => router.push('/scan-history')}
                    activeOpacity={0.7}
                  >
                    <ScanLine size={ms(18)} color={palette.violet} strokeWidth={1.8} />
                    <View>
                      {isLoadingStats || isLoading ? (
                        <Skeleton width={wp(30)} height={FS.lg} borderRadius={4} style={{ marginBottom: hp(2) }} />
                      ) : (
                        <Text style={{ fontSize: FS.lg, fontWeight: '700', color: theme.text }}>{profileStats?.totalScans ?? '—'}</Text>
                      )}
                      <Text style={{ fontSize: FS.xs, color: theme.textMuted }}>{t('profile.totalScans')}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => router.push('/rewards-history')}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: `${palette.gold}15`, borderRadius: radius.lg, paddingVertical: hp(10), paddingHorizontal: wp(12), gap: wp(8) }}
                  >
                    <Gift size={ms(18)} color={palette.gold} strokeWidth={1.8} />
                    <View>
                      {isLoadingStats || isLoading ? (
                        <Skeleton width={wp(30)} height={FS.lg} borderRadius={4} style={{ marginBottom: hp(2) }} />
                      ) : (
                        <Text style={{ fontSize: FS.lg, fontWeight: '700', color: theme.text }}>{profileStats?.totalRewards ?? '—'}</Text>
                      )}
                      <Text style={{ fontSize: FS.xs, color: theme.textMuted }}>{t('profile.totalRewards')}</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </FadeInView>

            {/* Profile completion */}
            {!isLoading && (
              <FadeInView delay={200} duration={300}>
                <Pressable
                  style={[styles.profileCompletionCard, { backgroundColor: theme.bgCard, borderColor: theme.border }]}
                  onPress={() => { if (editing.profileCompletionPercent < 100) startEditingWithExpand(); }}
                  accessibilityRole="button" accessibilityLabel={t('home.completeProfileCta')}
                >
                  <View style={styles.profileCompletionHeader}>
                    <View style={[styles.profileCompletionBadge, { backgroundColor: `${palette.violet}12` }]}>
                      <Sparkles size={ms(14)} color={palette.violet} strokeWidth={1.5} />
                    </View>
                    <View style={styles.profileCompletionTextWrap}>
                      <Text style={[styles.profileCompletionTitle, { color: theme.text }]}>{profileSummaryTitle}</Text>
                      <Text style={[styles.profileCompletionHint, { color: theme.textMuted }]} numberOfLines={2}>{profileSummaryHint}</Text>
                    </View>
                    <Text style={[styles.profileCompletionPercent, { color: palette.violet }]}>{editing.profileCompletionPercent}%</Text>
                  </View>
                  <View style={[styles.profileCompletionTrack, { backgroundColor: theme.borderLight }]}>
                    <View style={[styles.profileCompletionFill, { width: `${editing.profileCompletionPercent}%`, backgroundColor: editing.profileCompletionPercent === 100 ? palette.emerald : palette.violet }]} />
                  </View>
                  {editing.profileCompletionPercent < 100 && (
                    <View style={styles.profileCompletionFooter}>
                      <Text style={[styles.profileCompletionCta, { color: theme.textSecondary }]}>{t('home.completeProfileCta')}</Text>
                      <ChevronRight size={ms(16)} color={theme.textMuted} strokeWidth={1.5} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
                    </View>
                  )}
                </Pressable>
              </FadeInView>
            )}

            {/* Referral banner */}
            <FadeInView delay={250} duration={300}>
              <Pressable
                onPress={() => { haptic(HapticStyle.Light); router.push('/referral'); }}
                style={({ pressed }) => [styles.referralBanner, pressed && { opacity: 0.85 }]}
                accessibilityRole="button" accessibilityLabel={t('profile.referralBannerTitle')}
              >
                <LinearGradient colors={[palette.violet, palette.violetVivid]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.referralBannerGradient}>
                  <View style={styles.referralBannerContent}>
                    <View style={styles.referralBannerIconWrap}><Gift size={ms(22)} color="#fff" strokeWidth={1.8} /></View>
                    <View style={styles.referralBannerTextWrap}>
                      <Text style={styles.referralBannerTitle}>{t('profile.referralBannerTitle')}</Text>
                      <Text style={styles.referralBannerDesc}>{t('profile.referralBannerDesc')}</Text>
                    </View>
                    <ChevronRight size={ms(18)} color="rgba(255,255,255,0.7)" strokeWidth={1.8} style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined} />
                  </View>
                </LinearGradient>
              </Pressable>
            </FadeInView>

            <PersonalInfoSection
              theme={theme} t={t} client={client} isLoading={isLoading}
              isEditing={editing.isEditing} isSaving={editing.isSaving}
              isSendingOtp={editing.isSendingOtp} otpTarget={editing.otpTarget}
              infoExpanded={infoExpanded} setInfoExpanded={setInfoExpanded}
              editPrenom={editing.editPrenom} setEditPrenom={editing.setEditPrenom}
              editNom={editing.editNom} setEditNom={editing.setEditNom}
              editEmail={editing.editEmail} setEditEmail={editing.setEditEmail}
              editPhoneLocal={editing.editPhoneLocal} setEditPhoneLocal={editing.setEditPhoneLocal}
              editPhoneCountry={editing.editPhoneCountry} setEditPhoneCountry={editing.setEditPhoneCountry}
              editDateNaissance={editing.editDateNaissance} setEditDateNaissance={editing.setEditDateNaissance}
              startEditing={startEditingWithExpand} cancelEditing={editing.cancelEditing}
              saveProfile={editing.saveProfile} startOtpFlow={editing.startOtpFlow}
            />

            <PreferencesSection
              theme={theme} t={t} locale={locale}
              prefExpanded={prefExpanded} setPrefExpanded={setPrefExpanded}
              shareInfoMerchants={shareInfoMerchants}
              notifPush={notifPush}
              notifEmail={notifEmail}

              isSavingPref={isSavingPref} togglePreference={togglePreference}
              setShowLanguageModal={setShowLanguageModal}
            />

            <AccountSection
                theme={theme} t={t} locale={locale} client={client}
              compteExpanded={compteExpanded} setCompteExpanded={setCompteExpanded}
              isExporting={isExporting} isDeleting={isDeleting}
              handleExportData={handleExportData} handleLogout={handleLogout}
              handleDeleteAccount={handleDeleteAccount} router={router}
            />

            {/* Footer */}
            <View style={styles.logoFooter}>
              <Image source={require('@/assets/images/jitpluslogo.png')} style={styles.logoImage} resizeMode="contain" />
              <Text style={[styles.logoSubtext, { color: theme.textMuted }]}>{t('profile.footer')}</Text>
              <Text style={[styles.versionText, { color: theme.textMuted }]}>v{Constants.expoConfig?.version || '1.0.0'}</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <DeleteAccountModal visible={showDeleteModal} hasPassword={!!client?.hasPassword} onClose={() => setShowDeleteModal(false)} onConfirm={confirmDelete} />
      <OtpVerificationModal
        visible={editing.showOtpModal} targetValue={editing.otpTarget?.value || ''}
        otpCode={editing.otpCode} otpError={editing.otpError}
        isVerifying={editing.isVerifyingOtp} isSending={editing.isSendingOtp} resendTimer={editing.otpResendTimer}
        onChangeCode={(code) => { editing.setOtpCode(code); editing.setOtpError(''); }}
        onVerify={editing.verifyOtpAndApply} onResend={editing.resendOtp} onClose={editing.dismissOtpModal}
      />
      <LanguageModal visible={showLanguageModal} onClose={() => setShowLanguageModal(false)} />
    </View>
  );
}
