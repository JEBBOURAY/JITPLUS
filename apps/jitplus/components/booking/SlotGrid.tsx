import { memo } from 'react';
import { Pressable, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AlertCircle, CalendarX } from 'lucide-react-native';
import { Text } from '@/components/AppText';
import Skeleton from '@/components/Skeleton';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { formatYmdLong, type DayPeriod } from '@/utils/booking';
import { hp, ms, wp } from '@/utils/responsive';
import { BookingState, bookingStyles } from './BookingParts';

interface Props {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Start instants of the free slots, with their 'HH:MM' labels (same order). */
  slots: { startsAt: string }[];
  labels: string[];
  /** Slot indexes by part of the day. */
  groups: { period: DayPeriod; indexes: number[] }[];
  selected?: string;
  onPick: (startsAt: string) => void;
  /** Next day with a free slot, offered when this one is full. */
  nextOpenDay?: string;
  onPickDay: (ymd: string) => void;
}

/** Free slots of the chosen day, grouped morning / afternoon / evening, with its loading, error and empty states. */
export default memo(function SlotGrid({
  loading, error, onRetry, slots, labels, groups, selected, onPick, nextOpenDay, onPickDay,
}: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t, locale } = useLanguage();

  if (loading) {
    return (
      <View style={styles.slotGrid}>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} width={wp(74)} height={ms(40)} borderRadius={ms(12)} />
        ))}
      </View>
    );
  }
  if (error) {
    return <BookingState icon={<AlertCircle size={ms(28)} color={theme.danger} />} message={t('booking.slotsError')} onRetry={onRetry} />;
  }
  if (slots.length === 0) {
    return (
      <View style={[styles.emptySlots, { backgroundColor: theme.bgCard, borderColor: theme.borderLight }]}>
        <CalendarX size={ms(24)} color={theme.textMuted} strokeWidth={1.8} />
        <Text style={[styles.emptySlotsTitle, { color: theme.textSecondary, fontFamily: fonts.semibold }]}>{t('booking.noSlots')}</Text>
        <Text style={[styles.emptySlotsHint, { color: theme.textMuted, fontFamily: fonts.regular }]}>{t('booking.noSlotsHint')}</Text>
        {nextOpenDay && (
          <TouchableOpacity
            style={[bookingStyles.outlineBtn, { borderColor: palette.violet }]}
            onPress={() => onPickDay(nextOpenDay)}
            accessibilityRole="button"
          >
            <Text style={[bookingStyles.outlineBtnText, { color: palette.violet, fontFamily: fonts.semibold }]}>
              {t('booking.nextFreeDay', { day: formatYmdLong(nextOpenDay, locale) })}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }
  // Morning / afternoon / evening: a long day reads at a glance.
  return groups.map((g) => (
    <View key={g.period} style={styles.slotGroup}>
      {groups.length > 1 && (
        <Text style={[styles.slotGroupTitle, { color: theme.textMuted, fontFamily: fonts.medium }]}>{t(`booking.period.${g.period}`)}</Text>
      )}
      <View style={styles.slotGrid}>
        {g.indexes.map((i) => {
          const s = slots[i];
          const active = s.startsAt === selected;
          const label = labels[i];
          return (
            <Pressable
              key={s.startsAt}
              onPress={() => onPick(s.startsAt)}
              style={({ pressed }) => [
                styles.slot,
                { borderColor: active ? palette.violet : theme.border, backgroundColor: active ? palette.violet : theme.bgCard },
                pressed && !active && bookingStyles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
            >
              <Text style={[styles.slotText, { color: active ? '#fff' : theme.text, fontFamily: fonts.semibold }]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  ));
});

const styles = StyleSheet.create({
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: wp(8) },
  slotGroup: { gap: hp(6), marginBottom: hp(10) },
  slotGroupTitle: { fontSize: ms(12), textAlign: 'left' },
  slot: { minWidth: wp(74), alignItems: 'center', borderWidth: 1, borderRadius: ms(12), paddingVertical: hp(10), paddingHorizontal: wp(10) },
  slotText: { fontSize: ms(14), fontVariant: ['tabular-nums'] },
  emptySlots: { alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: wp(18), gap: hp(6) },
  emptySlotsTitle: { fontSize: ms(14), textAlign: 'center' },
  emptySlotsHint: { fontSize: ms(12), textAlign: 'center' },
});
