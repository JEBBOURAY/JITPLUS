import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Clock, ChevronRight } from 'lucide-react-native';
import { JitPremium } from '@/components/icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Card } from '@/components/ui/Card';
import { palette } from '@/contexts/ThemeContext';
import { ProBadge } from '@/components/ui/ProBadge';
import { font, icon } from '@/constants/design';
import { useDir } from '@/hooks/useDir';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import type { ImperativeRouter } from 'expo-router';
import type { Merchant } from '@/types';
import { usePlanStatus } from '@/hooks/usePlanStatus';

interface Props {
  t: (key: string, opts?: Record<string, unknown>) => string;
  locale: string;
  merchant: Merchant | null;
  router: ImperativeRouter;
  /** Team members can view plan status but must not manage billing. */
  isTeamMember?: boolean;
}

/** Current Pro plan and trial progress. Billing actions remain owner-only. */
export default React.memo(function TrialCard({ t, locale, merchant, router, isTeamMember = false }: Props) {
  const { isPremium, isAdminPremium, planExpiresAt, daysRemaining, isTrial, trialProgress, trialTotalDays } = usePlanStatus(merchant);

  const goToPlan = useCallback(() => router.push('/plan'), [router]);
  const dir = useDir();

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
    <Card style={styles.card}>
      <LinearGradient
        colors={['#0f031e', '#1a0533']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.topRow, { flexDirection: dir.row }]}>
        <View style={[styles.titleRow, { flexDirection: dir.row }]}>
          {isTrial ? (
            <Clock size={ms(15)} color="#fff" strokeWidth={icon.stroke} />
          ) : (
            <JitPremium size={ms(15)} color={palette.gold} strokeWidth={icon.stroke} />
          )}
          <Text style={styles.title} maxFontSizeMultiplier={1.3} numberOfLines={1}>
            {isTrial ? t('account.planTrial') : t('account.planHeroTitlePro')}
          </Text>
        </View>
        <ProBadge variant="goldGradient" style={styles.badge} />
      </View>

      {isAdminPremium && !planExpiresAt ? (
        <Text style={[styles.expiryText, { textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>{t('account.planByAdmin')}</Text>
      ) : planExpiresAt ? (
        <Text style={[styles.expiryText, { textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3} numberOfLines={1}>
          {isTrial
            ? t('account.planTrialExpiry', { date: formatDate(planExpiresAt) })
            : t('account.planExpiry', { date: formatDate(planExpiresAt) })}
        </Text>
      ) : null}

      {/* Fills with elapsed time: 0 = fresh trial, 1 = expired. */}
      {isTrial && trialProgress !== null && (
        <View style={[styles.progressTrack, dir.isRTL && styles.progressTrackRtl]} accessible accessibilityRole="progressbar" accessibilityLabel={t('account.planTrial')} accessibilityValue={{ min: 0, max: 100, now: Math.round(trialProgress * 100) }}>
          <LinearGradient
            colors={[palette.gold, palette.violet]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.progressFill, { width: `${Math.round(trialProgress * 100)}%` }]}
          />
        </View>
      )}

      {daysRemaining !== null && daysRemaining > 0 && (
        <Text style={[styles.daysText, { textAlign: dir.textAlign }]} maxFontSizeMultiplier={1.3}>
          {isTrial
            ? t(daysRemaining === 1 ? 'account.planTrialDaysLeftTotal_one' : 'account.planTrialDaysLeftTotal_other', { count: daysRemaining, total: trialTotalDays ?? 30 })
            : t(daysRemaining === 1 ? 'account.planDaysLeft_one' : 'account.planDaysLeft_other', { count: daysRemaining })}
        </Text>
      )}

      {/* Team members may view plan status but must not reach billing. */}
      {!isTeamMember && (
        <TouchableOpacity
          onPress={goToPlan}
          activeOpacity={0.85}
          style={[styles.cta, { flexDirection: dir.row }]}
          accessibilityRole="button"
          accessibilityLabel={t('account.viewPlans')}
        >
          <Text style={styles.ctaText} maxFontSizeMultiplier={1.2} numberOfLines={1}>
            {t('account.viewPlans')}
          </Text>
          <ChevronRight size={ms(14)} color="#fff" strokeWidth={icon.strokeSmall} style={dir.flip} />
        </TouchableOpacity>
      )}
    </Card>
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
    fontSize: ms(14),
    color: '#fff',
    fontFamily: font.bold,
    flexShrink: 1,
  },
  badge: {
    alignSelf: 'center',
  },
  expiryText: {
    fontSize: FS.xs,
    color: 'rgba(255,255,255,0.55)',
    marginTop: hp(5),
    fontFamily: font.regular,
  },
  progressTrack: {
    height: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: hp(14),
    overflow: 'hidden',
  },
  progressTrackRtl: { flexDirection: 'row-reverse' },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  daysText: {
    fontSize: ms(12),
    color: 'rgba(255,255,255,0.75)',
    marginTop: hp(8),
    fontFamily: font.regular,
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
    fontSize: ms(13),
    fontFamily: font.semibold,
  },
});
