import React, { useState, useEffect } from 'react';
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
import api from '@/services/api';
import * as ImagePicker from 'expo-image-picker';
import { getErrorMessage } from '@/utils/error';
import MerchantLogo from '@/components/MerchantLogo';
import { useReferral } from '@/hooks/useQueryHooks';
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

export default function AccountScreen() {
  const { merchant, loading, signOut, isTeamMember, teamMember, loadProfile, updateMerchant } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const { isFocused, focusStyle } = useFocusFade();

  // Collapsible section states
  const [storeExpanded, setStoreExpanded] = useState(false);
  const [prefExpanded, setPrefExpanded] = useState(false);
  const [compteExpanded, setCompteExpanded] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
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
      setUploadingLogo(true);
      const asset = result.assets[0];
      const formData = new FormData();
      const ext = (asset.uri.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const safeName = (merchant?.nom ?? 'commerce')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
      const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const fileName = `logo_${safeName}_${dateStr}.${ext}`;
      formData.append('file', { uri: asset.uri, name: fileName, type: asset.mimeType ?? `image/${ext}` } as any);
      const res = await api.post('/merchant/upload-image?type=logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      updateMerchant({ ...merchant!, logoUrl: res.data.url });
    } catch (err) {
      Alert.alert('Erreur', getErrorMessage(err, "Impossible d'envoyer le logo"));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleLogoPress = () => setShowLogoModal(true);

  const handleDeleteLogo = async () => {
    setShowLogoModal(false);
    try {
      await api.patch('/merchant/profile', { logoUrl: null });
      updateMerchant({ ...merchant!, logoUrl: undefined });
    } catch (err) {
      Alert.alert('Erreur', getErrorMessage(err, 'Impossible de supprimer le logo'));
    }
  };
  const { data: referralData } = useReferral();
  const referralCode = referralData?.referralCode ?? null;

  useEffect(() => {
    if (isFocused) {
      loadProfile().catch(() => {});
    }
  }, [isFocused]);
  const { label: categoryLabel } = useCategoryMetadata(merchant?.categorie);
  const { locale, setLocale, t } = useLanguage();
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // ── Plan helpers ─────────────────────────────────────
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
    Alert.alert(t('account.signOut'), t('account.signOut'), [
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
        {/* ── Profile Card ───────────────────────────── */}
        <FadeInView delay={100}>
          <View style={[styles.profileCard, { backgroundColor: theme.bgCard }]}>
            {/* ── Logo ────────────────────────────────── */}
            <View style={styles.profileCardAvatarRow}>
              <TouchableOpacity onPress={handleLogoPress} activeOpacity={0.85} style={styles.avatarRingWrapper}>
                <LinearGradient
                  colors={['#A78BFA', '#7C3AED', '#1F2937']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarRing}
                >
                  {uploadingLogo ? (
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

            {/* ── Plan Row ────────────────────────────── */}
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

            {/* ── Referral Code ───────────────────────── */}
            {referralCode && (
              <Pressable
                onPress={() => router.push('/referral' as any)}
                style={({ pressed }) => [
                  styles.referralRow,
                  { backgroundColor: `${palette.violet}06`, borderColor: `${palette.violet}18` },
                  pressed && { opacity: 0.75 },
                ]}
              >
                <LinearGradient
                  colors={[`${palette.violet}25`, `${palette.violet}10`]}
                  style={styles.referralRowIcon}
                >
                  <Gift size={ms(16)} color={palette.violet} strokeWidth={1.8} />
                </LinearGradient>
                <View style={styles.referralRowContent}>
                  <Text style={[styles.referralRowLabel, { color: theme.text }]}>
                    {t('account.referralActive')}
                  </Text>
                  <Text style={[styles.referralRowHint, { color: theme.textMuted }]}>
                    {t('account.referralInviteHint')}
                  </Text>
                </View>
                <View style={[styles.referralRowCode, { backgroundColor: `${palette.violet}14` }]}>
                  <Text style={[styles.referralRowCodeText, { color: palette.violet }]}>
                    {referralCode}
                  </Text>
                  <Copy size={ms(12)} color={palette.violet} strokeWidth={2} />
                </View>
              </Pressable>
            )}
          </View>
        </FadeInView>

        {/* ── Team Member Banner ─────────────────────── */}
        {isTeamMember && teamMember && (
          <FadeInView delay={250}>
            <View style={[styles.teamBanner, { backgroundColor: `${palette.charbon}12`, borderColor: `${palette.charbon}30` }]}>
              <View style={[styles.infoIconBox, { backgroundColor: `${palette.violet}15` }]}>
                <Shield size={ms(16)} color={palette.violet} strokeWidth={1.5} />
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

        {/* ── Ma Boutique Section ────────────────────── */}
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
                <Pressable
                  onPress={() => router.push('/edit-profile')}
                  android_ripple={{ color: `${palette.charbon}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomColor: theme.borderLight },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.violet}12` }]}>
                    <Edit3 size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{t('account.editStore')}</Text>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('account.editStoreSubtitle')}</Text>
                  </View>
                </Pressable>
                {/* Manage Stores */}
                <Pressable
                  onPress={() => router.push('/stores')}
                  android_ripple={{ color: `${palette.charbon}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomColor: theme.borderLight },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.violet}12` }]}>
                    <StoreIcon size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{t('account.manageStores')}</Text>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('account.manageStoresSubtitle')}</Text>
                  </View>
                </Pressable>
                {/* Settings */}
                <Pressable
                  onPress={() => router.push('/settings')}
                  android_ripple={{ color: `${palette.charbon}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomColor: theme.borderLight },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.violet}12` }]}>
                    <Settings size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{t('account.settingsTitle')}</Text>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('account.settingsSubtitle')}</Text>
                  </View>
                </Pressable>
                {/* Dashboard */}
                <Pressable
                  onPress={() => router.push('/dashboard')}
                  android_ripple={{ color: `${palette.violet}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomColor: theme.borderLight },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.violet}12` }]}>
                    <BarChart3 size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{t('account.dashboard')}</Text>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('account.dashboardSubtitle')}</Text>
                  </View>
                </Pressable>
                {/* Team */}
                <Pressable
                  onPress={() => router.push('/team-management' as any)}
                  android_ripple={{ color: `${palette.charbon}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomColor: theme.borderLight },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.violet}12` }]}>
                    <Users size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{t('account.team')}</Text>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('account.teamSubtitle')}</Text>
                  </View>
                </Pressable>
                {/* Referral */}
                <Pressable
                  onPress={() => router.push('/referral' as any)}
                  android_ripple={{ color: `${palette.charbon}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomWidth: 0 },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.violet}12` }]}>
                    <Gift size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{t('referral.menuTitle')}</Text>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('referral.menuSubtitle')}</Text>
                  </View>
                </Pressable>
              </View>
            )}
          </FadeInView>
        )}

        {/* ── Preferences Section ────────────────────── */}
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
              <Pressable
                onPress={theme.toggleDarkMode}
                android_ripple={{ color: `${palette.violet}10` }}
                style={({ pressed }) => [
                  styles.infoRow, { borderBottomColor: theme.borderLight },
                  pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.infoIconBox, { backgroundColor: `${palette.violet}15` }]}>
                  <Moon size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={[styles.infoValue, { color: theme.text }]}>{t('account.darkMode')}</Text>
                  <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                    {theme.isDark ? t('account.darkModeOn') : t('account.darkModeOff')}
                  </Text>
                </View>
                <View style={[styles.toggle, theme.isDark ? styles.toggleOn : { backgroundColor: theme.borderLight }]}>
                  <View style={[styles.toggleKnob, theme.isDark && styles.toggleKnobOn]} />
                </View>
              </Pressable>
              {/* Language */}
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
                  <Text style={[styles.infoValue, { color: theme.text }]}>{t('account.language')}</Text>
                  <Text style={[styles.infoLabel, { color: theme.textMuted }]}>
                    {t('account.chooseLanguageDesc')}
                  </Text>
                </View>
                <Text style={[styles.langBadge, { color: theme.primary, backgroundColor: `${theme.primary}15` }]}>
                  {LANGUAGES.find(l => l.code === locale)?.label ?? locale}
                </Text>
              </Pressable>
            </View>
          )}
        </FadeInView>

        {/* ── Compte Section ──────────────────────────── */}
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
              <Pressable
                onPress={() => router.push('/legal' as any)}
                android_ripple={{ color: `${palette.violet}10` }}
                style={({ pressed }) => [
                  styles.infoRow, { borderBottomColor: theme.borderLight },
                  pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.infoIconBox, { backgroundColor: `${palette.violet}12` }]}>
                  <Shield size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={[styles.infoValue, { color: theme.text }]}>{t('account.legalSection')}</Text>
                  <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('account.legalSubtitle')}</Text>
                </View>
              </Pressable>
              {/* Security / Password */}
              {!isTeamMember && (
                <Pressable
                  onPress={() => router.push('/security')}
                  android_ripple={{ color: `${palette.charbon}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomColor: theme.borderLight },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.violet}15` }]}>
                    <Lock size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{t('account.security')}</Text>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('account.securitySubtitle')}</Text>
                  </View>
                </Pressable>
              )}
              {/* Devices */}
              {!isTeamMember && (
                <Pressable
                  onPress={() => router.push('/security?tab=devices')}
                  android_ripple={{ color: `${palette.charbon}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomColor: theme.borderLight },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.violet}12` }]}>
                    <Smartphone size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{t('account.stores')}</Text>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('account.storesSubtitle')}</Text>
                  </View>
                </Pressable>
              )}
              {/* Contact support */}
              <Pressable
                onPress={() => Linking.openURL('https://wa.me/33767471397?text=Bonjour%2C%20j%27ai%20besoin%20d%27aide%20avec%20JitPlus%20Pro')}
                android_ripple={{ color: '#25D36610' }}
                style={({ pressed }) => [
                  styles.infoRow, { borderBottomColor: theme.borderLight },
                  pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.infoIconBox, { backgroundColor: `${palette.violet}15` }]}>
                  <MessageCircle size={ms(16)} color={palette.violet} strokeWidth={1.5} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={[styles.infoValue, { color: theme.text }]}>{'Contacter le support'}</Text>
                </View>
              </Pressable>
              {/* Logout */}
              <Pressable
                onPress={handleSignOut}
                android_ripple={{ color: `${theme.danger}10` }}
                style={({ pressed }) => [
                  styles.infoRow, { borderBottomColor: theme.borderLight },
                  pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                ]}
              >
                <View style={[styles.infoIconBox, { backgroundColor: `${theme.danger}12` }]}>
                  <LogOut size={ms(16)} color={theme.danger} strokeWidth={1.5} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={[styles.infoValue, { color: theme.danger }]}>{t('account.signOut')}</Text>
                </View>
              </Pressable>
              {/* Delete account */}
              {!isTeamMember && (
                <Pressable
                  onPress={() => router.push('/security?tab=delete')}
                  android_ripple={{ color: `${theme.danger}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomWidth: 0 },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${theme.danger}12` }]}>
                    <Trash2 size={ms(16)} color={theme.danger} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoValue, { color: theme.danger }]}>{t('account.deleteAccount')}</Text>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('account.deleteAccountMsg')}</Text>
                  </View>
                  <AlertTriangle size={ms(14)} color={theme.danger} strokeWidth={1.5} />
                </Pressable>
              )}
            </View>
          )}
        </FadeInView>

        {/* ── Logo Footer ────────────────────────────── */}
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

      {/* ── Logo Edit Bottom Sheet ──────────────────── */}
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
                {uploadingLogo ? (
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

            <Text style={[styles.logoModalTitle, { color: theme.text }]}>Photo de profil</Text>
            <Text style={[styles.logoModalSubtitle, { color: theme.textMuted }]}>
              {merchant?.logoUrl
                ? 'Modifiez ou supprimez votre photo de profil'
                : 'Ajoutez un logo pour personnaliser votre commerce'}
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
                  {merchant?.logoUrl ? 'Changer la photo' : 'Ajouter une photo'}
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
                <Text style={[styles.logoModalOutlineBtnText, { color: '#EF4444' }]}>Supprimer la photo</Text>
              </TouchableOpacity>
            )}

            {/* Cancel */}
            <TouchableOpacity
              style={[styles.logoModalOutlineBtn, { borderColor: theme.borderLight }]}
              activeOpacity={0.7}
              onPress={() => setShowLogoModal(false)}
            >
              <Text style={[styles.logoModalOutlineBtnText, { color: theme.textMuted }]}>Annuler</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Language Selector Modal ─────────────────── */}
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
                          'Red\u00e9marrez l\'application pour appliquer le changement de direction.',
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
