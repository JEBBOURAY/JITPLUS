import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Clock, Sparkles } from 'lucide-react-native';
import { palette } from '@/contexts/ThemeContext';
import { formatDate } from '@/utils/date';
import { hp, ms, fontSize as FS } from '@/utils/responsive';

interface AppFonts { regular: string; medium: string; semibold: string; bold: string }

interface Props {
  expiresAt: string;
  locale: string;
  fonts: AppFonts;
  t: (key: string, options?: Record<string, unknown>) => string;
}

/** Headline and pills shown above the card while it is still to scratch. */
export default React.memo(function ScratchIntro({ expiresAt, locale, fonts, t }: Props) {
  return (
    <View style={styles.intro}>
      <Text style={[styles.introTitle, { fontFamily: fonts.bold }]}>{t('scratch.screen.headline')}</Text>
      <View style={styles.pills}>
        <View style={styles.pill}>
          <Sparkles size={ms(13)} color={palette.goldLight} strokeWidth={2} />
          <Text style={[styles.pillText, { fontFamily: fonts.semibold }]}>{t('scratch.card.alwaysWin')}</Text>
        </View>
        <View style={[styles.pill, styles.pillMuted]}>
          <Clock size={ms(13)} color="rgba(255,255,255,0.75)" strokeWidth={2} />
          <Text style={[styles.pillText, styles.pillTextMuted, { fontFamily: fonts.medium }]}>
            {t('scratch.card.expiresOn', { date: formatDate(expiresAt, locale) })}
          </Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  intro: { alignItems: 'center', marginBottom: hp(18), gap: hp(10) },
  introTitle: { color: '#fff', fontSize: FS['2xl'], textAlign: 'center', letterSpacing: -0.3 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: ms(8) },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(6),
    paddingHorizontal: ms(12),
    paddingVertical: ms(6),
    borderRadius: 999,
    backgroundColor: 'rgba(251,191,36,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.3)',
  },
  pillMuted: { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.12)' },
  pillText: { color: palette.goldLight, fontSize: FS.xs },
  pillTextMuted: { color: 'rgba(255,255,255,0.75)' },
});
