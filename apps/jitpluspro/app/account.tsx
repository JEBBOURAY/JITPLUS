import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  TextInput,
  Modal,
  Platform,
  KeyboardAvoidingView,
  I18nManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getErrorMessage } from '@/utils/error';
import { useReferral } from '@/hooks/useQueryHooks';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useMerchantMedia } from '@/hooks/useMerchantMedia';
import { Check, X } from 'lucide-react-native';
import { useAuthState, useAuthActions } from '@/contexts/AuthContext';
import api from '@/services/api';
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
  AccountSection,
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

  // Single state so opening one section closes the other without triple re-renders.
  const [expandedSection, setExpandedSection] = useState<'pref' | 'compte' | null>(null);
  const togglePref = useCallback(() => setExpandedSection((p) => (p === 'pref' ? null : 'pref')), []);
  const toggleCompte = useCallback(() => setExpandedSection((p) => (p === 'compte' ? null : 'compte')), []);
  const prefExpanded = expandedSection === 'pref';
  const compteExpanded = expandedSection === 'compte';
  const { isPremium } = usePlanStatus(merchant);

  // Dark mode: give each card a clearly visible border so it detaches from the
  // near-black screen background (shadows alone are invisible on dark).
  const cardDarkBorder = useMemo(
    () => (theme.isDark ? { borderWidth: 1, borderColor: theme.border } : null),
    [theme.isDark, theme.border],
  );

  // Stable binary dark-mode toggle (keeps the InfoRow memo intact and flips
  // the theme deterministically in a single tap regardless of current mode).
  const { isDark: themeIsDark, setDarkMode } = theme;
  const toggleDark = useCallback(() => setDarkMode(!themeIsDark), [themeIsDark, setDarkMode]);

  const { data: referralData } = useReferral(!isTeamMember);
  const referralCode = referralData?.referralCode ?? null;

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
  const [savingName, setSavingName] = useState(false);

  const handleEditName = useCallback(() => {
    if (isTeamMember) return;
    setProfileName(merchant?.nom ?? '');
    setShowNameModal(true);
  }, [merchant?.nom, isTeamMember]);

  const closeNameModal = useCallback(() => setShowNameModal(false), []);

  const handleSaveName = useCallback(async () => {
    const trimmed = profileName.trim();
    if (!trimmed || trimmed === merchant?.nom) { setShowNameModal(false); return; }
    setSavingName(true);
    try {
      await api.patch('/merchant/profile', { nom: trimmed });
      updateMerchant({ ...merchant!, nom: trimmed });
      setShowNameModal(false);
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('profileView.profileNameError')));
    } finally {
      setSavingName(false);
    }
  }, [profileName, merchant, updateMerchant, t]);

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
  const goToStore = useCallback(() => router.push('/stores'), [router]);
  const goToDevices = useCallback(() => router.push('/security?tab=devices'), [router]);
  const goToDelete = useCallback(() => router.push('/security?tab=delete'), [router]);

  // Back to Accueil (Compte is a stack screen opened from the Home avatar).
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  }, [router]);

  const openTeamLuckyWheel = useCallback(() => router.push('/lucky-wheel'), [router]);

  const openSupport = useCallback(() => {
    const phone = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || '212755073325';
    const email = process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'contact@jitplus.com';
    const msg = t('account.contactSupportMsg');

    const openWhatsApp = async () => {
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
      try {
        const can = await Linking.canOpenURL(url);
        if (!can) throw new Error('unsupported');
        await Linking.openURL(url);
      } catch {
        Alert.alert(t('common.error'), t('common.genericError'));
      }
    };

    const openEmail = async () => {
      const subject = encodeURIComponent('JitPlus Pro — Support');
      const body = encodeURIComponent(msg);
      const url = `mailto:${email}?subject=${subject}&body=${body}`;
      try {
        const can = await Linking.canOpenURL(url);
        if (!can) throw new Error('unsupported');
        await Linking.openURL(url);
      } catch {
        Alert.alert(t('common.error'), t('common.genericError'));
      }
    };

    Alert.alert(
      t('account.contactSupportTitle'),
      t('account.contactSupportVia'),
      [
        { text: t('account.contactViaWhatsApp'), onPress: openWhatsApp },
        { text: t('account.contactViaEmail'), onPress: openEmail },
        { text: t('common.cancel'), style: 'cancel' },
      ],
    );
  }, [t]);

  const contentContainerStyle = useMemo(
    () => [styles.contentContainer, { paddingBottom: hp(120) + insets.bottom }],
    [insets.bottom],
  );

  const scrollStyle = useMemo(
    () => ({ backgroundColor: theme.isDark ? theme.bgElevated : theme.bg }),
    [theme.isDark, theme.bgElevated, theme.bg],
  );

  const bodyStyle = useMemo(
    () => [styles.body, { backgroundColor: theme.isDark ? theme.bgElevated : theme.bg }],
    [theme.isDark, theme.bgElevated, theme.bg],
  );

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
        // Prevent Android clipping artifacts where expanded rows become invisible
        // while remaining touchable.
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={contentContainerStyle}
        style={scrollStyle}
      >
        <CoverHeader
          t={t}
          merchant={merchant}
          uploadIsPending={media.logoUploading}
          coverUploadIsPending={media.coverUploading}
          onLogoPress={media.openLogo}
          onCoverPress={!isTeamMember ? media.openCover : undefined}
          onBackPress={goBack}
          onEditName={!isTeamMember ? handleEditName : undefined}
          topInset={insets.top}
        />

        <View style={bodyStyle}>
          {isPremium && (
            <TrialCard
              t={t}
              locale={locale}
              merchant={merchant}
              router={router}
              isTeamMember={isTeamMember}
            />
          )}

          {referralCode && (
            <ReferralInlineRow
              theme={theme}
              t={t}
              referralCode={referralCode}
              router={router}
            />
          )}

          {isTeamMember && (
            <TeamMemberBanner theme={theme} teamMember={teamMember} t={t} />
          )}

          {isTeamMember && isPremium && (
            <LuckyWheelCard
              theme={theme}
              cardDarkBorder={cardDarkBorder}
              onPress={openTeamLuckyWheel}
              t={t}
            />
          )}

          <PreferencesSection
            key={`pref-${theme.mode}`}
            prefExpanded={prefExpanded}
            togglePref={togglePref}
            theme={theme}
            cardDarkBorder={cardDarkBorder}
            locale={locale}
            handleSelectLanguage={handleSelectLanguage}
            isTeamMember={isTeamMember}
            referralCode={referralCode}
            toggleDark={toggleDark}
            goToReferral={goToReferral}
            t={t}
          />

          <AccountSection
            key={`account-${theme.mode}`}
            compteExpanded={compteExpanded}
            toggleCompte={toggleCompte}
            theme={theme}
            cardDarkBorder={cardDarkBorder}
            isTeamMember={isTeamMember}
            goToSecurity={goToSecurity}
            goToDevices={goToDevices}
            goToLegal={goToLegal}
            goToStore={goToStore}
            openSupport={openSupport}
            t={t}
          />

          <DangerSection
            key={`danger-${theme.mode}`}
            theme={theme}
            cardDarkBorder={cardDarkBorder}
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
                loading={savingName}
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

  contentContainer: {
    // No horizontal padding here: the CoverHeader renders edge-to-edge and
    // the body (below) applies its own horizontal padding.
  },

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
  nameModalTitle: { fontSize: FS.lg, textAlign: 'center', fontFamily: font.bold },
  nameModalInput: { fontSize: FS.md, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: wp(14), paddingVertical: hp(12), fontFamily: font.semibold },
  nameModalActions: { flexDirection: 'row', gap: wp(10) },
  nameModalBtn: { flex: 1 },
  nameModalSave: { backgroundColor: palette.violet, borderColor: palette.violet },
});
