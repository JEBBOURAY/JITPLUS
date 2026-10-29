import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { WEEK_DAYS, formatDaySlots, weekDayOf } from '@jitplus/shared';
import { wp, hp, ms } from '@/utils/responsive';
import type { OpeningHours } from '@/types';
import FicheSection from './FicheSection';

interface Props {
  hours: OpeningHours;
}

/** The whole week, today in bold. The open/closed status is already in the hero. */
function MerchantOpeningHours({ hours }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const today = weekDayOf(new Date());

  return (
    <FicheSection title={t('merchant.hoursTitle')}>
      {WEEK_DAYS.map((day) => {
        const isToday = day === today;
        const slots = formatDaySlots(hours[day]);
        const font = isToday ? fonts.semibold : fonts.regular;
        return (
          <View key={day} style={styles.row}>
            <Text style={[styles.day, { color: theme.text, fontFamily: font }]}>{t(`merchant.days.${day}`)}</Text>
            <Text style={[styles.slots, { color: slots ? theme.text : theme.textMuted, fontFamily: font }]}>
              {slots ?? t('merchant.dayClosed')}
            </Text>
          </View>
        );
      })}
    </FicheSection>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: wp(12), paddingVertical: hp(6) },
  day: { fontSize: ms(14) },
  slots: { flexShrink: 1, fontSize: ms(14), textAlign: 'right' },
});

export default memo(MerchantOpeningHours);
