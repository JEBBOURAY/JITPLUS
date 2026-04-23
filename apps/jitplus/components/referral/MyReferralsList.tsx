import React from 'react';
import { View, Text } from 'react-native';
import { Users, Gift, CheckCircle, Clock } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { referralStyles as styles } from './referralStyles';
import type { ThemeColors } from '@/contexts/ThemeContext';
import type { ClientReferralStats } from '@/types';

interface MyReferralsListProps {
  stats: ClientReferralStats;
  isRTL: boolean;
  theme: ThemeColors;
  t: (key: string, variables?: Record<string, string | number>) => string;
  formatDate: (dateStr: string | null | undefined) => string;
}

export default function MyReferralsList({ stats, isRTL, theme, t, formatDate }: MyReferralsListProps) {
  return (
    <View style={styles.listSection}>
      <View style={[styles.listHeader, isRTL && styles.listHeaderRTL]}>
        <View style={{ width: ms(36), height: ms(36), borderRadius: ms(12), backgroundColor: `${palette.gold}15`, alignItems: 'center', justifyContent: 'center' }}>
          <Users size={ms(16)} color={palette.gold} strokeWidth={1.5} />
        </View>
        <Text style={[styles.listTitle, { color: theme.text }]}>
          {t('referral.referralList')} ({stats.referredCount ?? 0})
        </Text>
      </View>
      {!stats.referrals?.length ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.bgCard }]}>
          <View style={{ width: ms(88), height: ms(88), borderRadius: ms(24), backgroundColor: `${palette.gold}15`, alignItems: 'center', justifyContent: 'center' }}>
            <Gift size={ms(36)} color={palette.gold} strokeWidth={1.5} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>{t('referral.noReferrals')}</Text>
          <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>{t('referral.noReferralsDesc')}</Text>
        </View>
      ) : (
        <View style={[styles.listCard, { backgroundColor: theme.bgCard }]}>
          {(stats.referrals ?? []).map((ref, idx, arr) => (
            <View key={ref.id} style={[styles.referralRow, isRTL && styles.referralRowRTL, idx === arr.length - 1 && { borderBottomWidth: 0 }, { borderBottomColor: theme.border }]}>
              <View style={[styles.statusDot, { backgroundColor: ref.status === 'VALIDATED' ? palette.emerald : palette.gold }]} />
              <View style={styles.referralInfo}>
                <Text style={[styles.referralName, { color: theme.text }, isRTL && styles.textRTL]}>{ref.merchantName}</Text>
                <Text style={[styles.referralMeta, { color: theme.textMuted }, isRTL && styles.textRTL]}>
                  {ref.status === 'VALIDATED' && ref.validatedAt ? t('referral.validatedOn', { date: formatDate(ref.validatedAt) }) : t('referral.referredOn', { date: formatDate(ref.createdAt) })}
                </Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: ref.status === 'VALIDATED' ? `${palette.emerald}15` : `${palette.gold}15` }]}>
                {ref.status === 'VALIDATED' ? <CheckCircle size={ms(12)} color={palette.emerald} strokeWidth={2} /> : <Clock size={ms(12)} color={palette.gold} strokeWidth={2} />}
                <Text style={[styles.statusText, { color: ref.status === 'VALIDATED' ? palette.emerald : palette.gold }]}>
                  {ref.status === 'VALIDATED' ? t('referral.statusValidated') : t('referral.statusPending')}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}