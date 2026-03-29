import React from 'react';
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getErrorMessage } from '@/utils/error';
import InfoRow from '@/components/InfoRow';
import { useReferral, useUploadMerchantLogo, useDeleteMerchantLogo } from '@/hooks/useQueryHooks';
import {
  LogOut,
  ChevronDown,
  Lock,
  Smartphone,
  Settings,
  BarChart3,
  Users,
  Shield,
  Moon,
  Trash2,
  Edit3,
  Store as StoreIcon,
  Gift,
  AlertTriangle,
  MessageCircle,
  Globe,
} from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import { useCategoryMetadata } from '@/components/MerchantCategoryIcon';
import { useFocusFade } from '@/hooks/useFocusFade';
import { useLanguage, LANGUAGES } from '@/contexts/LanguageContext';
import Constants from 'expo-constants';
import FadeInView from '@/components/FadeInView';
import PremiumLockModal from '@/components/PremiumLockModal';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { useState, useCallback } from 'react';
import { ProfileCard, LogoEditModal, LanguageModal } from '@/components/account';

export default function AccountScreen() {
  const { merchant, loading, signOut, isTeamMember, teamMember, updateMerchant } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const { focusStyle } = useFocusFade();
  const { locale, setLocale, t } = useLanguage();
  const uploadLogoMutation = useUploadMerchantLogo();
  const deleteLogoMutation = useDeleteMerchantLogo();

  // Collapsible section states
  const [storeExpanded, setStoreExpanded] = useState(false);
  const [prefExpanded, setPrefExpanded] = useState(false);
  const [compteExpanded, setCompteExpanded] = useState(false);
  const [showLogoModal, setShowLogoModal] = useState(false);
  const [premiumModal, setPremiumModal] = useState<{ visible: boolean; titleKey: string; descKey: string }>({
    visible: false,
    titleKey: '',
    descKey: '',
  });

  const isPremium = merchant?.plan === 'PREMIUM';

  const pickAndUploadLogo = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
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

  const handleDeleteLogo = useCallback(async () => {
    setShowLogoModal(false);
    try {
      await deleteLogoMutation.mutateAsync();
      updateMerchant({ ...merchant!, logoUrl: undefined });
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('account.logoDeleteError')));
    }
  }, [deleteLogoMutation, merchant, updateMerchant, t]);
  const { data: referralData } = useReferral(!isTeamMember);
  const referralCode = referralData?.referralCode ?? null;

  // Profile data is managed by React Query (useMerchantProfile, staleTime: 5min).
  // No need to force-reload on every tab focus � pull-to-refresh or mutations handle invalidation.
  const { label: categoryLabel } = useCategoryMetadata(merchant?.categorie);
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  const handleSignOut = async () => {
    Alert.alert(t('account.signOut'), t('account.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('account.signOut'),
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/login');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <Animated.View style={[styles.centered, { backgroundColor: theme.bg }, focusStyle]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </Animated.View>
    );
  }

  if (!merchant) return null;

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {/* -- Profile Card ----------------------------- */}
        <FadeInView delay={100}>
          <ProfileCard
            theme={theme}
            t={t}
            locale={locale}
            merchant={merchant}
            uploadIsPending={uploadLogoMutation.isPending}
            onLogoPress={handleLogoPress}
            referralCode={referralCode}
            categoryLabel={categoryLabel}
            router={router}
          />
        </FadeInView>

        {/* -- Team Member Banner ----------------------- */}
        {isTeamMember && teamMember && (
          <FadeInView delay={250}>
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
          </FadeInView>
        )}

        {/* -- Ma Boutique Section ---------------------- */}
        {!isTeamMember && (
          <FadeInView delay={300}>
            <TouchableOpacity
              onPress={() => setStoreExpanded(!storeExpanded)}
              activeOpacity={0.7}
              style={styles.sectionHeaderRow}
            >
              <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('account.myStore')}</Text>
              <ChevronDown
                size={ms(18)}
                color={theme.textMuted}
                strokeWidth={1.5}
                style={{ transform: [{ rotate: storeExpanded ? '180deg' : '0deg' }] }}
              />
            </TouchableOpacity>
            {storeExpanded && (
              <View style={[styles.infoCard, { backgroundColor: theme.bgCard }]}>
                {/* Edit Commerce */}
                <InfoRow
                  icon={<Edit3 size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
                  label={t('account.editStore')}
                  subtitle={t('account.editStoreSubtitle')}
                  onPress={() => router.push('/edit-profile')}
                />
                {/* Manage Stores */}
                <InfoRow
                  icon={<StoreIcon size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
                  label={t('account.manageStores')}
                  subtitle={t('account.manageStoresSubtitle')}
                  onPress={() => router.push('/stores')}
                />
                {/* Settings */}
                <InfoRow
                  icon={<Settings size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
                  label={t('account.settingsTitle')}
                  subtitle={t('account.settingsSubtitle')}
                  onPress={() => router.push('/settings')}
                />
                {/* Dashboard — locked for FREE */}
                <InfoRow
                  icon={<BarChart3 size={ms(16)} color={isPremium ? palette.charbon : theme.textMuted} strokeWidth={1.5} />}
                  label={t('account.dashboard')}
                  subtitle={isPremium ? t('account.dashboardSubtitle') : t('account.dashboardLockedSubtitle')}
                  iconBg={isPremium ? undefined : `${theme.textMuted}18`}
                  right={
                    !isPremium
                      ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: ms(4) }}>
                          <View style={{ backgroundColor: '#7C3AED18', borderRadius: ms(6), paddingHorizontal: ms(6), paddingVertical: ms(2) }}>
                            <Text style={{ fontSize: FS.xs, color: '#7C3AED', fontWeight: '600' }}>PRO</Text>
                          </View>
                          <Lock size={ms(13)} color={theme.textMuted} strokeWidth={2} />
                        </View>
                      : undefined
                  }
                  onPress={() => {
                    if (!isPremium) {
                      setPremiumModal({ visible: true, titleKey: 'account.dashboardLockedTitle', descKey: 'account.dashboardLockedMsg' });
                      return;
                    }
                    router.push('/dashboard');
                  }}
                />
                {/* Team — visible for all, locked for FREE */}
                <InfoRow
                  icon={<Users size={ms(16)} color={isPremium ? palette.charbon : theme.textMuted} strokeWidth={1.5} />}
                  label={t('account.team')}
                  subtitle={isPremium ? t('account.teamSubtitle') : t('account.teamLockedSubtitle')}
                  iconBg={isPremium ? undefined : `${theme.textMuted}18`}
                  right={
                    !isPremium
                      ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: ms(4) }}>
                          <View style={{ backgroundColor: '#7C3AED18', borderRadius: ms(6), paddingHorizontal: ms(6), paddingVertical: ms(2) }}>
                            <Text style={{ fontSize: FS.xs, color: '#7C3AED', fontWeight: '600' }}>PRO</Text>
                          </View>
                          <Lock size={ms(13)} color={theme.textMuted} strokeWidth={2} />
                        </View>
                      : undefined
                  }
                  onPress={() => {
                    if (!isPremium) {
                      setPremiumModal({ visible: true, titleKey: 'account.teamLockedTitle', descKey: 'account.teamLockedMsg' });
                      return;
                    }
                    router.push('/team-management' as any);
                  }}
                />
                {/* Referral */}
                <InfoRow
                  icon={<Gift size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
                  label={t('referral.menuTitle')}
                  subtitle={t('referral.menuSubtitle')}
                  onPress={() => router.push('/referral' as any)}
                  noBorder
                />
              </View>
            )}
          </FadeInView>
        )}

        {/* -- Preferences Section ---------------------- */}
        <FadeInView delay={400}>
          <TouchableOpacity
            onPress={() => setPrefExpanded(!prefExpanded)}
            activeOpacity={0.7}
            style={styles.sectionHeaderRow}
          >
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('account.preferences')}</Text>
            <ChevronDown
              size={ms(18)}
              color={theme.textMuted}
              strokeWidth={1.5}
              style={{ transform: [{ rotate: prefExpanded ? '180deg' : '0deg' }] }}
            />
          </TouchableOpacity>
          {prefExpanded && (
            <View style={[styles.infoCard, { backgroundColor: theme.bgCard }]}>
              {/* Dark mode */}
              <InfoRow
                icon={<Moon size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
                label={t('account.darkMode')}
                subtitle={theme.isDark ? t('account.darkModeOn') : t('account.darkModeOff')}
                onPress={theme.toggleDarkMode}
                iconBg={`${palette.charbon}15`}
                right={
                  <View style={[styles.toggle, theme.isDark ? styles.toggleOn : { backgroundColor: theme.borderLight }]}>
                    <View style={[styles.toggleKnob, theme.isDark && styles.toggleKnobOn]} />
                  </View>
                }
              />
              {/* Language */}
              <InfoRow
                icon={<Globe size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
                label={t('account.language')}
                subtitle={t('account.chooseLanguageDesc')}
                onPress={() => setShowLanguageModal(true)}
                noBorder
                right={
                  <Text style={[styles.langBadge, { color: theme.primary, backgroundColor: `${theme.primary}15` }]}>
                    {LANGUAGES.find(l => l.code === locale)?.label ?? locale}
                  </Text>
                }
              />
            </View>
          )}
        </FadeInView>

        {/* -- Compte Section ---------------------------- */}
        <FadeInView delay={500}>
          <TouchableOpacity
            onPress={() => setCompteExpanded(!compteExpanded)}
            activeOpacity={0.7}
            style={styles.sectionHeaderRow}
          >
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>{t('account.security')}</Text>
            <ChevronDown
              size={ms(18)}
              color={theme.textMuted}
              strokeWidth={1.5}
              style={{ transform: [{ rotate: compteExpanded ? '180deg' : '0deg' }] }}
            />
          </TouchableOpacity>
          {compteExpanded && (
            <View style={[styles.infoCard, { backgroundColor: theme.bgCard }]}>
              {/* Legal */}
              <InfoRow
                icon={<Shield size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
                label={t('account.legalSection')}
                subtitle={t('account.legalSubtitle')}
                onPress={() => router.push('/legal' as any)}
              />
              {/* Security / Password */}
              {!isTeamMember && (
                <InfoRow
                  icon={<Lock size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
                  label={t('account.security')}
                  subtitle={t('account.securitySubtitle')}
                  onPress={() => router.push('/security')}
                  iconBg={`${palette.charbon}15`}
                />
              )}
              {/* Devices */}
              {!isTeamMember && (
                <InfoRow
                  icon={<Smartphone size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
                  label={t('account.stores')}
                  subtitle={t('account.storesSubtitle')}
                  onPress={() => router.push('/security?tab=devices')}
                />
              )}
              {/* Contact support */}
              <InfoRow
                icon={<MessageCircle size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
                label={t('account.contactSupport')}
                onPress={() => {
                  const phone = process.env.EXPO_PUBLIC_SUPPORT_WHATSAPP || '';
                  const msg = encodeURIComponent(t('account.contactSupportMsg'));
                  Linking.openURL(`https://wa.me/${phone}?text=${msg}`);
                }}
                iconBg={`${palette.charbon}15`}
              />
              {/* Logout */}
              <InfoRow
                icon={<LogOut size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
                label={t('account.signOut')}
                onPress={handleSignOut}
              />
              {/* Delete account */}
              {!isTeamMember && (
                <InfoRow
                  icon={<Trash2 size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
                  label={t('account.deleteAccount')}
                  subtitle={t('account.deleteAccountMsg')}
                  onPress={() => router.push('/security?tab=delete')}
                  noBorder
                  right={<AlertTriangle size={ms(14)} color={theme.danger} strokeWidth={1.5} />}
                />
              )}
            </View>
          )}
        </FadeInView>

        {/* -- Logo Footer ------------------------------ */}
        <View style={styles.logoFooter}>
          <Image
            source={require('@/assets/images/jitplusprologo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={[styles.logoSubtext, { color: theme.textMuted }]}>
            JitPlus Pro
          </Text>
          <Text style={[styles.versionText, { color: theme.textMuted }]}>
            v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>
      </ScrollView>

      <LogoEditModal
        visible={showLogoModal}
        onClose={() => setShowLogoModal(false)}
        theme={theme}
        t={t}
        merchant={merchant}
        uploadIsPending={uploadLogoMutation.isPending}
        onPickPhoto={pickAndUploadLogo}
        onDelete={handleDeleteLogo}
      />

      <LanguageModal
        visible={showLanguageModal}
        onClose={() => setShowLanguageModal(false)}
        theme={theme}
        t={t}
        locale={locale}
        setLocale={setLocale}
      />

      <PremiumLockModal
        visible={premiumModal.visible}
        onClose={() => setPremiumModal(prev => ({ ...prev, visible: false }))}
        titleKey={premiumModal.titleKey}
        descKey={premiumModal.descKey}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Content
  contentContainer: {
    paddingHorizontal: wp(20),
    paddingTop: hp(60),
    paddingBottom: hp(120),
  },

  // Section
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: hp(8),
    marginTop: hp(8),
  },
  sectionTitle: {
    fontSize: FS.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: hp(8),
    marginLeft: wp(4),
    marginTop: hp(8),
  },

  // Info card
  infoCard: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: hp(16),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(16),
    paddingVertical: hp(14),
    gap: wp(12),
    borderBottomWidth: 0.5,
  },
  infoIconBox: {
    width: ms(36),
    height: ms(36),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: FS.xs, marginBottom: hp(2) },
  infoValue: { fontSize: FS.md, fontWeight: '500' },

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

  // Toggle
  toggle: {
    width: ms(48),
    height: ms(28),
    borderRadius: ms(14),
    justifyContent: 'center',
    paddingHorizontal: ms(3),
  },
  toggleOn: { backgroundColor: '#1F2937' },
  toggleKnob: {
    width: ms(22),
    height: ms(22),
    borderRadius: ms(11),
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleKnobOn: { alignSelf: 'flex-end' as const },

  // Language badge
  langBadge: {
    fontSize: FS.xs,
    fontWeight: '700',
    paddingHorizontal: ms(10),
    paddingVertical: hp(4),
    borderRadius: radius.md,
    overflow: 'hidden',
  },

  // Logo footer
  logoFooter: { alignItems: 'center', paddingTop: hp(28), paddingBottom: hp(10) },
  logoImage: { width: ms(64), height: ms(64), borderRadius: ms(14) },
  logoSubtext: { fontSize: FS.xs, marginTop: hp(8), fontWeight: '500', letterSpacing: 0.3 },
  versionText: { fontSize: FS.xs, marginTop: hp(4), opacity: 0.5, fontWeight: '400' },
});
