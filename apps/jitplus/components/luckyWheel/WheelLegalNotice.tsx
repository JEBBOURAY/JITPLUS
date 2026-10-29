import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Info } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { hp, ms, wp, fontSize as FS } from '@/utils/responsive';

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

interface Props {
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
  onOpenRules: () => void;
}

export default React.memo(function WheelLegalNotice({ fonts, t, onOpenRules }: Props) {
  return (
    <View style={styles.legal}>
      <View style={styles.legalHeader}>
        <Info size={ms(14)} color="rgba(255,255,255,0.6)" strokeWidth={2} />
        <Text style={[styles.legalTitle, { fontFamily: fonts.semibold }]}>{t('luckyWheel.goodToKnow')}</Text>
      </View>
      <Text style={[styles.legalText, { fontFamily: fonts.medium }]}>{t('luckyWheel.noPurchaseNotice')}</Text>
      <Text style={[styles.legalText, { fontFamily: fonts.regular }]}>{t('luckyWheel.notGamblingNotice')}</Text>
      <Text style={[styles.legalText, { fontFamily: fonts.regular }]}>{t('luckyWheel.merchantOrganizedNotice')}</Text>
      <Text style={[styles.legalText, { fontFamily: fonts.regular }]}>{t('luckyWheel.storeDisclaimer')}</Text>
      <TouchableOpacity onPress={onOpenRules} accessibilityRole="link" hitSlop={8} style={styles.rulesBtn}>
        <Text style={[styles.rulesText, { fontFamily: fonts.semibold }]}>{t('luckyWheel.rulesLink')}</Text>
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  legal: { alignSelf: 'stretch', paddingHorizontal: wp(24), marginTop: hp(22), gap: hp(6) },
  legalHeader: { flexDirection: 'row', alignItems: 'center', gap: ms(6), marginBottom: hp(2) },
  legalTitle: { color: 'rgba(255,255,255,0.7)', fontSize: FS.xs, textTransform: 'uppercase', letterSpacing: 0.8 },
  legalText: { color: 'rgba(255,255,255,0.45)', fontSize: ms(11), lineHeight: ms(16) },
  rulesBtn: { alignSelf: 'flex-start', marginTop: hp(4) },
  rulesText: { color: palette.goldLight, fontSize: FS.xs, textDecorationLine: 'underline' },
});
