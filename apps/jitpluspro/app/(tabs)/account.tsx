import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Alert,
  Pressable,
  Animated,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getErrorMessage } from '@/utils/error';
import MerchantLogo from '@/components/MerchantLogo';
import InfoRow from '@/components/InfoRow';
import { useReferral, useUploadMerchantLogo, useDeleteMerchantLogo } from '@/hooks/useQueryHooks';
import {
  MapPin,
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
  Globe,
  Check,
  Edit3,
  Store as StoreIcon,
  Crown,
  Zap,
  Calendar,
  AlertCircle,
  Gift,
  AlertTriangle,
  MessageCircle,
  Camera,
  ChevronRight,
  Copy,
} from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import MerchantCategoryIcon, { useCategoryMetadata } from '@/components/MerchantCategoryIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusFade } from '@/hooks/useFocusFade';
import { useLanguage, LANGUAGES } from '@/contexts/LanguageContext';
import Constants from 'expo-constants';
import FadeInView from '@/components/FadeInView';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { useState } from 'react';

export default function AccountScreen() {
  const { merchant, loading, signOut, isTeamMember, teamMember, updateMerchant } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const { focusStyle } = useFocusFade();
  const uploadLogoMutation = useUploadMerchantLogo();
  const deleteLogoMutation = useDeleteMerchantLogo();

  // Collapsible section states
  const [storeExpanded, setStoreExpanded] = useState(false);
  const [prefExpanded, setPrefExpanded] = useState(false);
  const [compteExpanded, setCompteExpanded] = useState(false);
  const [showLogoModal, setShowLogoModal] = useState(false);

  const pickAndUploadLogo = async () => {
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
  };

  const handleLogoPress = () => setShowLogoModal(true);

  const handleDeleteLogo = async () => {
    setShowLogoModal(false);
    try {
      await deleteLogoMutation.mutateAsync();
      updateMerchant({ ...merchant!, logoUrl: undefined });
    } catch (err) {
      Alert.alert(t('common.error'), getErrorMessage(err, t('account.logoDeleteError')));
    }
  };
  const { data: referralData } = useReferral();
  const referralCode = referralData?.referralCode ?? null;

  // Profile data is managed by React Query (useMerchantProfile, staleTime: 5min).
  // No need to force-reload on every tab focus � pull-to-refresh or mutations handle invalidation.
  const { label: categoryLabel } = useCategoryMetadata(merchant?.categorie);
  const { locale, setLocale, t } = useLanguage();
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // -- Plan helpers -------------------------------------
  const isPremium = merchant?.plan === 'PREMIUM';
  const isAdminPremium = merchant?.planActivatedByAdmin === true;
  const planExpiresAt = merchant?.planExpiresAt ? new Date(merchant.planExpiresAt) : null;
  const trialStartedAt = merchant?.trialStartedAt ? new Date(merchant.trialStartedAt) : null;
  const isTrial = isPremium && !isAdminPremium && trialStartedAt !== null && planExpiresAt !== null;

  const getDaysRemaining = (): number | null => {
    if (!planExpiresAt) return null;
    const diff = planExpiresAt.getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  };
  const daysRemaining = getDaysRemaining();

  const formatDate = (d: Date) =>
    d.toLocaleDateString(
      locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-US' : 'fr-FR',
      { day: '2-digit', month: 'long', year: 'numeric' },
    );

  const planUrgency: 'expired' | 'urgent' | 'soon' | 'ok' | null =
    !isPremium ? null
    : (isAdminPremium && !planExpiresAt) ? null
    : daysRemaining === 0 ? 'expired'
    : daysRemaining !== null && daysRemaining <= 7 ? 'urgent'
    : daysRemaining !== null && daysRemaining <= 30 ? 'soon'
    : 'ok';

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

  const initials = merchant.nom
    ? merchant.nom.split(' ').map((w: string) => w.charAt(0)).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <Animated.View style={[styles.container, { backgroundColor: theme.bg }, focusStyle]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {/* -- Profile Card ----------------------------- */}
        <FadeInView delay={100}>
          <View style={[styles.profileCard, { backgroundColor: theme.bgCard }]}>
            {/* -- Logo ---------------------------------- */}
            <View style={styles.profileCardAvatarRow}>
              <TouchableOpacity onPress={handleLogoPress} activeOpacity={0.85} style={styles.avatarRingWrapper}>
                <LinearGradient
                  colors={['#A78BFA', '#7C3AED', '#1F2937']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarRing}
                >
                  {uploadLogoMutation.isPending ? (
                    <View style={styles.avatarInner}>
                      <ActivityIndicator size="small" color={palette.violet} />
                    </View>
                  ) : merchant?.logoUrl ? (
                    <MerchantLogo logoUrl={merchant.logoUrl} style={styles.avatarInner} />
                  ) : (
                    <LinearGradient
                      colors={[palette.charbon, palette.violet]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.avatarInner}
                    >
                      <Text style={styles.avatarText}>{initials}</Text>
                    </LinearGradient>
                  )}
                </LinearGradient>
                <LinearGradient
                  colors={['#A78BFA', '#7C3AED']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarCameraBadge}
                >
                  <Camera size={ms(11)} color="#fff" strokeWidth={2.5} />
                </LinearGradient>
              </TouchableOpacity>
              <Text style={[styles.profileName, { color: theme.text }]}>{merchant.nom}</Text>
            </View>

            {/* -- Plan Row ------------------------------ */}
            <TouchableOpacity
              activeOpacity={0.78}
              onPress={() => router.push('/plan')}
              style={[
                styles.planRow,
                isPremium
                  ? { backgroundColor: '#0f031e', borderColor: '#7C3AED35' }
                  : { backgroundColor: `${theme.textMuted}06`, borderColor: `${theme.textMuted}15` },
              ]}
            >
              {/* Left icon */}
              <LinearGradient
                colors={isPremium ? ['#7C3AED', '#5B21B6'] : [`${theme.textMuted}20`, `${theme.textMuted}10`]}
                style={styles.planRowIcon}
              >
                {isPremium
                  ? (isTrial ? <Zap size={ms(16)} color="#fff" strokeWidth={2} /> : <Crown size={ms(16)} color="#FCD34D" strokeWidth={2} />)
                  : <Zap size={ms(16)} color={theme.textMuted} strokeWidth={2} />}
              </LinearGradient>

              {/* Center content */}
              <View style={styles.planRowContent}>
                <View style={styles.planRowHeader}>
                  <Text style={[styles.planRowTitle, isPremium ? { color: '#fff' } : { color: theme.text }]}>
                    {isPremium ? (isTrial ? t('account.planTrial') : 'Premium') : t('account.planFree')}
                  </Text>
                  <View style={[styles.planRowBadge, isPremium ? { backgroundColor: isTrial ? '#7C3AED' : '#065F46' } : { backgroundColor: `${theme.textMuted}20` }]}>
                    <Text style={[styles.planRowBadgeText, isPremium ? { color: '#fff' } : { color: theme.textMuted }]}>
                      {isPremium ? (isTrial ? t('account.planTrial').toUpperCase() : 'ACTIVE') : 'FREE'}
                    </Text>
                  </View>
                </View>

                {/* Expiry / admin info */}
                {isPremium && (isAdminPremium && !planExpiresAt) ? (
                  <Text style={styles.planRowSub}>{t('account.planByAdmin')}</Text>
                ) : isPremium && planExpiresAt ? (
                  <View style={styles.planRowExpiryLine}>
                    <Calendar size={11} color={planUrgency === 'expired' || planUrgency === 'urgent' ? '#f87171' : planUrgency === 'soon' ? '#A78BFA' : '#9CA3AF'} />
                    <Text style={[
                      styles.planRowExpiry,
                      planUrgency === 'expired' || planUrgency === 'urgent' ? { color: '#f87171' } : planUrgency === 'soon' ? { color: '#A78BFA' } : { color: '#9CA3AF' },
                    ]}>
                      {planUrgency === 'expired'
                        ? (isTrial ? t('account.planTrialExpired', { date: formatDate(planExpiresAt) }) : t('account.planExpired', { date: formatDate(planExpiresAt) }))
                        : (isTrial ? t('account.planTrialExpiry', { date: formatDate(planExpiresAt) }) : t('account.planExpiry', { date: formatDate(planExpiresAt) }))}
                    </Text>
                  </View>
                ) : !isPremium ? (
                  <Text style={[styles.planRowSub, { color: theme.textMuted }]}>{t('account.planFreeDesc')}</Text>
                ) : null}

                {/* Days remaining chip */}
                {isPremium && daysRemaining !== null && daysRemaining > 0 && (
                  <View style={[
                    styles.planRowDaysChip,
                    planUrgency === 'urgent' ? { backgroundColor: '#f8717118' } : planUrgency === 'soon' ? { backgroundColor: '#7C3AED18' } : { backgroundColor: '#37415118' },
                  ]}>
                    <Text style={[
                      styles.planRowDaysText,
                      planUrgency === 'urgent' ? { color: '#f87171' } : planUrgency === 'soon' ? { color: '#A78BFA' } : { color: '#9CA3AF' },
                    ]}>
                      {isTrial ? t('account.planTrialDaysLeft', { count: daysRemaining }) : t('account.planDaysLeft', { count: daysRemaining })}
                    </Text>
                  </View>
                )}

                {/* Renew alert */}
                {isPremium && (planUrgency === 'expired' || planUrgency === 'urgent' || planUrgency === 'soon') && (
                  <View style={styles.planRowRenew}>
                    <AlertCircle size={12} color="#A78BFA" />
                    <Text style={styles.planRowRenewText}>
                      {planUrgency === 'expired'
                        ? (isTrial ? t('account.planTrialRenewExpired') : t('account.planRenewExpired'))
                        : (isTrial ? t('account.planTrialRenewUrgent') : t('account.planRenewUrgent'))}
                    </Text>
                  </View>
                )}
              </View>

              {/* Right chevron */}
              <ChevronRight size={ms(18)} color={isPremium ? '#A78BFA' : theme.textMuted} />
            </TouchableOpacity>

            {/* -- Referral Code ------------------------- */}
            {referralCode && (
              <Pressable
                onPress={() => router.push('/referral' as any)}
                style={({ pressed }) => [
                  styles.referralRow,
                  { backgroundColor: `${palette.charbon}06`, borderColor: `${palette.charbon}18` },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <LinearGradient
                  colors={[`${palette.charbon}25`, `${palette.charbon}10`]}
                  style={styles.referralRowIcon}
                >
                  <Gift size={ms(16)} color={palette.charbon} strokeWidth={1.8} />
                </LinearGradient>
                <View style={styles.referralRowContent}>
                  <Text style={[styles.referralRowLabel, { color: theme.text }]}>
                    {t('account.referralActive')}
                  </Text>
                  <Text style={[styles.referralRowHint, { color: theme.textMuted }]}>
                    {t('account.referralInviteHint')}
                  </Text>
                </View>
                <View style={[styles.referralRowCode, { backgroundColor: `${palette.charbon}14` }]}>
                  <Text style={[styles.referralRowCodeText, { color: palette.charbon }]}>
                    {referralCode}
                  </Text>
                  <Copy size={ms(12)} color={palette.charbon} strokeWidth={2} />
                </View>
              </Pressable>
            )}
          </View>
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
                {/* Dashboard */}
                <InfoRow
                  icon={<BarChart3 size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
                  label={t('account.dashboard')}
                  subtitle={t('account.dashboardSubtitle')}
                  onPress={() => router.push('/dashboard')}
                />
                {/* Team */}
                <InfoRow
                  icon={<Users size={ms(16)} color={palette.charbon} strokeWidth={1.5} />}
                  label={t('account.team')}
                  subtitle={t('account.teamSubtitle')}
                  onPress={() => router.push('/team-management' as any)}
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
                onPress={() => Linking.openURL('https://wa.me/33767471397?text=Bonjour%2C%20j%27ai%20besoin%20d%27aide%20avec%20JitPlus%20Pro')}
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

      {/* -- Logo Edit Bottom Sheet -------------------- */}
      <Modal
        visible={showLogoModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLogoModal(false)}
      >
        <Pressable style={styles.bottomSheetOverlay} onPress={() => setShowLogoModal(false)}>
          <Pressable style={[styles.logoModalSheet, { backgroundColor: theme.bgCard }]} onPress={() => {}}>
            {/* Drag handle */}
            <View style={[styles.sheetHandle, { backgroundColor: `${palette.charbon}20` }]} />

            {/* Avatar preview */}
            <View style={styles.logoModalPreviewRow}>
              <LinearGradient
                colors={['#A78BFA', '#7C3AED', '#1F2937']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.logoModalRing}
              >
                {uploadLogoMutation.isPending ? (
                  <View style={[styles.logoModalInner, { backgroundColor: theme.bgCard }]}>
                    <ActivityIndicator size="large" color={palette.violet} />
                  </View>
                ) : merchant?.logoUrl ? (
                  <MerchantLogo logoUrl={merchant.logoUrl} style={styles.logoModalInner} />
                ) : (
                  <LinearGradient
                    colors={[palette.charbon, palette.violet]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.logoModalInner}
                  >
                    <Text style={styles.logoModalInitials}>{initials}</Text>
                  </LinearGradient>
                )}
              </LinearGradient>
            </View>

            <Text style={[styles.logoModalTitle, { color: theme.text }]}>{t('account.profilePhoto')}</Text>
            <Text style={[styles.logoModalSubtitle, { color: theme.textMuted }]}>
              {merchant?.logoUrl
                ? t('account.profilePhotoEditHint')
                : t('account.profilePhotoAddHint')}
            </Text>

            {/* Choose photo */}
            <TouchableOpacity
              style={styles.logoModalBtn}
              activeOpacity={0.85}
              onPress={() => {
                setShowLogoModal(false);
                setTimeout(pickAndUploadLogo, 350);
              }}
            >
              <LinearGradient
                colors={['#7C3AED', '#5B21B6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.logoModalBtnGradient}
              >
                <Camera size={ms(18)} color="#fff" strokeWidth={2} />
                <Text style={styles.logoModalBtnText}>
                  {merchant?.logoUrl ? t('account.changeProfilePhoto') : t('account.addProfilePhoto')}
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Delete (only if logo exists) */}
            {!!merchant?.logoUrl && (
              <TouchableOpacity
                style={[styles.logoModalOutlineBtn, { borderColor: '#EF444435' }]}
                activeOpacity={0.8}
                onPress={handleDeleteLogo}
              >
                <Trash2 size={ms(16)} color="#EF4444" strokeWidth={1.5} />
                <Text style={[styles.logoModalOutlineBtnText, { color: '#EF4444' }]}>{t('account.deleteProfilePhoto')}</Text>
              </TouchableOpacity>
            )}

            {/* Cancel */}
            <TouchableOpacity
              style={[styles.logoModalOutlineBtn, { borderColor: theme.borderLight }]}
              activeOpacity={0.7}
              onPress={() => setShowLogoModal(false)}
            >
              <Text style={[styles.logoModalOutlineBtnText, { color: theme.textMuted }]}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* -- Language Selector Modal ------------------- */}
      <Modal
        visible={showLanguageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowLanguageModal(false)}>
          <View style={[styles.langModalCard, { backgroundColor: theme.bgCard }]}>
            <View style={[styles.modalIconCircle, { backgroundColor: `${palette.charbon}12` }]}>
              <Globe size={ms(28)} color={palette.charbon} strokeWidth={1.5} />
            </View>
            <Text style={[styles.langModalTitle, { color: theme.text }]}>{t('account.chooseLanguage')}</Text>
            <Text style={[styles.langModalDesc, { color: theme.textMuted }]}>
              {t('account.chooseLanguageDesc')}
            </Text>

            {LANGUAGES.map((lang) => {
              const selected = locale === lang.code;
              return (
                <Pressable
                  key={lang.code}
                  onPress={async () => {
                    if (lang.code !== locale) {
                      await setLocale(lang.code);
                      if (lang.code === 'ar' || locale === 'ar') {
                        Alert.alert(
                          t('account.language'),
                          t('account.restartDirectionHint'),
                          [{ text: 'OK' }],
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
                  <Text style={styles.langFlag}>{lang.flag}</Text>
                  <Text style={[styles.langOptionText, { color: selected ? theme.primary : theme.text }]}>
                    {lang.label}
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

  // Profile card
  profileCard: {
    borderRadius: radius.xl,
    marginBottom: hp(16),
    overflow: 'hidden',
    paddingBottom: hp(16),
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  profileCardBanner: {
    height: hp(72),
    width: '100%',
  },
  profileCardAvatarRow: {
    alignItems: 'center',
    marginTop: hp(16),
    marginBottom: hp(2),
    gap: hp(8),
  },
  avatarRingWrapper: {
    position: 'relative',
  },
  avatarRing: {
    width: ms(88),
    height: ms(88),
    borderRadius: ms(44),
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  avatarInner: {
    width: ms(82),
    height: ms(82),
    borderRadius: ms(41),
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    resizeMode: 'cover',
    overflow: 'hidden',
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: ms(24),
    height: ms(24),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  avatarText: { fontSize: FS.xl, fontWeight: '700', color: '#fff', letterSpacing: 1 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: FS.lg, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' },

  // Plan row
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: wp(14),
    marginTop: hp(4),
    paddingHorizontal: wp(12),
    paddingVertical: hp(12),
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: wp(10),
  },
  planRowIcon: {
    width: ms(36),
    height: ms(36),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  planRowContent: { flex: 1, gap: hp(3) },
  planRowHeader: { flexDirection: 'row', alignItems: 'center', gap: wp(8) },
  planRowTitle: { fontSize: FS.md, fontWeight: '700' },
  planRowBadge: {
    paddingHorizontal: wp(7),
    paddingVertical: hp(2),
    borderRadius: radius.sm,
  },
  planRowBadgeText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  planRowSub: { fontSize: FS.xs, color: '#9CA3AF', lineHeight: FS.xs * 1.4 },
  planRowExpiryLine: { flexDirection: 'row', alignItems: 'center', gap: wp(5) },
  planRowExpiry: { fontSize: FS.xs, fontWeight: '600' },
  planRowDaysChip: {
    alignSelf: 'flex-start',
    paddingHorizontal: wp(8),
    paddingVertical: hp(2),
    borderRadius: radius.sm,
    marginTop: hp(2),
  },
  planRowDaysText: { fontSize: 11, fontWeight: '700' },
  planRowRenew: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: wp(6),
    backgroundColor: '#7C3AED10',
    borderRadius: radius.md,
    paddingHorizontal: wp(8),
    paddingVertical: hp(5),
    marginTop: hp(4),
  },
  planRowRenewText: { flex: 1, fontSize: 11, color: '#A78BFA', lineHeight: 16 },

  // Referral row
  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: wp(14),
    marginTop: hp(8),
    marginBottom: hp(4),
    paddingHorizontal: wp(12),
    paddingVertical: hp(12),
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: wp(10),
  },
  referralRowIcon: {
    width: ms(36),
    height: ms(36),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralRowContent: { flex: 1, gap: hp(1) },
  referralRowLabel: { fontSize: FS.sm, fontWeight: '700' },
  referralRowHint: { fontSize: FS.xs, lineHeight: FS.xs * 1.3 },
  referralRowCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(5),
    paddingHorizontal: wp(10),
    paddingVertical: hp(6),
    borderRadius: radius.md,
  },
  referralRowCodeText: { fontSize: FS.sm, fontWeight: '700', letterSpacing: 1.2 },
  profileMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(6), marginTop: hp(4), justifyContent: 'center' },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(8),
    paddingVertical: hp(3),
    borderRadius: radius.md,
    gap: wp(4),
  },
  categoryChipText: { fontSize: FS.xs, fontWeight: '600' },
  profileDescription: {
    fontSize: FS.sm,
    lineHeight: FS.sm * 1.5,
    textAlign: 'center',
    paddingHorizontal: wp(20),
    marginTop: hp(6),
    marginBottom: hp(10),
  },
  socialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: wp(8),
    marginTop: hp(10),
  },
  socialChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: wp(10),
    paddingVertical: hp(5),
    borderRadius: radius.md,
    gap: wp(5),
  },
  socialChipText: {
    fontSize: FS.xs,
    fontWeight: '600',
  },

  // Referral banner
  referralBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: hp(12),
    paddingVertical: hp(10),
    paddingHorizontal: wp(10),
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: wp(10),
  },
  referralIconBox: {
    width: ms(32),
    height: ms(32),
    borderRadius: ms(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralContent: { flex: 1, gap: hp(3) },
  referralCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
  },
  referralActiveLabel: {
    fontSize: FS.xs,
    fontWeight: '700',
  },
  referralCodeChip: {
    paddingHorizontal: wp(8),
    paddingVertical: hp(2),
    borderRadius: radius.sm,
  },
  referralCodeText: {
    fontSize: FS.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  referralHint: {
    fontSize: FS.xs - 1,
    lineHeight: (FS.xs - 1) * 1.4,
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

  // Plan inline (merged in profile card)
  planInline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: wp(8),
    marginTop: hp(8),
    marginBottom: hp(4),
    paddingHorizontal: wp(12),
    paddingVertical: hp(8),
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  planInlineSub: { fontSize: FS.xs, color: '#9CA3AF', marginTop: 2 },
  planInlineExpiry: { fontSize: FS.xs, fontWeight: '600' },

  // Plan card (legacy)
  planCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: wp(18),
    paddingVertical: hp(16),
    marginBottom: hp(16),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
    marginBottom: 10,
  },
  planBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  planBody: { gap: 6 },
  planTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  planMeta: { fontSize: 12, color: 'rgba(255,255,255,0.55)' },
  planExpiryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  planExpiry: { fontSize: 13, fontWeight: '600' },
  planDaysChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginTop: 4 },
  planDaysText: { fontSize: 12, fontWeight: '700' },
  planRenewBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#7C3AED12',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },
  planRenewText: { flex: 1, fontSize: 12, color: '#A78BFA', lineHeight: 18 },
  planSubFree: { fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 18 },
  freeLimitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  freeLimitText: {
    fontSize: 11,
    backgroundColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
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

  // Logo bottom sheet
  bottomSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  logoModalSheet: {
    borderTopLeftRadius: ms(24),
    borderTopRightRadius: ms(24),
    paddingTop: hp(14),
    paddingHorizontal: ms(24),
    paddingBottom: hp(36),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  sheetHandle: {
    width: ms(40),
    height: ms(4),
    borderRadius: ms(2),
    marginBottom: hp(20),
  },
  logoModalPreviewRow: {
    marginBottom: hp(16),
  },
  logoModalRing: {
    width: ms(100),
    height: ms(100),
    borderRadius: ms(50),
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoModalInner: {
    width: ms(94),
    height: ms(94),
    borderRadius: ms(47),
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoModalInitials: {
    fontSize: ms(32),
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 1,
  },
  logoModalTitle: {
    fontSize: FS.lg,
    fontWeight: '700',
    marginBottom: hp(6),
  },
  logoModalSubtitle: {
    fontSize: FS.sm,
    textAlign: 'center',
    marginBottom: hp(24),
    lineHeight: FS.sm * 1.5,
  },
  logoModalBtn: {
    width: '100%',
    borderRadius: ms(14),
    overflow: 'hidden',
    marginBottom: hp(10),
  },
  logoModalBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
    paddingVertical: hp(15),
  },
  logoModalBtnText: {
    color: '#fff',
    fontSize: FS.md,
    fontWeight: '700',
  },
  logoModalOutlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: ms(8),
    width: '100%',
    paddingVertical: hp(14),
    borderRadius: ms(14),
    borderWidth: 1,
    marginBottom: hp(10),
  },
  logoModalOutlineBtnText: {
    fontSize: FS.md,
    fontWeight: '600',
  },

  // Language modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: ms(24),
  },
  modalIconCircle: {
    width: ms(56),
    height: ms(56),
    borderRadius: ms(28),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: hp(12),
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
  langModalTitle: { fontSize: ms(18), fontWeight: '700', marginBottom: hp(8) },
  langModalDesc: { fontSize: ms(13), textAlign: 'center', marginBottom: hp(16) },
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
  langFlag: { fontSize: ms(22) },
  langOptionText: { flex: 1, fontSize: FS.md, fontWeight: '600' },
  langCheck: {
    width: ms(22),
    height: ms(22),
    borderRadius: ms(11),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
