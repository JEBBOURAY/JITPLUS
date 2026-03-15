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
import { getServerBaseUrl } from '@/services/api';
import MerchantLogo from '@/components/MerchantLogo';
import {
  Star,
  MapPin,
  LogOut,
  ChevronDown,
  User,
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
  Crown,
  Zap,
  Calendar,
  AlertCircle,
  Gift,
  AlertTriangle,
  MessageCircle,
  Instagram,
} from 'lucide-react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useRouter } from 'expo-router';
import MerchantCategoryIcon, { useCategoryMetadata } from '@/components/MerchantCategoryIcon';
import { LinearGradient } from 'expo-linear-gradient';
import { DEFAULT_CURRENCY } from '@/config/currency';
import { useFocusFade } from '@/hooks/useFocusFade';
import { useLanguage, LANGUAGES } from '@/contexts/LanguageContext';
import Constants from 'expo-constants';
import FadeInView from '@/components/FadeInView';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';

export default function AccountScreen() {
  const { merchant, loading, signOut, isTeamMember, teamMember, loadProfile } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const { isFocused, focusStyle } = useFocusFade();

  // Collapsible section states
  const [storeExpanded, setStoreExpanded] = useState(false);
  const [prefExpanded, setPrefExpanded] = useState(false);
  const [compteExpanded, setCompteExpanded] = useState(false);

  useEffect(() => {
    if (isFocused) loadProfile().catch(() => {});
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
            <View style={styles.profileRow}>
              {merchant?.logoUrl ? (
                <MerchantLogo logoUrl={merchant.logoUrl} style={styles.avatarImage} />
              ) : (
                <LinearGradient
                  colors={[palette.charbon, palette.violet]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarGradient}
                >
                  <Text style={styles.avatarText}>{initials}</Text>
                </LinearGradient>
              )}
              <View style={styles.profileInfo}>
                <Text style={[styles.profileName, { color: theme.text }]}>{merchant.nom}</Text>
                <View style={styles.profileMeta}>
                  <View style={[styles.categoryChip, { backgroundColor: `${palette.charbon}12` }]}>
                    <MerchantCategoryIcon category={merchant?.categorie} size={12} color={palette.charbon} strokeWidth={1.5} />
                    <Text style={[styles.categoryChipText, { color: palette.charbon }]}>{categoryLabel}</Text>
                  </View>
                  {merchant?.ville && (
                    <View style={[styles.categoryChip, { backgroundColor: `${palette.charbon}08` }]}>
                      <MapPin size={11} color={theme.textMuted} strokeWidth={1.5} />
                      <Text style={[styles.categoryChipText, { color: theme.textMuted }]}>{merchant.ville}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Description */}
            {!!merchant.description && (
              <Text style={[styles.profileDescription, { color: theme.textMuted }]} numberOfLines={3}>
                {merchant.description}
              </Text>
            )}

            {/* Social links */}
            {!!(merchant.socialLinks?.instagram || merchant.socialLinks?.tiktok) && (
              <View style={styles.socialRow}>
                {!!merchant.socialLinks?.instagram && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.socialChip,
                      { backgroundColor: '#fce4ec' },
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => {
                      const username = merchant.socialLinks!.instagram!.replace(/^@/, '');
                      if (!/^[a-zA-Z0-9_.]{1,30}$/.test(username)) return;
                      Linking.openURL(`https://www.instagram.com/${encodeURIComponent(username)}`);
                    }}
                  >
                    <Instagram size={14} color="#E1306C" strokeWidth={1.5} />
                    <Text style={[styles.socialChipText, { color: '#E1306C' }]}>
                      @{merchant.socialLinks.instagram.replace(/^@/, '')}
                    </Text>
                  </Pressable>
                )}
                {!!merchant.socialLinks?.tiktok && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.socialChip,
                      { backgroundColor: '#f0f0f0' },
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => {
                      const username = merchant.socialLinks!.tiktok!.replace(/^@/, '');
                      if (!/^[a-zA-Z0-9_.]{1,30}$/.test(username)) return;
                      Linking.openURL(`https://www.tiktok.com/@${encodeURIComponent(username)}`);
                    }}
                  >
                    <Globe size={14} color="#000" strokeWidth={1.5} />
                    <Text style={[styles.socialChipText, { color: '#000' }]}>
                      @{merchant.socialLinks.tiktok.replace(/^@/, '')}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </FadeInView>

        {/* ── Plan Card ──────────────────────────────── */}
        <FadeInView delay={200}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => router.push('/plan')}
            style={[
              styles.planCard,
              isPremium
                ? { backgroundColor: '#1a0530', borderColor: '#7C3AED50' }
                : { backgroundColor: theme.bgCard, borderColor: theme.borderLight },
            ]}
          >
            {isPremium ? (
              <>
                <View style={[styles.planBadge, { backgroundColor: isTrial ? '#7C3AED' : '#374151' }]}>
                  {isTrial ? <Zap size={14} color="#fff" strokeWidth={1.5} /> : <Crown size={14} color="#fff" strokeWidth={1.5} />}
                  <Text style={styles.planBadgeText}>{isTrial ? t('account.planTrial').toUpperCase() : 'PREMIUM'}</Text>
                </View>
                {(isAdminPremium && !planExpiresAt) ? (
                  <View style={styles.planBody}>
                    <Text style={styles.planTitle}>{t('account.planPremium')}</Text>
                    <Text style={styles.planSubFree}>{t('account.planByAdmin')}</Text>
                  </View>
                ) : isTrial ? (
                  <View style={styles.planBody}>
                    <Text style={styles.planTitle}>{t('account.planTrial')}</Text>
                    <Text style={[styles.planMeta, { color: '#9CA3AF', marginBottom: 8 }]}>{t('account.planTrialDesc')}</Text>
                    {planExpiresAt && (
                      <View style={styles.planExpiryRow}>
                        <Calendar size={13} color={planUrgency === 'expired' || planUrgency === 'urgent' ? '#f87171' : planUrgency === 'soon' ? '#fbbf24' : '#9CA3AF'} />
                        <Text style={[styles.planExpiry, planUrgency === 'expired' || planUrgency === 'urgent' ? { color: '#f87171' } : planUrgency === 'soon' ? { color: '#fbbf24' } : { color: '#9CA3AF' }]}>
                          {planUrgency === 'expired' ? t('account.planTrialExpired', { date: formatDate(planExpiresAt) }) : t('account.planTrialExpiry', { date: formatDate(planExpiresAt) })}
                        </Text>
                      </View>
                    )}
                    {daysRemaining !== null && daysRemaining > 0 && (
                      <View style={[styles.planDaysChip, planUrgency === 'urgent' ? { backgroundColor: '#f8717120' } : planUrgency === 'soon' ? { backgroundColor: '#fbbf2420' } : { backgroundColor: '#37415130' }]}>
                        <Text style={[styles.planDaysText, planUrgency === 'urgent' ? { color: '#f87171' } : planUrgency === 'soon' ? { color: '#fbbf24' } : { color: '#9CA3AF' }]}>
                          {t('account.planTrialDaysLeft', { count: daysRemaining })}
                        </Text>
                      </View>
                    )}
                    {(planUrgency === 'expired' || planUrgency === 'urgent' || planUrgency === 'soon') && (
                      <View style={styles.planRenewBanner}>
                        <AlertCircle size={14} color="#fbbf24" />
                        <Text style={styles.planRenewText}>{planUrgency === 'expired' ? t('account.planTrialRenewExpired') : t('account.planTrialRenewUrgent')}</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.planBody}>
                    <Text style={styles.planTitle}>{t('account.planPremium')}</Text>
                    {trialStartedAt && <Text style={styles.planMeta}>{t('account.planActiveSince', { date: formatDate(trialStartedAt) })}</Text>}
                    {planExpiresAt && (
                      <View style={styles.planExpiryRow}>
                        <Calendar size={13} color={planUrgency === 'expired' || planUrgency === 'urgent' ? '#f87171' : planUrgency === 'soon' ? '#fbbf24' : '#9CA3AF'} />
                        <Text style={[styles.planExpiry, planUrgency === 'expired' || planUrgency === 'urgent' ? { color: '#f87171' } : planUrgency === 'soon' ? { color: '#fbbf24' } : { color: '#9CA3AF' }]}>
                          {planUrgency === 'expired' ? t('account.planExpired', { date: formatDate(planExpiresAt) }) : t('account.planExpiry', { date: formatDate(planExpiresAt) })}
                        </Text>
                      </View>
                    )}
                    {daysRemaining !== null && daysRemaining > 0 && (
                      <View style={[styles.planDaysChip, planUrgency === 'urgent' ? { backgroundColor: '#f8717120' } : planUrgency === 'soon' ? { backgroundColor: '#fbbf2420' } : { backgroundColor: '#37415125' }]}>
                        <Text style={[styles.planDaysText, planUrgency === 'urgent' ? { color: '#f87171' } : planUrgency === 'soon' ? { color: '#fbbf24' } : { color: '#9CA3AF' }]}>
                          {t('account.planDaysLeft', { count: daysRemaining })}
                        </Text>
                      </View>
                    )}
                    {(planUrgency === 'expired' || planUrgency === 'urgent' || planUrgency === 'soon') && (
                      <View style={styles.planRenewBanner}>
                        <AlertCircle size={14} color="#fbbf24" />
                        <Text style={styles.planRenewText}>{planUrgency === 'expired' ? t('account.planRenewExpired') : t('account.planRenewUrgent')}</Text>
                      </View>
                    )}
                  </View>
                )}
              </>
            ) : (
              <>
                <View style={[styles.planBadge, { backgroundColor: theme.textMuted + '22' }]}>
                  <Zap size={14} color={theme.textMuted} strokeWidth={1.5} />
                  <Text style={[styles.planBadgeText, { color: theme.textMuted }]}>{t('account.planFree').toUpperCase()}</Text>
                </View>
                <View style={styles.planBody}>
                  <Text style={[styles.planTitle, { color: theme.text }]}>{t('account.planFree')}</Text>
                  <Text style={[styles.planSubFree, { color: theme.textMuted }]}>{t('account.planFreeDesc')}</Text>
                  <View style={styles.freeLimitRow}>
                    <Text style={[styles.freeLimitText, { color: theme.textMuted }]}>{t('account.freeLimitClients')}</Text>
                    <Text style={[styles.freeLimitText, { color: theme.textMuted }]}>{t('account.freeLimitMass')}</Text>
                    <Text style={[styles.freeLimitText, { color: theme.textMuted }]}>{t('account.freeLimitAnalytics')}</Text>
                  </View>
                </View>
              </>
            )}
          </TouchableOpacity>
        </FadeInView>

        {/* ── Team Member Banner ─────────────────────── */}
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
                {/* Edit store */}
                <Pressable
                  onPress={() => router.push('/edit-profile')}
                  android_ripple={{ color: `${palette.charbon}10` }}
                  style={({ pressed }) => [
                    styles.infoRow, { borderBottomColor: theme.borderLight },
                    pressed && Platform.OS === 'ios' && { opacity: 0.7 },
                  ]}
                >
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.charbon}12` }]}>
                    <User size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
                  </View>
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoValue, { color: theme.text }]}>{t('account.editStore')}</Text>
                    <Text style={[styles.infoLabel, { color: theme.textMuted }]}>{t('account.editStoreSubtitle')}</Text>
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
                  <View style={[styles.infoIconBox, { backgroundColor: `${theme.textSecondary}12` }]}>
                    <Settings size={ms(16)} color={theme.textSecondary} strokeWidth={1.5} />
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
                  <View style={[styles.infoIconBox, { backgroundColor: '#6B728012' }]}>
                    <Users size={ms(16)} color="#6B7280" strokeWidth={1.5} />
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
                  <View style={[styles.infoIconBox, { backgroundColor: `${palette.charbon}12` }]}>
                    <Gift size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
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
                <View style={[styles.infoIconBox, { backgroundColor: `${palette.charbon}15` }]}>
                  <Moon size={ms(16)} color={palette.charbon} strokeWidth={1.5} />
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
                  <View style={[styles.infoIconBox, { backgroundColor: '#F59E0B15' }]}>
                    <Lock size={ms(16)} color="#F59E0B" strokeWidth={1.5} />
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
                  <View style={[styles.infoIconBox, { backgroundColor: '#6B728012' }]}>
                    <Smartphone size={ms(16)} color="#6B7280" strokeWidth={1.5} />
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
                <View style={[styles.infoIconBox, { backgroundColor: '#25D36615' }]}>
                  <MessageCircle size={ms(16)} color="#25D366" strokeWidth={1.5} />
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
    padding: wp(16),
    marginBottom: hp(16),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 2,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: wp(14) },
  avatarGradient: {
    width: ms(56),
    height: ms(56),
    borderRadius: ms(28),
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: ms(56),
    height: ms(56),
    borderRadius: ms(28),
    resizeMode: 'cover',
  },
  avatarText: { fontSize: FS.lg, fontWeight: '700', color: '#fff', letterSpacing: 1 },
  profileInfo: { flex: 1 },
  profileName: { fontSize: FS.lg, fontWeight: '700', letterSpacing: -0.3 },
  profileMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(6), marginTop: hp(6) },
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
    marginTop: hp(10),
    paddingTop: hp(10),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#00000010',
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

  // Plan card
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
    backgroundColor: '#fbbf2412',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },
  planRenewText: { flex: 1, fontSize: 12, color: '#fbbf24', lineHeight: 18 },
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
