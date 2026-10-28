import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { hp, ms, wp, fontSize as FS } from '@/utils/responsive';
import MerchantLogo from '../MerchantLogo';

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

interface Props {
  logoUrl: string | null | undefined;
  merchantName: string;
  campaignName: string | null | undefined;
  fonts: AppFonts;
}

export default React.memo(function WheelMerchantRow({ logoUrl, merchantName, campaignName, fonts }: Props) {
  return (
    <View style={styles.merchantRow}>
      <MerchantLogo logoUrl={logoUrl} merchantName={merchantName} style={styles.merchantLogo} />
      <View style={styles.merchantText}>
        <Text style={[styles.merchantName, { fontFamily: fonts.bold }]} numberOfLines={1}>{merchantName}</Text>
        {!!campaignName && campaignName !== merchantName && (
          <Text style={[styles.campaignName, { fontFamily: fonts.regular }]} numberOfLines={1}>{campaignName}</Text>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(10),
    paddingHorizontal: wp(24),
    maxWidth: '100%',
  },
  merchantLogo: { width: ms(36), height: ms(36), borderRadius: ms(18), backgroundColor: '#fff' },
  merchantText: { flexShrink: 1 },
  merchantName: { color: '#fff', fontSize: FS.md },
  campaignName: { color: 'rgba(255,255,255,0.6)', fontSize: FS.xs, marginTop: hp(1) },
});
