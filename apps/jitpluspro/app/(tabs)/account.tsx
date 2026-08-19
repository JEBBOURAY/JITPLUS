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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getErrorMessage } from '@/utils/error';
import InfoRow from '@/components/InfoRow';
import { useReferral, useUploadMerchantLogo, useDeleteMerchantLogo, useUploadMerchantCover, useDeleteMerchantCover } from '@/hooks/useQueryHooks';
import {
  LogOut,
  ChevronDown,
  Lock,
  Smartphone,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Moon,
  Gift,
  Mail,
  MessageCircle,
  Globe,
  Check,
  X,
  Ticket,
  ClipboardList,
} from 'lucide-react-native';
import { useAuthState, useAuthActions } from '@/contexts/AuthContext';
import api from '@/services/api';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import { useLanguage, LANGUAGES } from '@/contexts/LanguageContext';
import type { AppLocale } from '@/contexts/LanguageContext';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import PremiumLockModal from '@/components/PremiumLockModal';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { ASYNC_STORAGE_KEYS } from '@/constants/app';
import { CoverHeader, TrialCard, ReferralInlineRow, LogoEditModal, CoverEditModal } from '@/components/account';

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
      <ChevronDown size={ms(18)} color={color} strokeWidth={1.5} />
    </Animated.View>
  );
});

function PreferencesSection({
  prefExpanded,
  togglePref,
  theme,
  cardDarkBorder,
  VIOLET_ICON_BG,
  locale,
  handleSelectLanguage,
  isTeamMember,
  referralCode,
  toggleDark,
  goToReferral,
  checklistHidden,
  onRestoreChecklist,
  t,
}: {
  prefExpanded: boolean;
  togglePref: () => void;
  theme: ReturnType<typeof useTheme>;
  cardDarkBorder: { borderWidth: number; borderColor: string } | null;
  VIOLET_ICON_BG: string;
  locale: AppLocale;
  handleSelectLanguage: (code: AppLocale) => Promise<void>;
  isTeamMember: boolean;
  referralCode: string | null;
  toggleDark: () => void;
  goToReferral: () => void;
  checklistHidden: boolean;
  onRestoreChecklist: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  return (
    <View>
      <TouchableOpacity
        onPress={togglePref}
        activeOpacity={0.7}
        style={styles.sectionHeaderRow}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('account.preferences')}
        accessibilityState={{ expanded: prefExpanded }}
      >
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.sectionHeaderIcon, { backgroundColor: VIOLET_ICON_BG }] }>
            <SlidersHorizontal size={ms(15)} color={palette.violet} strokeWidth={1.8} />
          </View>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('account.preferences')}</Text>
        </View>
        <AnimatedChevron expanded={prefExpanded} color={theme.textMuted} />
      </TouchableOpacity>
      {prefExpanded && (
        <View style={[styles.infoCard, { backgroundColor: theme.isDark ? theme.bgElevated : theme.bgCard }, cardDarkBorder]}>
          <InfoRow
            icon={<Moon size={ms(16)} color={palette.violet} strokeWidth={1.5} />}
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
              icon={<Gift size={ms(16)} color={palette.violet} strokeWidth={1.5} />}
              label={t('referral.menuTitle')}
              subtitle={t('referral.menuSubtitle')}
              onPress={goToReferral}
              iconBg={VIOLET_ICON_BG}
            />
          )}
          {checklistHidden && (
            <InfoRow
              icon={<ClipboardList size={ms(16)} color={palette.violet} strokeWidth={1.5} />}
              label={t('account.showChecklist')}
              subtitle={t('account.showChecklistSub')}
              onPress={onRestoreChecklist}
              iconBg={VIOLET_ICON_BG}
            />
          )}
          <View style={styles.langBlock}>
            <View style={styles.langBlockHead}>
              <View style={[styles.infoIconBox, { backgroundColor: VIOLET_ICON_BG }]}>
                <Globe size={ms(16)} color={palette.violet} strokeWidth={1.5} />
              </View>
              <View style={styles.infoContent}>
                <Text style={[styles.infoValue, { color: theme.text }]}>{t('account.language')}</Text>
                <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('account.chooseLanguageDesc')}</Text>
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
  VIOLET_ICON_BG,
  isTeamMember,
  goToSecurity,
  goToDevices,
  goToLegal,
  goToStorePreview,
  openSupport,
  t,
}: {
  compteExpanded: boolean;
  toggleCompte: () => void;
  theme: ReturnType<typeof useTheme>;
  cardDarkBorder: { borderWidth: number; borderColor: string } | null;
  VIOLET_ICON_BG: string;
  isTeamMember: boolean;
  goToSecurity: () => void;
  goToDevices: () => void;
  goToLegal: () => void;
  goToStorePreview: () => void;
  openSupport: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  return (
    <View>
      <TouchableOpacity
        onPress={toggleCompte}
        activeOpacity={0.7}
        style={styles.sectionHeaderRow}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('account.security')}
        accessibilityState={{ expanded: compteExpanded }}
      >
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.sectionHeaderIcon, { backgroundColor: VIOLET_ICON_BG }]}>
            <ShieldCheck size={ms(15)} color={palette.violet} strokeWidth={1.8} />
          </View>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('account.security')}</Text>
        </View>
        <AnimatedChevron expanded={compteExpanded} color={theme.textMuted} />
      </TouchableOpacity>
      {compteExpanded && (
        <View style={[styles.infoCard, { backgroundColor: theme.isDark ? theme.bgElevated : theme.bgCard }, cardDarkBorder]}>
          {!isTeamMember && (
            <InfoRow
              icon={<Lock size={ms(16)} color={palette.violet} strokeWidth={1.5} />}
              label={t('account.passwordRow')}
              subtitle={t('account.passwordRowSubtitle')}
              onPress={goToSecurity}
              iconBg={VIOLET_ICON_BG}
            />
          )}
          {!isTeamMember && (
            <InfoRow
              icon={<Smartphone size={ms(16)} color={palette.violet} strokeWidth={1.5} />}
              label={t('account.stores')}
              subtitle={t('account.storesSubtitle')}
              onPress={goToDevices}
              iconBg={VIOLET_ICON_BG}
            />
          )}
          <InfoRow
            icon={<SlidersHorizontal size={ms(16)} color={palette.violet} strokeWidth={1.5} />}
            label={t('account.storePreviewTitle')}
            subtitle={t('account.storePreviewSubtitle')}
            onPress={goToStorePreview}
            iconBg={VIOLET_ICON_BG}
          />
          <InfoRow
            icon={<Shield size={ms(16)} color={palette.violet} strokeWidth={1.5} />}
            label={t('account.legalSection')}
            subtitle={t('account.legalSubtitle')}
            onPress={goToLegal}
            iconBg={VIOLET_ICON_BG}
          />
          <View style={styles.supportRowWrap}>
            <InfoRow
              icon={<MessageCircle size={ms(16)} color={palette.violet} strokeWidth={1.5} />}
              label={t('account.contactSupport')}
              subtitle={t('account.supportShortcutTag')}
              onPress={openSupport}
              iconBg={VIOLET_ICON_BG}
              noBorder
              right={
                <View style={styles.supportChannels}>
                  <View style={[styles.channelDot, { backgroundColor: '#25D36618' }]}>
                    <MessageCircle size={ms(12)} color="#25D366" strokeWidth={2} />
                  </View>
                  <View style={[styles.channelDot, { backgroundColor: '#EA433518' }]}>
                    <Mail size={ms(12)} color="#EA4335" strokeWidth={2} />
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
  VIOLET_ICON_BG,
  isTeamMember,
  handleSignOut,
  goToDelete,
  t,
}: {
  theme: ReturnType<typeof useTheme>;
  cardDarkBorder: { borderWidth: number; borderColor: string } | null;
  VIOLET_ICON_BG: string;
  isTeamMember: boolean;
  handleSignOut: () => void;
  goToDelete: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}) {
  return (
    <View style={styles.dangerSection}>
      <Text style={[styles.dangerEyebrow, { color: theme.textMuted }]} maxFontSizeMultiplier={1.4}>
        {t('common.account')}
      </Text>
      <View style={[styles.infoCard, { backgroundColor: theme.isDark ? theme.bgElevated : theme.bgCard, marginBottom: hp(6) }, cardDarkBorder]}>
        <InfoRow
          icon={<LogOut size={ms(16)} color={palette.violet} strokeWidth={1.5} />}
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
  if (!teamMember) return null;

  return (
    <View style={[styles.teamBanner, { backgroundColor: `${palette.charbon}12`, borderColor: `${palette.charbon}30` }]}>
      <View style={[styles.infoIconBox, { backgroundColor: `${palette.charbon}15` }]}> 
        <Shield size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
      </View>
      <View style={styles.infoContent}>
        <Text style={[styles.infoValue, { color: theme.text }]}>
          {t('account.teamMemberTitle', { name: teamMember.nom })}
        </Text>
        <Text style={[styles.infoLabel, { color: theme.textMuted }]}> 
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
        icon={<Ticket size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
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
  const uploadLogoMutation = useUploadMerchantLogo();
  const deleteLogoMutation = useDeleteMerchantLogo();
  const uploadCoverMutation = useUploadMerchantCover();
  const deleteCoverMutation = useDeleteMerchantCover();

  // Collapsible section states â€” single state to avoid triple re-renders
  const [expandedSection, setExpandedSection] = useState<'pref' | 'compte' | null>(null);
  const togglePref = useCallback(() => setExpandedSection((p) => (p === 'pref' ? null : 'pref')), []);
  const toggleCompte = useCallback(() => setExpandedSection((p) => (p === 'compte' ? null : 'compte')), []);
  const prefExpanded = expandedSection === 'pref';
  const compteExpanded = expandedSection === 'compte';
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [showCoverModal, setShowCoverModal] = useState(false);
  const [premiumModal, setPremiumModal] = useState<{ visible: boolean; titleKey: string; descKey: string }>({
    visible: false,
    titleKey: '',
    descKey: '',
  });

  const isPremium = merchant?.plan === 'PREMIUM';

  // Soft violet used consistently for every list/accordion icon (BRIEF token).
  const VIOLET_ICON_BG = 'rgba(124,58,237,0.09)';

  // Dark mode: give each card a clearly visible border so it detaches from the
  // near-black screen background (shadows alone are invisible on dark).
  const cardDarkBorder = useMemo(
    () => (theme.isDark ? { borderWidth: 1, borderColor: theme.border } : null),
    [theme.isDark, theme.border],
  );

  // Stable binary dark-mode toggle (keeps the InfoRow memo intact and flips
  // the theme deterministically in a single tap regardless of current mode).
  const toggleDark = useCallback(() => theme.setDarkMode(!theme.isDark), [theme.isDark, theme.setDarkMode]);

  const pickAndUploadLogo = useCallback(async () => {
    if (uploadLogoMutation.isPending) return;
    try {
      const ImagePicker = await import('expo-image-picker');
      const preferredMode =
        (ImagePicker as any).UIImagePickerPreferredAssetRepresentationMode?.Compatible ?? 'compatible';
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        preferredAssetRepresentationMode: preferredMode,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const { url } = await uploadLogoMutation.mutateAsync({
        uri: asset.uri,
        mimeType: asset.mimeType,
        merchantName: merchant?.nom,
      });
      updateMerchant({ ...merchant!, logoUrl: url });
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('account.logoUploadError')));
    }
  }, [uploadLogoMutation, merchant, updateMerchant, t]);

  const pickAndUploadCover = useCallback(async () => {
    if (uploadCoverMutation.isPending) return;
    try {
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('common.error'), t('upload.permissionDenied'));
        return;
      }
      const preferredMode =
        (ImagePicker as any).UIImagePickerPreferredAssetRepresentationMode?.Compatible ?? 'compatible';
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [16, 9], // Cover images are usually wider
        quality: 0.8,    // A bit more quality for covers
        preferredAssetRepresentationMode: preferredMode,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const { url } = await uploadCoverMutation.mutateAsync({
        uri: asset.uri,
        mimeType: asset.mimeType,
        merchantName: merchant?.nom,
        fileSize: asset.fileSize,
      });
      updateMerchant({ ...merchant!, coverUrl: url });
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('account.coverUploadError')));
    }
  }, [uploadCoverMutation, merchant, updateMerchant, t]);

  const handleLogoPress = useCallback(() => {
    if (isTeamMember) {
      Alert.alert(t('account.logoOwnerOnly'), t('account.logoOwnerOnlyMsg'));
      return;
    }
    if (!isPremium) {
      setPremiumModal({ visible: true, titleKey: 'account.logoProTitle', descKey: 'account.logoProMsg' });
      return;
    }
    setShowLogoModal(true);
  }, [isPremium, isTeamMember, t]);

  const handleCoverPress = useCallback(() => {
    if (isTeamMember) {
      Alert.alert(t('account.logoOwnerOnly'), t('account.logoOwnerOnlyMsg'));
      return;
    }
    setShowCoverModal(true);
  }, [isTeamMember, t]);

  const handleDeleteLogo = useCallback(() => {
    setShowLogoModal(false);
    Alert.alert(
      t('account.logoDeleteConfirmTitle'),
      t('account.logoDeleteConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('account.deleteProfilePhoto'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLogoMutation.mutateAsync();
              updateMerchant({ ...merchant!, logoUrl: undefined });
            } catch (err) {
              Alert.alert(t('common.error'), getErrorMessage(err, t('account.logoDeleteError')));
            }
          },
        },
      ],
    );
  }, [deleteLogoMutation, merchant, updateMerchant, t]);

  const handleDeleteCover = useCallback(() => {
    setShowCoverModal(false);
    Alert.alert(
      t('account.coverDeleteConfirmTitle'),
      t('account.coverDeleteConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('account.deleteCoverPhoto'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCoverMutation.mutateAsync();
              updateMerchant({ ...merchant!, coverUrl: undefined });
            } catch (err) {
              Alert.alert(t('common.error'), getErrorMessage(err, t('account.coverDeleteError')));
            }
          },
        },
      ],
    );
  }, [deleteCoverMutation, merchant, updateMerchant, t]);
  const { data: referralData } = useReferral(!isTeamMember);
  const referralCode = referralData?.referralCode ?? null;

  // Profile data is managed by React Query (useMerchantProfile, staleTime: 5min).
  // No need to force-reload on every tab focus â€” pull-to-refresh or mutations handle invalidation.
  const closeLogoModal = useCallback(() => setShowLogoModal(false), []);
  const closeCoverModal = useCallback(() => setShowCoverModal(false), []);
  const closePremiumModal = useCallback(() => setPremiumModal((prev) => ({ ...prev, visible: false })), []);

  // Inline language switch (pills). Mirrors the RTL-restart flow from LanguageModal.
  const handleSelectLanguage = useCallback(async (code: AppLocale) => {
    if (code === locale) return;
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

  // -- Profile name edit --
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

  // -- Checklist hidden state (readable from Compte so user can restore it) --
  const [checklistHidden, setChecklistHidden] = useState<boolean>(false);
  useEffect(() => {
    AsyncStorage.getItem(ASYNC_STORAGE_KEYS.CHECKLIST_HIDDEN).then((v) => {
      setChecklistHidden(v === 'true');
    }).catch(() => {});
  }, []);

  const restoreChecklist = useCallback(() => {
    AsyncStorage.multiSet([
      [ASYNC_STORAGE_KEYS.CHECKLIST_HIDDEN, 'false'],
      [ASYNC_STORAGE_KEYS.CHECKLIST_HIDE_NOTICE_SEEN, 'false'],
    ]).catch(() => {});
    setChecklistHidden(false);
    // Always land on Accueil (matches the "sur l'Accueil" promise in the subtitle copy) —
    // router.back() is unreliable here since it depends on how the user reached Compte.
    router.replace('/(tabs)/activity');
  }, [router]);

  // -- Stable navigation callbacks (keeps InfoRow / ProfileCard memo stable) --
  const goToReferral = useCallback(() => router.push('/referral'), [router]);
  const goToLegal = useCallback(() => router.push('/legal'), [router]);
  const goToSecurity = useCallback(() => router.push('/security'), [router]);
  const goToStorePreview = useCallback(() => router.push({ pathname: '/store-preview', params: { mode: 'edit', view: 'preview' } } as never), [router]);
  const goToDevices = useCallback(() => router.push('/security?tab=devices'), [router]);
  const goToDelete = useCallback(() => router.push('/security?tab=delete'), [router]);

  // Back to Accueil (Compte is no longer a bottom-bar tab; it's opened from the Home avatar).
  const goBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/activity');
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

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!merchant) return null;

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

        {/* -- Cover Header (edge-to-edge gradient, hosts back + cover-edit + avatar + name) -- */}
        <CoverHeader
          t={t}
          merchant={merchant}
          uploadIsPending={uploadLogoMutation.isPending}
          coverUploadIsPending={uploadCoverMutation.isPending}
          onLogoPress={handleLogoPress}
          onCoverPress={!isTeamMember ? handleCoverPress : undefined}
          onBackPress={goBack}
          onEditName={!isTeamMember ? handleEditName : undefined}
          topInset={insets.top}
        />

        {/* -- Body panel overlapping the cover by -30 -- */}
        <View style={bodyStyle}>
          {/* Trial / Premium card (dark, standalone, self-service CTA to /plan) */}
          {isPremium && (
            <TrialCard
              t={t}
              locale={locale}
              merchant={merchant}
              router={router}
              isTeamMember={isTeamMember}
            />
          )}

          {/* Referral compact row (only when a code exists — mockup layout) */}
          {referralCode && (
            <ReferralInlineRow
              theme={theme}
              t={t}
              referralCode={referralCode}
              router={router}
            />
          )}

          {/* -- Team Member Banner ----------------------- */}
          {isTeamMember && (
            <TeamMemberBanner theme={theme} teamMember={teamMember} t={t} />
          )}

          {/* -- LuckyWheel for team members (separate section) -- */}
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
            VIOLET_ICON_BG={VIOLET_ICON_BG}
            locale={locale}
            handleSelectLanguage={handleSelectLanguage}
            isTeamMember={isTeamMember}
            referralCode={referralCode}
            toggleDark={toggleDark}
            goToReferral={goToReferral}
            checklistHidden={checklistHidden}
            onRestoreChecklist={restoreChecklist}
            t={t}
          />

          <AccountSection
            key={`account-${theme.mode}`}
            compteExpanded={compteExpanded}
            toggleCompte={toggleCompte}
            theme={theme}
            cardDarkBorder={cardDarkBorder}
            VIOLET_ICON_BG={VIOLET_ICON_BG}
            isTeamMember={isTeamMember}
            goToSecurity={goToSecurity}
            goToDevices={goToDevices}
            goToLegal={goToLegal}
            goToStorePreview={goToStorePreview}
            openSupport={openSupport}
            t={t}
          />

          <DangerSection
            key={`danger-${theme.mode}`}
            theme={theme}
            cardDarkBorder={cardDarkBorder}
            VIOLET_ICON_BG={VIOLET_ICON_BG}
            isTeamMember={isTeamMember}
            handleSignOut={handleSignOut}
            goToDelete={goToDelete}
            t={t}
          />

          {/* -- Logo Footer (compact, low opacity, very bottom) -------- */}
          <LogoFooter
            theme={theme}
            version={Constants.expoConfig?.version ?? '1.0.0'}
          />
        </View>
      </ScrollView>

      <LogoEditModal
        visible={showLogoModal}
        onClose={closeLogoModal}
        theme={theme}
        t={t}
        merchant={merchant}
        uploadIsPending={uploadLogoMutation.isPending}
        onPickPhoto={pickAndUploadLogo}
        onDelete={handleDeleteLogo}
      />

      <CoverEditModal
        visible={showCoverModal}
        onClose={closeCoverModal}
        theme={theme}
        t={t}
        merchant={merchant}
        uploadIsPending={uploadCoverMutation.isPending}
        onPickPhoto={pickAndUploadCover}
        onDelete={handleDeleteCover}
      />

      <PremiumLockModal
        visible={premiumModal.visible}
        onClose={closePremiumModal}
        titleKey={premiumModal.titleKey}
        descKey={premiumModal.descKey}
      />

      {/* -- Edit Profile Name Modal -- */}
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
              <TouchableOpacity
                onPress={closeNameModal}
                style={[styles.nameModalBtn, { backgroundColor: theme.bgElevated }]}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <X size={ms(16)} color={theme.textMuted} />
                <Text style={[styles.nameModalBtnText, { color: theme.textMuted }]}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveName}
                disabled={savingName || !profileName.trim()}
                style={[styles.nameModalBtn, { backgroundColor: palette.violet, opacity: profileName.trim() ? 1 : 0.5 }]}
                accessibilityRole="button"
                accessibilityLabel={t('common.save')}
                accessibilityState={{ disabled: savingName || !profileName.trim() }}
              >
                {savingName ? <ActivityIndicator size="small" color="#fff" /> : <Check size={ms(16)} color="#fff" />}
                <Text style={[styles.nameModalBtnText, { color: '#fff' }]}>{t('common.save')}</Text>
              </TouchableOpacity>
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

  // Content
  contentContainer: {
    // No horizontal padding here: the CoverHeader renders edge-to-edge and
    // the body (below) applies its own horizontal padding.
  },

  // Body panel — white rounded surface that overlaps the gradient cover by
  // -30 with rounded top corners, mirroring the mockup's `.body` block.
  body: {
    marginTop: -hp(30),
    borderTopLeftRadius: ms(26),
    borderTopRightRadius: ms(26),
    paddingHorizontal: wp(18),
    paddingTop: hp(20),
  },

  // Section
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
    borderRadius: ms(9),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: FS.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: hp(8),
    marginLeft: wp(4),
    marginTop: hp(8),
    fontFamily: 'Lexend_700Bold',
  },

  // Info card
  infoCard: {
    borderRadius: radius.xl,
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
  infoLabel: { fontSize: FS.xs, marginBottom: hp(2), fontFamily: 'Lexend_400Regular' },
  infoValue: { fontSize: FS.md, fontWeight: '500', fontFamily: 'Lexend_500Medium' },

  // Team banner
  teamBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: wp(14),
    marginBottom: hp(16),
    gap: wp(12),
  },

  // Support row (secondary weight) + channel icons
  supportRowWrap: { opacity: 0.78 },
  supportChannels: { flexDirection: 'row', gap: wp(6) },
  channelDot: {
    width: ms(24),
    height: ms(24),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Danger zone: isolated section with an eyebrow label, sits BELOW the
  // Security accordion (not gated by its expand state) so real account
  // actions are always visible.
  dangerSection: {
    marginTop: hp(14),
  },
  dangerEyebrow: {
    fontSize: ms(10),
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: hp(10),
    marginLeft: wp(4),
    fontFamily: 'Lexend_700Bold',
  },
  // Delete account: low-affordance red text link (confirmation on Security screen)
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
    fontFamily: 'Lexend_500Medium',
    textDecorationLine: 'underline',
  },

  // Language pills
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
  langPillLabel: { fontSize: FS.sm, fontWeight: '600', fontFamily: 'Lexend_600SemiBold', flexShrink: 1 },
  langPillLabelRtl: { writingDirection: 'rtl', textAlign: 'right' },

  // Logo footer (compact, low opacity)
  logoFooter: { alignItems: 'center', paddingTop: hp(24), paddingBottom: hp(10), opacity: 0.5 },
  logoImage: { width: ms(22), height: ms(22), borderRadius: ms(6) },
  logoSubtext: { fontSize: ms(10), marginTop: hp(5), fontWeight: '500', letterSpacing: 0.3, fontFamily: 'Lexend_500Medium' },
  versionText: { fontSize: ms(9), marginTop: hp(2), fontWeight: '400', fontFamily: 'Lexend_400Regular' },

  // Edit profile name modal
  nameModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: wp(24) },
  nameModalCard: { borderRadius: radius.xl, padding: ms(20), gap: hp(16) },
  nameModalTitle: { fontSize: FS.lg, fontWeight: '700', textAlign: 'center', fontFamily: 'Lexend_700Bold' },
  nameModalInput: { fontSize: FS.md, fontWeight: '600', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: wp(14), paddingVertical: hp(12), fontFamily: 'Lexend_600SemiBold' },
  nameModalActions: { flexDirection: 'row', gap: wp(10) },
  nameModalBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(6), paddingVertical: hp(12), borderRadius: radius.md },
  nameModalBtnText: { fontSize: FS.sm, fontWeight: '600', fontFamily: 'Lexend_600SemiBold' },
});