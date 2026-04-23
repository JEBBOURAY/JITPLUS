import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Banknote } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { wp, hp, ms, fontSize as FS, radius } from '@/utils/responsive';
import { referralStyles as styles } from './referralStyles';

interface ReferralBalanceCardProps {
  balance: number;
  canRequestPayout: boolean;
  requestingPayout: boolean;
  onRequestPayout: () => void;
  t: (key: string) => string;
}

export default function ReferralBalanceCard({ balance, canRequestPayout, requestingPayout, onRequestPayout, t }: ReferralBalanceCardProps) {
  return (
    <View style={[styles.balanceCard, { backgroundColor: palette.violet }]}>
      <Text style={styles.balanceLabel}>{t('referral.balance')}</Text>
      <Text style={styles.balanceAmount}>{balance.toFixed(0)} {t('referral.balanceUnit')}</Text>
      <TouchableOpacity
        onPress={onRequestPayout}
        disabled={requestingPayout || !canRequestPayout}
        activeOpacity={canRequestPayout ? 0.7 : 1}
        style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
          backgroundColor: canRequestPayout ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
          paddingHorizontal: wp(16), paddingVertical: hp(8), borderRadius: radius.md,
          marginTop: hp(12), opacity: canRequestPayout ? 1 : 0.6,
        }}
      >
        {requestingPayout ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Banknote size={ms(18)} color="#fff" />
            <Text style={{ color: '#fff', marginLeft: wp(8), fontWeight: '600' }}>{t('referral.requestPayoutButton')}</Text>
          </>
        )}
      </TouchableOpacity>
      {!canRequestPayout && (
        <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: FS.xs, marginTop: hp(6), textAlign: 'center' }}>
          {t('referral.payoutMinimum')}
        </Text>
      )}
    </View>
  );
}
