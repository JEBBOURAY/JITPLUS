import { memo, useCallback, useEffect, useRef } from 'react';
import { I18nManager, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text } from '@/components/AppText';
import { useTheme, palette } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAppFonts } from '@/utils/fonts';
import { hp, ms, wp } from '@/utils/responsive';

export interface DayChip {
  ymd: string;
  weekday: string;
  day: string;
  month: string;
  /** Full day name, for screen readers. */
  label: string;
}

interface Props {
  days: DayChip[];
  selected?: string;
  /** Days known to have a free slot; null while unknown (no day is greyed out). */
  openDays: Set<string> | null;
  onPick: (ymd: string) => void;
}

/** Horizontal strip of the bookable days; full days stay tappable but quiet. */
export default memo(function DayStrip({ days, selected, openDays, onPick }: Props) {
  const theme = useTheme();
  const fonts = useAppFonts();
  const { t } = useLanguage();

  // Bring the selected day into view: the first free day can be past the edge
  // of the strip, and "next free day" jumps to one that is off-screen.
  const stripRef = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, number>>({});
  const reveal = useCallback((ymd: string | undefined) => {
    // Under native RTL the strip's offsets are mirrored: left as it is there.
    if (!ymd || I18nManager.isRTL) return;
    const x = chipX.current[ymd];
    if (x != null) stripRef.current?.scrollTo({ x: Math.max(0, x - wp(20)), animated: true });
  }, []);
  useEffect(() => { reveal(selected); }, [selected, reveal]);

  return (
    <ScrollView ref={stripRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {days.map((parts, i) => {
        const { ymd } = parts;
        const active = ymd === selected;
        // Known to have no free slot (full or closed): still tappable, but quiet.
        const full = !!openDays && !openDays.has(ymd);
        return (
          <Pressable
            key={ymd}
            onPress={() => onPick(ymd)}
            onLayout={(e) => {
              chipX.current[ymd] = e.nativeEvent.layout.x;
              if (active) reveal(ymd);
            }}
            style={[
              styles.dayChip,
              { borderColor: active ? palette.violet : theme.border, backgroundColor: active ? palette.violet : theme.bgCard },
              full && !active && styles.dayFull,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: full }}
            accessibilityLabel={full ? `${parts.label}, ${t('booking.dayFull')}` : parts.label}
          >
            <Text style={[styles.dayWeekday, { color: active ? '#fff' : theme.textMuted, fontFamily: fonts.medium }]} numberOfLines={1}>
              {i === 0 ? t('booking.today') : parts.weekday}
            </Text>
            <Text style={[styles.dayNumber, { color: active ? '#fff' : theme.text, fontFamily: fonts.bold }]}>{parts.day}</Text>
            <Text style={[styles.dayMonth, { color: active ? '#fff' : theme.textMuted, fontFamily: fonts.regular }]} numberOfLines={1}>
              {parts.month}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  chipRow: { gap: wp(8), paddingVertical: 2 },
  dayChip: { width: ms(62), alignItems: 'center', borderWidth: 1, borderRadius: ms(14), paddingVertical: hp(8), gap: 1 },
  dayWeekday: { fontSize: ms(11), textTransform: 'capitalize' },
  dayNumber: { fontSize: ms(18) },
  dayMonth: { fontSize: ms(11), textTransform: 'capitalize' },
  dayFull: { opacity: 0.4 },
});
