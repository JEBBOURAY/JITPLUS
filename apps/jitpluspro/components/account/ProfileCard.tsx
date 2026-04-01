import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Pressable, Platform } from 'react-native';
import { Camera, Lock, Crown, Zap, Calendar, AlertCircle, Gift, ChevronRight, Copy, Bell } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, palette } from '@/contexts/ThemeContext';
import MerchantLogo from '@/components/MerchantLogo';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import type { Router } from 'expo-router';
import type { Merchant } from '@/types';

interface Props {
  theme: ReturnType<typeof useTheme>;
  t: (key: string, opts?: Record<string, unknown>) => string;
  locale: string;
  merchant: Merchant | null;
  uploadIsPending: boolean;
  onLogoPress: () => void;
  referralCode: string | null;
  categoryLabel: string;
  router: Router;
  unreadCount?: number;
  onNotifPress?: () => void;
}

export default function ProfileCard({
  theme, t, locale, merchant, uploadIsPending, onLogoPress, referralCode, categoryLabel, router,
  unreadCount = 0, onNotifPress,
}: Props) {
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

  const initials = merchant?.nom
    ? merchant.nom.split(' ').map((w: string) => w.charAt(0)).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <View style={[styles.profileCard, { backgroundColor: theme.bgCard }]}>
      {/* -- Notification Bell (top-right) ---------- */}
      {onNotifPress && (
        <TouchableOpacity onPress={onNotifPress} activeOpacity={0.7} style={styles.notifBell}>
          <Bell size={ms(20)} color={theme.primary} strokeWidth={1.8} />
          {unreadCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* -- Logo ---------------------------------- */}
      <View style={styles.profileCardAvatarRow}>
        <TouchableOpacity onPress={onLogoPress} activeOpacity={0.85} style={styles.avatarRingWrapper}>
          <LinearGradient
            colors={['#A78BFA', '#7C3AED', '#1F2937']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarRing}
          >
            {uploadIsPending ? (
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
            colors={isPremium ? ['#A78BFA', '#7C3AED'] : ['#6B7280', '#4B5563']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarCameraBadge}
          >
            {isPremium
              ? <Camera size={ms(11)} color="#fff" strokeWidth={2.5} />
              : <Lock size={ms(11)} color="#fff" strokeWidth={2.5} />
            }
          </LinearGradient>
        </TouchableOpacity>
        <Text style={[styles.profileName, { color: theme.text }]}>{merchant?.nom}</Text>
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
        <LinearGradient
          colors={isPremium ? ['#7C3AED', '#5B21B6'] : [`${theme.textMuted}20`, `${theme.textMuted}10`]}
          style={styles.planRowIcon}
        >
          {isPremium
            ? (isTrial ? <Zap size={ms(16)} color="#fff" strokeWidth={2} /> : <Crown size={ms(16)} color="#FCD34D" strokeWidth={2} />)
            : <Zap size={ms(16)} color={theme.textMuted} strokeWidth={2} />}
        </LinearGradient>

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
  );
}

const styles = StyleSheet.create({
  profileCard: {
    borderRadius: radius.xl,
    marginBottom: hp(16),
    paddingBottom: hp(16),
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  profileCardAvatarRow: {
    alignItems: 'center',
    marginTop: hp(16),
    marginBottom: hp(2),
    gap: hp(8),
  },
  avatarRingWrapper: { position: 'relative' },
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
    zIndex: 5,
  },
  avatarText: { fontSize: FS.xl, fontWeight: '700', color: '#fff', letterSpacing: 1 },
  profileName: { fontSize: FS.lg, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' },
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
  notifBell: {
    position: 'absolute',
    top: hp(14),
    right: wp(14),
    zIndex: 10,
    width: ms(38),
    height: ms(38),
    borderRadius: ms(19),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED12',
  },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
});
