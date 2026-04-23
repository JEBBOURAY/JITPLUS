import React from 'react';
import { View, Text } from 'react-native';
import { Banknote, CheckCircle, AlertCircle, Clock } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { ms } from '@/utils/responsive';
import { referralStyles as styles } from './referralStyles';
import type { ThemeColors } from '@/contexts/ThemeContext';

interface PayoutHistoryListProps {
  payoutHistory: Array<{
    id: string; amount: number; status: string; method: string; createdAt: string;
  }>;
  isRTL: boolean;
  theme: ThemeColors;
  t: (key: string, variables?: Record<string, string | number>) => string;
  formatDate: (dateStr: string | null | undefined) => string;
}

export default function PayoutHistoryList({ payoutHistory, isRTL, theme, t, formatDate }: PayoutHistoryListProps) {
  if (payoutHistory.length === 0) return null;

  return (
    <View style={styles.listSection}>
      <View style={[styles.listHeader, isRTL && styles.listHeaderRTL]}>
        <View style={{ width: ms(36), height: ms(36), borderRadius: ms(12), backgroundColor: `${palette.gold}15`, alignItems: 'center', justifyContent: 'center' }}>
          <Banknote size={ms(16)} color={palette.gold} strokeWidth={1.5} />
        </View>
        <Text style={[styles.listTitle, { color: theme.text }]}>{t('referral.payoutHistory')}</Text>
      </View>
      <View style={[styles.listCard, { backgroundColor: theme.bgCard }]}>
        {payoutHistory.map((p, idx) => {
          const statusConfig: Record<string, { color: string; label: string }> = {
            PENDING: { color: palette.gold, label: t('referral.payoutStatusPending') },
            APPROVED: { color: palette.emerald, label: t('referral.payoutStatusApproved') },
            REJECTED: { color: palette.red, label: t('referral.payoutStatusRejected') },
            PAID: { color: palette.violet, label: t('referral.payoutStatusPaid') },
          };
          const sc = statusConfig[p.status] ?? { color: palette.gold, label: p.status };
          
          return (
            <View key={p.id} style={[styles.referralRow, isRTL && styles.referralRowRTL, idx === payoutHistory.length - 1 && { borderBottomWidth: 0 }, { borderBottomColor: theme.border }]}>
              <View style={[styles.statusDot, { backgroundColor: sc.color }]} />
              <View style={styles.referralInfo}>
                <Text style={[styles.referralName, { color: theme.text }, isRTL && styles.textRTL]}>
                  {t('referral.payoutAmountLabel', { amount: p.amount, method: p.method === 'CASH' ? t('referral.payoutMethodCash') : t('referral.payoutMethodTransfer') })}
                </Text>
                <Text style={[styles.referralMeta, { color: theme.textMuted }, isRTL && styles.textRTL]}>{formatDate(p.createdAt)}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: `${sc.color}15` }]}>
                {p.status === 'PAID' || p.status === 'APPROVED' ? <CheckCircle size={ms(12)} color={sc.color} strokeWidth={2} /> : p.status === 'REJECTED' ? <AlertCircle size={ms(12)} color={sc.color} strokeWidth={2} /> : <Clock size={ms(12)} color={sc.color} strokeWidth={2} />}
                <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}