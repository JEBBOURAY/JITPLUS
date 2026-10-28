import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
  Animated,
  Linking,
  TextInput,
  Modal,
  Switch,
  Platform,
  KeyboardAvoidingView,
  I18nManager,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// expo-image-picker is lazy-loaded inside the picker handlers below — its
// native module weighs ~800KB and is only needed if the user taps the
// logo/cover edit buttons.
import { getErrorMessage } from '@/utils/error';
import InfoRow from '@/components/InfoRow';
import { useReferral } from '@/hooks/useQueryHooks';
import { usePlanStatus } from '@/hooks/usePlanStatus';
import { useMerchantMedia } from '@/hooks/useMerchantMedia';
import {
  LogOut,
  ChevronDown,
  Smartphone,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Moon,
  Mail,
  MessageCircle,
  Globe,
  Check,
  X,
} from 'lucide-react-native';
import {
  JitGames,
  JitGift,
  JitLock,
  JitStore,
} from '@/components/icons';
import { useAuthState, useAuthActions } from '@/contexts/AuthContext';
import api from '@/services/api';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import { useLanguage, LANGUAGES } from '@/contexts/LanguageContext';
import type { AppLocale } from '@/contexts/LanguageContext';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { CoverHeader, TrialCard, ReferralInlineRow } from '@/components/account';
import { ActionButton } from '@/components/ui/ActionButton';
import { font, icon } from '@/constants/design';
import { useDir } from '@/hooks/useDir';

// Soft violet used consistently for every list/accordion icon.
const VIOLET_ICON_BG = 'rgba(124,58,237,0.09)';

/**
 * Chevron that smoothly rotates 180° (~250ms) when a section opens/closes,
 * instead of snapping between two static states.
 */
const AnimatedChevron = React.memo(function AnimatedChevron({ expanded, color }: { expanded: boolean; color: string }) {
  const anim = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: expanded ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [expanded, anim]);
  const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <ChevronDown size={ms(18)} color={color} strokeWidth={icon.stroke} />
    </Animated.View>
  );
});

function PreferencesSection({
  prefExpanded,
  togglePref,
  theme,
  cardDarkBorder,
  locale,
  handleSelectLanguage,
  isTeamMember,
  referralCode,
  toggleDark,
  goToReferral,
  t,
}: {
  prefExpanded: boolean;
  togglePref: () => void;
  theme: ReturnType<typeof useTheme>;
  cardDarkBorder: { borderWidth: number; borderColor: string } | null;
  locale: AppLocale;
  handleSelectLanguage: (code: AppLocale) => Promise<void>;
  isTeamMember: boolean;
  referralCode: string | null;
  toggleDark: () => void;
  goToReferral: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  const dir = useDir();
  return (
    <View>
      <TouchableOpacity
        onPress={togglePref}
        activeOpacity={0.7}
        style={[styles.sectionHeaderRow, { flexDirection: dir.row }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('account.preferences')}
        accessibilityState={{ expanded: prefExpanded }}
      >
        <View style={[styles.sectionHeaderLeft, { flexDirection: dir.row }]}>
          <View style={[styles.sectionHeaderIcon, { backgroundColor: VIOLET_ICON_BG }]}>
            <SlidersHorizontal size={ms(15)} color={palette.violet} strokeWidth={icon.stroke} />
          </View>
          <Text style={[styles.sectionTitle, dir.isRTL ? styles.sectionTitleRtl : styles.sectionTitleLtr, { color: theme.textSecondary }]}>{t('account.preferences')}</Text>
        </View>
        <AnimatedChevron expanded={prefExpanded} color={theme.textMuted} />
      </TouchableOpacity>
      {prefExpanded && (
        <View style={[styles.infoCard, { backgroundColor: theme.isDark ? theme.bgElevated : theme.bgCard }, cardDarkBorder]}>
          <InfoRow
            icon={<Moon size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />}
            label={t('account.darkMode')}
            subtitle={theme.isDark ? t('account.darkModeOn') : t('account.darkModeOff')}
            onPress={toggleDark}
            iconBg={VIOLET_ICON_BG}
            accessibilityRole="switch"
            accessibilityState={{ checked: theme.isDark }}
            right={
              <Switch
                value={theme.isDark}
                onValueChange={theme.setDarkMode}
                trackColor={{ false: theme.borderLight, true: palette.violet }}
                thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                ios_backgroundColor={theme.borderLight}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
            }
          />
          {!isTeamMember && !referralCode && (
            <InfoRow
              icon={<JitGift size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />}
              label={t('referral.menuTitle')}
              subtitle={t('referral.menuSubtitle')}
              onPress={goToReferral}
              iconBg={VIOLET_ICON_BG}
            />
          )}
          <View style={styles.langBlock}>
            <View style={[styles.langBlockHead, { flexDirection: dir.row }]}>
              <View style={[styles.infoIconBox, { backgroundColor: VIOLET_ICON_BG }]}>
                <Globe size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoValue, { color: theme.text, textAlign: dir.textAlign }]}>{t('account.language')}</Text>
                <Text style={[styles.infoLabel, { color: theme.textMuted, textAlign: dir.textAlign }]}>{t('account.chooseLanguageDesc')}</Text>
              </View>
            </View>
            <View style={[styles.langPillsRow, { borderTopColor: theme.borderLight }]}>
              {LANGUAGES.map((l) => {
                const selected = l.code === locale;
                const isAr = l.code === 'ar';
                return (
                  <TouchableOpacity
                    key={l.code}
                    onPress={() => handleSelectLanguage(l.code)}
                    activeOpacity={0.7}
                    style={[
                      styles.langPill,
                      {
                        borderColor: selected ? theme.primary : theme.borderLight,
                        backgroundColor: selected ? `${theme.primary}12` : 'transparent',
                      },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={l.label}
                    accessibilityState={{ selected }}
                  >
                    <Text style={styles.langPillFlag} maxFontSizeMultiplier={1.2}>{l.flag}</Text>
                    <Text
                      style={[
                        styles.langPillLabel,
                        { color: selected ? theme.primary : theme.text },
                        isAr && styles.langPillLabelRtl,
                      ]}
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.2}
                    >
                      {isAr ? l.nativeLabel : l.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function AccountSection({
  compteExpanded,
  toggleCompte,
  theme,
  cardDarkBorder,
  isTeamMember,
  goToSecurity,
  goToDevices,
  goToLegal,
  goToStore,
  openSupport,
  t,
}: {
  compteExpanded: boolean;
  toggleCompte: () => void;
  theme: ReturnType<typeof useTheme>;
  cardDarkBorder: { borderWidth: number; borderColor: string } | null;
  isTeamMember: boolean;
  goToSecurity: () => void;
  goToDevices: () => void;
  goToLegal: () => void;
  goToStore: () => void;
  openSupport: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  const dir = useDir();
  return (
    <View>
      <TouchableOpacity
        onPress={toggleCompte}
        activeOpacity={0.7}
        style={[styles.sectionHeaderRow, { flexDirection: dir.row }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('account.security')}
        accessibilityState={{ expanded: compteExpanded }}
      >
        <View style={[styles.sectionHeaderLeft, { flexDirection: dir.row }]}>
          <View style={[styles.sectionHeaderIcon, { backgroundColor: VIOLET_ICON_BG }]}>
            <ShieldCheck size={ms(15)} color={palette.violet} strokeWidth={icon.stroke} />
          </View>
          <Text style={[styles.sectionTitle, dir.isRTL ? styles.sectionTitleRtl : styles.sectionTitleLtr, { color: theme.textSecondary }]}>{t('account.security')}</Text>
        </View>
        <AnimatedChevron expanded={compteExpanded} color={theme.textMuted} />
      </TouchableOpacity>
      {compteExpanded && (
        <View style={[styles.infoCard, { backgroundColor: theme.isDark ? theme.bgElevated : theme.bgCard }, cardDarkBorder]}>
          {!isTeamMember && (
            <InfoRow
              icon={<JitLock size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />}
              label={t('account.passwordRow')}
              subtitle={t('account.passwordRowSubtitle')}
              onPress={goToSecurity}
              iconBg={VIOLET_ICON_BG}
            />
          )}
          {!isTeamMember && (
            <InfoRow
              icon={<Smartphone size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />}
              label={t('account.stores')}
              subtitle={t('account.storesSubtitle')}
              onPress={goToDevices}
              iconBg={VIOLET_ICON_BG}
            />
          )}
          {!isTeamMember && (
            <InfoRow
              icon={<JitStore size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />}
              label={t('account.storeHubTitle')}
              subtitle={t('account.storeHubSubtitle')}
              onPress={goToStore}
              iconBg={VIOLET_ICON_BG}
            />
          )}
          <InfoRow
            icon={<Shield size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />}
            label={t('account.legalSection')}
            subtitle={t('account.legalSubtitle')}
            onPress={goToLegal}
            iconBg={VIOLET_ICON_BG}
          />
          <View style={styles.supportRowWrap}>
            <InfoRow
              icon={<MessageCircle size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} />}
              label={t('account.contactSupport')}
              subtitle={t('account.supportShortcutTag')}
              onPress={openSupport}
              iconBg={VIOLET_ICON_BG}
              noBorder
              right={
                <View style={[styles.supportChannels, { flexDirection: dir.row }]}>
                  <View style={[styles.channelDot, { backgroundColor: '#25D36618' }]}>
                    <MessageCircle size={ms(12)} color="#25D366" strokeWidth={icon.strokeSmall} />
                  </View>
                  <View style={[styles.channelDot, { backgroundColor: '#EA433518' }]}>
                    <Mail size={ms(12)} color="#EA4335" strokeWidth={icon.strokeSmall} />
                  </View>
                </View>
              }
            />
          </View>
        </View>
      )}
    </View>
  );
}

function DangerSection({
  theme,
  cardDarkBorder,
  isTeamMember,
  handleSignOut,
  goToDelete,
  t,
}: {
  theme: ReturnType<typeof useTheme>;
  cardDarkBorder: { borderWidth: number; borderColor: string } | null;
  isTeamMember: boolean;
  handleSignOut: () => void;
  goToDelete: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  const dir = useDir();
  return (
    <View style={styles.dangerSection}>
      <Text
        style={[styles.dangerEyebrow, dir.isRTL ? styles.sectionTitleRtl : styles.sectionTitleLtr, { color: theme.textMuted }]}
        maxFontSizeMultiplier={1.4}
      >
        {t('common.account')}
      </Text>
      <View style={[styles.infoCard, { backgroundColor: theme.isDark ? theme.bgElevated : theme.bgCard, marginBottom: hp(6) }, cardDarkBorder]}>
        <InfoRow
          icon={<LogOut size={ms(16)} color={palette.violet} strokeWidth={icon.stroke} style={dir.flip} />}
          label={t('account.signOut')}
          onPress={handleSignOut}
          iconBg={VIOLET_ICON_BG}
          noBorder
        />
      </View>
      {!isTeamMember && (
        <TouchableOpacity
          onPress={goToDelete}
          activeOpacity={0.7}
          style={styles.deleteAccountLink}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={t('account.deleteAccount')}
        >
          <Text style={[styles.deleteAccountLinkText, { color: theme.danger }]}> {t('account.deleteAccount')} </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function TeamMemberBanner({
  theme,
  teamMember,
  t,
}: {
  theme: ReturnType<typeof useTheme>;
  teamMember: { nom: string } | null;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  const dir = useDir();
  if (!teamMember) return null;

  return (
    <View style={[styles.teamBanner, { flexDirection: dir.row, backgroundColor: `${palette.charbon}12`, borderColor: `${palette.charbon}30` }]}>
      <View style={[styles.infoIconBox, { backgroundColor: `${palette.charbon}15` }]}>
        <Shield size={ms(16)} color={palette.charbon} strokeWidth={icon.stroke} />
      </View>
      <View style={styles.infoContent}>
        <Text style={[styles.infoValue, { color: theme.text, textAlign: dir.textAlign }]}>
          {t('account.teamMemberTitle', { name: teamMember.nom })}
        </Text>
        <Text style={[styles.infoLabel, { color: theme.textMuted, textAlign: dir.textAlign }]}>
          {t('account.teamMemberSub')}
        </Text>
      </View>
    </View>
  );
}

function LuckyWheelCard({
  theme,
  cardDarkBorder,
  onPress,
  t,
}: {
  theme: ReturnType<typeof useTheme>;
  cardDarkBorder: { borderWidth: number; borderColor: string } | null;
  onPress: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  return (
    <View style={[styles.infoCard, { backgroundColor: theme.isDark ? theme.bgElevated : theme.bgCard, marginTop: hp(8) }, cardDarkBorder]}>
      <InfoRow
        icon={<JitGames size={ms(16)} color={palette.charbon} strokeWidth={icon.stroke} />}
        label={t('luckyWheel.menuTitle')}
        subtitle={t('luckyWheel.menuSubtitle')}
        onPress={onPress}
        noBorder
      />
    </View>
  );
}

function LogoFooter({
  theme,
  version,
}: {
  theme: ReturnType<typeof useTheme>;
  version: string;
}) {
  return (
    <View style={styles.logoFooter}>
      <Image
        source={require('@/assets/images/jitplusprologo.png')}
        style={styles.logoImage}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Text style={[styles.logoSubtext, { color: theme.textMuted }]}>JitPlus Pro</Text>
      <Text style={[styles.versionText, { color: theme.textMuted }]}>v{version}</Text>
    </View>
  );
}

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

  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: hp(8),
    marginTop: hp(8),
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
    flexShrink: 1,
  },
  sectionHeaderIcon: {
    width: ms(28),
    height: ms(28),
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: FS.sm,
    marginBottom: hp(8),
    marginTop: hp(8),
    fontFamily: font.semibold,
  },
  sectionTitleLtr: { marginLeft: wp(4) },
  sectionTitleRtl: { marginRight: wp(4), textAlign: 'right' },

  infoCard: {
    borderRadius: radius.lg,
    // Android can visually blank children when borderRadius + overflow:hidden
    // + elevation are combined on frequently re-rendered containers.
    overflow: Platform.OS === 'ios' ? 'hidden' : 'visible',
    marginBottom: hp(16),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: Platform.OS === 'ios' ? 0.04 : 0,
    shadowRadius: 12,
    elevation: Platform.OS === 'android' ? 0 : 2,
  },
  infoIconBox: {
    width: ms(36),
    height: ms(36),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: FS.xs, marginBottom: hp(2), fontFamily: font.regular },
  infoValue: { fontSize: FS.md, fontFamily: font.medium },

  teamBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: wp(14),
    marginBottom: hp(16),
    gap: wp(12),
  },

  supportRowWrap: { opacity: 0.78 },
  supportChannels: { flexDirection: 'row', gap: wp(6) },
  channelDot: {
    width: ms(24),
    height: ms(24),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Not gated by the Security accordion so sign-out stays visible.
  dangerSection: {
    marginTop: hp(14),
  },
  dangerEyebrow: {
    fontSize: FS.sm,
    marginBottom: hp(10),
    fontFamily: font.semibold,
  },
  // Low-affordance link: the actual confirmation lives on the Security screen.
  deleteAccountLink: {
    alignSelf: 'center',
    minHeight: ms(44),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: wp(16),
    marginTop: hp(2),
    marginBottom: hp(8),
  },
  deleteAccountLinkText: {
    fontSize: FS.sm,
    fontFamily: font.medium,
    textDecorationLine: 'underline',
  },

  langBlock: {
    paddingHorizontal: wp(16),
    paddingVertical: hp(14),
    gap: hp(12),
  },
  langBlockHead: { flexDirection: 'row', alignItems: 'center', gap: wp(12) },
  langPillsRow: {
    flexDirection: 'row',
    gap: wp(8),
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: hp(12),
  },
  langPill: {
    flex: 1,
    minHeight: ms(44),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(6),
    paddingHorizontal: wp(8),
    borderRadius: radius.md,
    borderWidth: 1.5,
  },
  langPillFlag: { fontSize: ms(16) },
  langPillLabel: { fontSize: FS.sm, fontFamily: font.semibold, flexShrink: 1 },
  langPillLabelRtl: { writingDirection: 'rtl', textAlign: 'right' },

  logoFooter: { alignItems: 'center', paddingTop: hp(24), paddingBottom: hp(10), opacity: 0.5 },
  logoImage: { width: ms(22), height: ms(22), borderRadius: radius.sm },
  logoSubtext: { fontSize: FS.xs, marginTop: hp(5), letterSpacing: 0.3, fontFamily: font.medium },
  versionText: { fontSize: FS.xs, marginTop: hp(2), fontFamily: font.regular },

  nameModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: wp(24) },
  nameModalCard: { borderRadius: radius.lg, padding: ms(20), gap: hp(16) },
  nameModalTitle: { fontSize: FS.lg, textAlign: 'center', fontFamily: font.bold },
  nameModalInput: { fontSize: FS.md, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: wp(14), paddingVertical: hp(12), fontFamily: font.semibold },
  nameModalActions: { flexDirection: 'row', gap: wp(10) },
  nameModalBtn: { flex: 1 },
  nameModalSave: { backgroundColor: palette.violet, borderColor: palette.violet },
});