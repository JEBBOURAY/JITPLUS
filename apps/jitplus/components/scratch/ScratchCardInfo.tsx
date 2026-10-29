import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Info } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { hp, ms, fontSize as FS, radius } from '@/utils/responsive';

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

interface Props {
  message?: string | null;
  merchantName: string;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/** Merchant message (if any) and the game rules shown under the card. */
export default React.memo(function ScratchCardInfo({ message, merchantName, fonts, t }: Props) {
  return (
    <>
      {!!message && (
        <View style={styles.message}>
          <Text style={[styles.messageLabel, { fontFamily: fonts.semibold }]}>
            {t('scratch.screen.messageFrom', { merchant: merchantName })}
          </Text>
          <Text style={[styles.messageText, { fontFamily: fonts.regular }]}>{message}</Text>
        </View>
      )}

      <View style={styles.legal}>
        <View style={styles.legalHeader}>
          <Info size={ms(14)} color="rgba(255,255,255,0.6)" strokeWidth={2} />
          <Text style={[styles.legalTitle, { fontFamily: fonts.semibold }]}>{t('scratch.rules.title')}</Text>
        </View>
        <Text style={[styles.legalText, { fontFamily: fonts.regular }]}>{t('scratch.rules.body')}</Text>
      </View>
    </>
  );
});

const styles = StyleSheet.create({
  message: {
    alignSelf: 'stretch',
    marginTop: hp(18),
    padding: ms(14),
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderLeftWidth: 3,
    borderLeftColor: palette.goldLight,
    gap: hp(4),
  },
  messageLabel: { color: 'rgba(255,255,255,0.55)', fontSize: FS.xs },
  messageText: { color: 'rgba(255,255,255,0.9)', fontSize: FS.sm, lineHeight: ms(20), fontStyle: 'italic' },

  legal: { alignSelf: 'stretch', marginTop: hp(22), gap: hp(6) },
  legalHeader: { flexDirection: 'row', alignItems: 'center', gap: ms(6) },
  legalTitle: { color: 'rgba(255,255,255,0.7)', fontSize: FS.xs, textTransform: 'uppercase', letterSpacing: 0.8 },
  legalText: { color: 'rgba(255,255,255,0.45)', fontSize: ms(11), lineHeight: ms(16) },
});
