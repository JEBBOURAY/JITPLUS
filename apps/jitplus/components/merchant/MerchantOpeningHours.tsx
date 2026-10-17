import React, { memo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutAnimation } from 'react-native';
import { Clock, ChevronDown } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { haptic } from '@/utils/haptics';
import { WEEK_DAYS, formatDaySlots, weekDayOf, type OpenStatus } from '@/utils/openingHours';
import { wp, hp, ms } from '@/utils/responsive';
import type { OpeningHours } from '@/types';
import MerchantSection from './MerchantSection';

interface Props {
  hours: OpeningHours;
  status: OpenStatus | null;
  accent: string;
}

/** Today's hours at a glance; the full week on demand. */
function MerchantOpeningHours({ hours, status, accent }: Props) {
  const theme = useTheme();
  const { t } = useLanguage();
  const fonts = useAppFonts();
  const [expanded, setExpanded] = useState(false);
  const today = weekDayOf(new Date());
  const days = expanded ? WEEK_DAYS : [today];

  const toggle = () => {
    haptic();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  const statusColor = status?.isOpen ? theme.success : theme.danger;

  return (
    <MerchantSection
      title={t('merchant.hoursTitle')}
      icon={Clock}
      accent={accent}
      right={status && (
        <View style={[styles.status, { backgroundColor: `${statusColor}14` }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor, fontFamily: fonts.semibold }]}>
            {status.isOpen ? t('merchant.openNow') : t('merchant.closedNow')}
          </Text>
        </View>
      )}
    >
      <View style={styles.list}>
        {days.map((day) => {
          const isToday = day === today;
          const slots = formatDaySlots(hours[day]);
          const color = isToday ? theme.text : theme.textSecondary;
          return (
            <View key={day} style={[styles.row, isToday && { backgroundColor: `${accent}0F` }]}>
              <Text style={[styles.day, { color, fontFamily: isToday ? fonts.bold : fonts.medium }]}>
                {t(`merchant.days.${day}`)}
                {isToday && expanded ? ` · ${t('merchant.today')}` : ''}
              </Text>
              <Text
                style={[
                  styles.slots,
                  { color: slots ? color : theme.danger, fontFamily: isToday ? fonts.semibold : fonts.regular },
                ]}
              >
                {slots ?? t('merchant.dayClosed')}
              </Text>
            </View>
          );
        })}
      </View>
      <Pressable onPress={toggle} style={styles.toggle} accessibilityRole="button" hitSlop={6}>
        <Text style={[styles.toggleText, { color: accent, fontFamily: fonts.semibold }]}>
          {expanded ? t('merchant.showLess') : t('merchant.showWeek')}
        </Text>
        <ChevronDown size={ms(16)} color={accent} strokeWidth={2.2} style={expanded ? styles.chevronUp : undefined} />
      </Pressable>
    </MerchantSection>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: wp(6), paddingHorizontal: wp(10), paddingVertical: hp(4), borderRadius: 999 },
  statusDot: { width: ms(7), height: ms(7), borderRadius: ms(4) },
  statusText: { fontSize: ms(12) },
  list: { gap: hp(2) },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: wp(12),
    paddingVertical: hp(9), paddingHorizontal: wp(10), borderRadius: ms(12),
  },
  day: { fontSize: ms(14) },
  slots: { flexShrink: 1, fontSize: ms(14), textAlign: 'right' },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: wp(4), marginTop: hp(10) },
  toggleText: { fontSize: ms(13) },
  chevronUp: { transform: [{ rotate: '180deg' }] },
});

export default memo(MerchantOpeningHours);
