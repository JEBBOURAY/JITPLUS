import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/AppText';
import { Clock, Sparkles } from 'lucide-react-native';
import GamePill from '@/components/GamePill';
import { formatDate } from '@/utils/date';
import { hp, ms, fontSize as FS } from '@/utils/responsive';

import type { AppFonts } from '@/utils/fonts';

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
        <GamePill Icon={Sparkles} label={t('scratch.card.alwaysWin')} fontFamily={fonts.semibold} />
        <GamePill
          Icon={Clock}
          tone="muted"
          label={t('scratch.card.expiresOn', { date: formatDate(expiresAt, locale) })}
          fontFamily={fonts.medium}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  intro: { alignItems: 'center', marginBottom: hp(18), gap: hp(10) },
  introTitle: { color: '#fff', fontSize: FS['2xl'], textAlign: 'center', letterSpacing: -0.3 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: ms(8) },
});
