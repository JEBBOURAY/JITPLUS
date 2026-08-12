import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Zap, ChevronRight, Crown } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { palette } from '@/contexts/ThemeContext';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import type { Router } from 'expo-router';
import type { Merchant } from '@/types';

interface Props {
  t: (key: string, opts?: Record<string, unknown>) => string;
  locale: string;
  merchant: Merchant | null;
  router: Router;
  /** Team members can view plan status but must not manage billing. */
  isTeamMember?: boolean;
}

/**
 * Standalone dark trial/plan card, mirrors the mockup's `.trial-card`.
 *
 * Design tokens (BRIEF-DESIGN.md):
 *  - dark gradient background (#0f031e → #1a0533)
 *  - PREMIUM gold badge (#FCD34D → #F59E0B) on charbon text
 *  - progress bar fills with ELAPSED time; caption reads "X jours restants sur N"
 *  - self-service CTA "Voir les plans" (translucent white on dark) → /plan
 *
 * Only rendered when the merchant is premium (trial or full). For FREE plan
 * the account screen doesn't render this card.
 */
export default React.memo(function TrialCard({ t, locale, merchant, router, isTeamMember = false }: Props) {
  const isPremium = merchant?.plan === 'PREMIUM';
  const isAdminPremium = merchant?.planActivatedByAdmin === true;

  const goToPlan = useCallback(() => router.push('/plan'), [router]);

  const { planExpiresAt, daysRemaining, isTrial, trialProgress, trialTotalDays } = useMemo(() => {
    const parseDate = (v: string | Date | null | undefined): Date | null => {
      if (!v) return null;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const pExp = parseDate(merchant?.planExpiresAt);
    const tStart = parseDate(merchant?.trialStartedAt);
    const days = pExp ? Math.max(0, Math.ceil((pExp.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : null;
    const trial = isPremium && !isAdminPremium && tStart !== null && pExp !== null;
    let progress: number | null = null;
    let totalDays: number | null = null;
    if (trial && tStart && pExp) {
      const total = pExp.getTime() - tStart.getTime();
      progress = total > 0 ? Math.min(1, Math.max(0, (Date.now() - tStart.getTime()) / total)) : 1;
      totalDays = Math.max(1, Math.round(total / (1000 * 60 * 60 * 24)));
    }
    return { planExpiresAt: pExp, daysRemaining: days, isTrial: trial, trialProgress: progress, trialTotalDays: totalDays };
  }, [merchant?.planExpiresAt, merchant?.trialStartedAt, isPremium, isAdminPremium]);

  const formatDate = useMemo(() => {
    const loc = locale === 'ar' ? 'ar-MA' : locale === 'en' ? 'en-US' : 'fr-FR';
    return (d: Date) => {
      try {
        return d.toLocaleDateString(loc, { day: '2-digit', month: 'long', year: 'numeric' });
      } catch {
        // Guard against engines/builds without full ICU support (matches plan.tsx).
        return d.toISOString().slice(0, 10);
      }
    };
  }, [locale]);

  if (!isPremium) return null;

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={['#0f031e', '#1a0533']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Top row: title + PREMIUM gold badge */}
      <View style={styles.topRow}>
        <View style={styles.titleRow}>
          {isTrial ? (
            <Zap size={ms(15)} color="#fff" strokeWidth={2} />
          ) : (
            <Crown size={ms(15)} color="#FCD34D" strokeWidth={2} />
          )}
          <Text style={styles.title} maxFontSizeMultiplier={1.3} numberOfLines={1}>
            {isTrial ? t('account.planTrial') : 'Premium'}
          </Text>
        </View>
        <LinearGradient
          colors={['#FCD34D', '#F59E0B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.badge}
        >
          <Text style={styles.badgeText} maxFontSizeMultiplier={1.2} numberOfLines={1}>
            {t('account.planPremiumBadge')}
          </Text>
        </LinearGradient>
      </View>

      {/* Expiry line — "Essai jusqu'au XX" (or "Plan par admin" when applicable) */}
      {isAdminPremium && !planExpiresAt ? (
        <Text style={styles.expiryText} maxFontSizeMultiplier={1.3}>{t('account.planByAdmin')}</Text>
      ) : planExpiresAt ? (
        <Text style={styles.expiryText} maxFontSizeMultiplier={1.3} numberOfLines={1}>
          {isTrial
            ? t('account.planTrialExpiry', { date: formatDate(planExpiresAt) })
            : t('account.planExpiry', { date: formatDate(planExpiresAt) })}
        </Text>
      ) : null}

      {/* Progress bar — fills with ELAPSED time (0 = fresh trial, 1 = expired) */}
      {isTrial && trialProgress !== null && (
        <View style={styles.progressTrack} accessible accessibilityRole="progressbar">
          <LinearGradient
            colors={['#FCD34D', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${Math.round(trialProgress * 100)}%` }]}
          />
        </View>
      )}

      {/* Days-remaining caption — explicit "X jours restants sur N" */}
      {daysRemaining !== null && daysRemaining > 0 && (
        <Text style={styles.daysText} maxFontSizeMultiplier={1.3}>
          {isTrial
            ? t('account.planTrialDaysLeftTotal', { count: daysRemaining, total: trialTotalDays ?? 30 })
            : t('account.planDaysLeft', { count: daysRemaining })}
        </Text>
      )}

      {/* Self-service CTA — routes to /plan, no manual contact required.
          Hidden for team members: they may view plan status but must not
          reach the billing/upgrade screen. */}
      {!isTeamMember && (
        <TouchableOpacity
          onPress={goToPlan}
          activeOpacity={0.85}
          style={styles.cta}
          accessibilityRole="button"
          accessibilityLabel={t('account.viewPlans')}
        >
          <Text style={styles.ctaText} maxFontSizeMultiplier={1.2} numberOfLines={1}>
            {t('account.viewPlans')}
          </Text>
          <ChevronRight size={ms(14)} color="#fff" strokeWidth={2.4} />
        </TouchableOpacity>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    padding: ms(18),
    marginBottom: hp(14),
    overflow: 'hidden',
    position: 'relative',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: wp(10),
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: wp(8),
    flexShrink: 1,
  },
  title: {
    fontSize: ms(13.5),
    color: '#fff',
    fontFamily: 'Lexend_700Bold',
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: wp(9),
    paddingVertical: hp(4),
    borderRadius: ms(8),
  },
  badgeText: {
    fontSize: ms(9.5),
    color: palette.charbon,
    letterSpacing: 0.3,
    fontFamily: 'Lexend_700Bold',
  },
  expiryText: {
    fontSize: FS.xs,
    color: 'rgba(255,255,255,0.55)',
    marginTop: hp(5),
  },
  progressTrack: {
    height: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: hp(14),
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  daysText: {
    fontSize: ms(11.5),
    color: 'rgba(255,255,255,0.75)',
    marginTop: hp(8),
  },
  cta: {
    marginTop: hp(14),
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.md,
    paddingVertical: hp(11),
    paddingHorizontal: wp(14),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: wp(6),
  },
  ctaText: {
    color: '#fff',
    fontSize: ms(12.5),
    fontFamily: 'Lexend_700Bold',
  },
});
