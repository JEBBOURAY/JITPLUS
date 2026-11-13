import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Platform,
  KeyboardAvoidingView,
  I18nManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getErrorMessage } from '@/utils/error';
import { useReferral, useUpdateMerchantProfile } from '@/hooks/useQueryHooks';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useMerchantMedia } from '@/hooks/useMerchantMedia';
import { Check, X } from 'lucide-react-native';
import { useAuthState, useAuthActions } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import type { AppLocale } from '@/contexts/LanguageContext';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { CoverHeader, TrialCard, ReferralInlineRow } from '@/components/account';
import {
  PreferencesSection,
  SecuritySection,
  LegalSection,
  DangerSection,
  TeamMemberBanner,
  LuckyWheelCard,
  LogoFooter,
} from '@/components/account/AccountSections';
import { ActionButton } from '@/components/ui/ActionButton';
import { font } from '@/constants/design';

export default function AccountScreen() {
  const { merchant, loading, isTeamMember, teamMember } = useAuthState();
  const { signOut, updateMerchant } = useAuthActions();
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { locale, setLocale, t } = useLanguage();
  const media = useMerchantMedia();

  const { isPremium, hidePlan } = usePlanStatus(merchant);

  // Referral pays out Premium months: not offered to founding members.
  const { data: referralData } = useReferral(!!merchant && !isTeamMember && !hidePlan);
  const referralCode = hidePlan ? null : referralData?.referralCode ?? null;

  // Inline language switch (pills). Mirrors the RTL-restart flow from LanguageModal.
  const handleSelectLanguage = useCallback(async (code: AppLocale) => {
    if (code === locale) return;
    // Native layout direction, not the locale: decides whether a reload is needed.
    const wasRTL = I18nManager.isRTL;
    try {
      await setLocale(code);
    } catch {
      Alert.alert(t('common.error'), t('common.genericError'));
      return;
    }
    const nowRTL = code === 'ar';
    if (wasRTL !== nowRTL) {
      if (!Updates.isEnabled) {
        Alert.alert(t('account.restartTitle'), t('account.restartRequired'));
        return;
      }
      Alert.alert(
        t('account.restartTitle'),
        t('account.restartRequired'),
        [{ text: t('common.confirm'), onPress: async () => { try { await Updates.reloadAsync(); } catch { /* ignore */ } } }],
        { cancelable: false },
      );
    }
  }, [locale, setLocale, t]);

  const [showNameModal, setShowNameModal] = useState(false);
  const [profileName, setProfileName] = useState('');
  const updateProfile = useUpdateMerchantProfile();

  const handleEditName = useCallback(() => {
    setProfileName(merchant?.nom ?? '');
    setShowNameModal(true);
  }, [merchant?.nom]);

  const closeNameModal = useCallback(() => setShowNameModal(false), []);

  const handleSaveName = useCallback(async () => {
    const trimmed = profileName.trim();
    if (!trimmed || trimmed === merchant?.nom) { setShowNameModal(false); return; }
    try {
      await updateProfile.mutateAsync({ nom: trimmed });
      updateMerchant({ nom: trimmed });
      setShowNameModal(false);
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('profileView.profileNameError')));
    }
  }, [profileName, merchant?.nom, updateProfile, updateMerchant, t]);

  const handleSignOut = useCallback(() => {
    Alert.alert(t('account.signOut'), t('account.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.signOut'),
        style: 'destructive',
        onPress: async () => {
          await signOut();
          // TabLayout useEffect handles redirect to /login once merchant=null.
        },
      },
    ]);
  }, [signOut, t]);

  // Stable callbacks keep the memoized InfoRow children from re-rendering.
  const goToReferral = useCallback(() => router.push('/referral'), [router]);
  const goToLegal = useCallback(() => router.push('/legal'), [router]);
  const goToSecurity = useCallback(() => router.push('/security'), [router]);
  const goToNotifications = useCallback(() => router.push('/notification-settings'), [router]);
  const goToDevices = useCallback(() => router.push('/security?tab=devices'), [router]);
  const goToDelete = useCallback(() => router.push('/security?tab=delete'), [router]);

  // Back to Accueil (Compte is a stack screen opened from the Home avatar).
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const openTeamLuckyWheel = useCallback(() => router.push('/lucky-wheel'), [router]);

  // The cover renders edge-to-edge: the scroll view and the body sheet that
  // overlaps it share one surface colour.
  const surface = { backgroundColor: theme.isDark ? theme.bgElevated : theme.bg };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!merchant) return null;

  return (
    <View style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        // Prevent Android clipping artifacts where rows become invisible while
        // remaining touchable.
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: hp(32) + insets.bottom }}
        style={surface}
      >
        <CoverHeader
          t={t}
          merchant={merchant}
          uploadIsPending={media.logoUploading}
          coverUploadIsPending={media.coverUploading}
          onLogoPress={!isTeamMember ? media.openLogo : undefined}
          onCoverPress={!isTeamMember ? media.openCover : undefined}
          onBackPress={goBack}
          onEditName={!isTeamMember ? handleEditName : undefined}
          topInset={insets.top}
        />

        <View style={[styles.body, surface]}>
          {/* Renders nothing on the free plan. */}
          <TrialCard
            t={t}
            locale={locale}
            merchant={merchant}
            router={router}
            isTeamMember={isTeamMember}
          />

          {referralCode && (
            <ReferralInlineRow theme={theme} t={t} referralCode={referralCode} onPress={goToReferral} />
          )}

          {isTeamMember && (
            <TeamMemberBanner teamMember={teamMember} t={t} />
          )}

          {isTeamMember && isPremium && (
            <LuckyWheelCard theme={theme} onPress={openTeamLuckyWheel} t={t} />
          )}

          <PreferencesSection
            key={`pref-${theme.mode}`}
            theme={theme}
            locale={locale}
            handleSelectLanguage={handleSelectLanguage}
            isTeamMember={isTeamMember}
            referralCode={referralCode}
            hideReferral={hidePlan}
            goToReferral={goToReferral}
            goToNotifications={goToNotifications}
            t={t}
          />

          {!isTeamMember && (
            <SecuritySection
              key={`security-${theme.mode}`}
              theme={theme}
              goToSecurity={goToSecurity}
              goToDevices={goToDevices}
              t={t}
            />
          )}

          <LegalSection key={`legal-${theme.mode}`} theme={theme} goToLegal={goToLegal} t={t} />

          <DangerSection
            key={`danger-${theme.mode}`}
            theme={theme}
            isTeamMember={isTeamMember}
            handleSignOut={handleSignOut}
            goToDelete={goToDelete}
            t={t}
          />

          <LogoFooter
            theme={theme}
            version={Constants.expoConfig?.version ?? '1.0.0'}
          />
        </View>
      </ScrollView>

      {media.modals}

      <Modal
        visible={showNameModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeNameModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.nameModalOverlay}
        >
          <View style={[styles.nameModalCard, { backgroundColor: theme.bgCard }]}>
            <Text style={[styles.nameModalTitle, { color: theme.text }]}>{t('profileView.editProfileName')}</Text>
            <TextInput
              style={[styles.nameModalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgInput }]}
              value={profileName}
              onChangeText={setProfileName}
              maxLength={100}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
              placeholder={t('profileView.editProfileName')}
              placeholderTextColor={theme.textMuted}
              accessibilityLabel={t('profileView.editProfileName')}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="organizationName"
              maxFontSizeMultiplier={1.4}
            />
            <View style={styles.nameModalActions}>
              <ActionButton
                label={t('common.cancel')}
                variant="secondary"
                icon={X}
                iconColor={theme.textMuted}
                onPress={closeNameModal}
                style={[styles.nameModalBtn, { backgroundColor: theme.bgElevated, borderColor: theme.bgElevated }]}
                labelStyle={{ color: theme.textMuted }}
              />
              <ActionButton
                label={t('common.save')}
                icon={Check}
                onPress={handleSaveName}
                loading={updateProfile.isPending}
                disabled={!profileName.trim()}
                style={[styles.nameModalBtn, styles.nameModalSave]}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Overlaps the cover by -30 so its rounded top corners sit on the header.
  body: {
    marginTop: -hp(30),
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    paddingHorizontal: wp(18),
    paddingTop: hp(20),
  },

  nameModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: wp(24) },
  nameModalCard: { borderRadius: radius.lg, padding: ms(20), gap: hp(16) },
  nameModalTitle: { fontSize: FS.lg, textAlign: 'center', fontFamily: font.semibold },
  nameModalInput: { fontSize: FS.md, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: wp(14), paddingVertical: hp(12), fontFamily: font.semibold },
  nameModalActions: { flexDirection: 'row', gap: wp(10) },
  nameModalBtn: { flex: 1 },
  nameModalSave: { backgroundColor: palette.violet, borderColor: palette.violet },
});
