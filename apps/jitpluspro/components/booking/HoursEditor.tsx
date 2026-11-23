import { View, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { Text, TextInput } from '@/components/AppText';
import { Plus, X } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { parseTimeInput } from '@/utils/bookingTime';
import { minutesToHhmm, type HourRange } from '@jitplus/shared/src/booking';
import { TIME_KEYBOARD } from '@/utils/bookingTime';

interface RangeDraft { start: string; end: string }
/** Index 0 = Monday … 6 = Sunday; an empty list = closed that day. */
export type WeekDraft = RangeDraft[][];

const DEFAULT_RANGE: RangeDraft = { start: '09:00', end: '18:00' };

export function weekDraftOf(hours: HourRange[]): WeekDraft {
  const week: WeekDraft = Array.from({ length: 7 }, () => []);
  [...hours]
    .sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin)
    .forEach((h) => week[h.weekday - 1]?.push({ start: minutesToHhmm(h.startMin), end: minutesToHhmm(h.endMin) }));
  return week;
}

/** Ranges for PUT hours, or the i18n key of the first problem. */
export function rangesOfDraft(week: WeekDraft): { ranges: HourRange[] } | { error: string; weekday: number } {
  const ranges: HourRange[] = [];
  for (let i = 0; i < 7; i++) {
    const day: HourRange[] = [];
    for (const r of week[i]) {
      const startMin = parseTimeInput(r.start);
      const endMin = parseTimeInput(r.end);
      if (startMin === null || endMin === null || startMin > 1439) return { error: 'booking.hours.errFormat', weekday: i + 1 };
      if (endMin <= startMin) return { error: 'booking.hours.errOrder', weekday: i + 1 };
      day.push({ weekday: i + 1, startMin, endMin });
    }
    day.sort((a, b) => a.startMin - b.startMin);
    for (let k = 1; k < day.length; k++) {
      if (day[k].startMin < day[k - 1].endMin) return { error: 'booking.hours.errOverlap', weekday: i + 1 };
    }
    ranges.push(...day);
  }
  return { ranges };
}

/** Weekly hours: each day open or closed, with one or more ranges (a break = two ranges). */
export function HoursEditor({ value, onChange }: { value: WeekDraft; onChange: (week: WeekDraft) => void }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();

  const setDay = (i: number, ranges: RangeDraft[]) => onChange(value.map((d, k) => (k === i ? ranges : d)));
  const toggleDay = (i: number, open: boolean) => {
    if (!open) return setDay(i, []);
    // Opening a day copies the closest open day before it, else 09:00–18:00.
    const model = [...value.slice(0, i)].reverse().find((d) => d.length) ?? value.find((d) => d.length);
    setDay(i, model ? model.map((r) => ({ ...r })) : [{ ...DEFAULT_RANGE }]);
  };
  const editRange = (i: number, k: number, patch: Partial<RangeDraft>) =>
    setDay(i, value[i].map((r, j) => (j === k ? { ...r, ...patch } : r)));
  const addRange = (i: number) => {
    const last = value[i][value[i].length - 1];
    const lastEnd = last ? parseTimeInput(last.end) : null;
    const start = lastEnd !== null && lastEnd < 23 * 60 ? lastEnd + 60 : 14 * 60;
    setDay(i, [...value[i], { start: minutesToHhmm(start), end: minutesToHhmm(Math.min(start + 180, 1440)) }]);
  };
  const copyMonday = () => onChange(value.map((d, k) => (k === 0 || !d.length ? d : value[0].map((r) => ({ ...r })))));

  return (
    <View style={styles.wrap}>
      {value[0].length > 0 && (
        <TouchableOpacity onPress={copyMonday} style={styles.copy} accessibilityRole="button">
          <Text style={[styles.addText, { color: theme.primary, textAlign }]} maxFontSizeMultiplier={1.3}>{t('booking.hours.copyMonday')}</Text>
        </TouchableOpacity>
      )}
      {value.map((ranges, i) => {
        const open = ranges.length > 0;
        const dayName = t(`booking.weekday.${i + 1}`);
        return (
          <View key={i} style={[styles.day, { borderTopColor: theme.borderLight }, i === 0 && styles.firstDay]}>
            <View style={[styles.dayHead, { flexDirection: row }]}>
              <Text style={[styles.dayName, { color: open ? theme.text : theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
                {dayName}
              </Text>
              {!open && <Text style={[styles.closed, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>{t('booking.hours.closed')}</Text>}
              <Switch
                value={open}
                onValueChange={(v) => toggleDay(i, v)}
                trackColor={{ true: theme.primary, false: theme.border }}
                thumbColor="#FFFFFF"
                accessibilityLabel={dayName}
              />
            </View>
            {ranges.map((r, k) => (
              <View key={k} style={[styles.range, { flexDirection: row }]}>
                <TimeBox value={r.start} onChange={(start) => editRange(i, k, { start })} label={`${dayName} ${t('booking.hours.from')}`} />
                <Text style={[styles.dash, { color: theme.textMuted }]}>–</Text>
                <TimeBox value={r.end} onChange={(end) => editRange(i, k, { end })} label={`${dayName} ${t('booking.hours.to')}`} />
                {ranges.length > 1 ? (
                  <TouchableOpacity
                    onPress={() => setDay(i, ranges.filter((_, j) => j !== k))}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('booking.hours.removeRange')}
                    style={styles.rangeAction}
                  >
                    <X size={18} color={theme.textMuted} strokeWidth={icon.stroke} />
                  </TouchableOpacity>
                ) : <View style={styles.rangeAction} />}
                {k === ranges.length - 1 && ranges.length < 6 ? (
                  <TouchableOpacity
                    onPress={() => addRange(i)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t('booking.hours.addRange')}
                    style={styles.rangeAction}
                  >
                    <Plus size={18} color={theme.primary} strokeWidth={icon.stroke} />
                  </TouchableOpacity>
                ) : <View style={styles.rangeAction} />}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

/** Read-only week: one line per day, with its ranges or "Fermé". */
export function HoursPreview({ hours }: { hours: HourRange[] }) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  return (
    <View style={styles.preview}>
      {weekDraftOf(hours).map((ranges, i) => (
        <View key={i} style={[styles.previewRow, { flexDirection: row }]}>
          <Text style={[styles.previewDay, { color: ranges.length ? theme.text : theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
            {t(`booking.weekday.${i + 1}`)}
          </Text>
          <Text style={[styles.previewHours, { color: ranges.length ? theme.textSecondary : theme.textMuted }]} maxFontSizeMultiplier={1.3}>
            {ranges.length ? ranges.map((r) => `${r.start} – ${r.end}`).join(', ') : t('booking.hours.closed')}
          </Text>
        </View>
      ))}
    </View>
  );
}

function TimeBox({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const theme = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      // Normalise "9" or "930" to "09:00" / "09:30" when the field is left.
      onBlur={() => {
        const m = parseTimeInput(value);
        if (m !== null) onChange(minutesToHhmm(m));
      }}
      keyboardType={TIME_KEYBOARD}
      maxLength={5}
      placeholder="09:00"
      placeholderTextColor={theme.inputPlaceholder}
      accessibilityLabel={label}
      style={[styles.time, { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.text }]}
    />
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  day: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, gap: 8 },
  firstDay: { borderTopWidth: 0, paddingTop: 0 },
  dayHead: { alignItems: 'center', gap: 8 },
  dayName: { flex: 1, fontSize: ms(15), fontFamily: font.medium },
  closed: { fontSize: ms(12), fontFamily: font.regular },
  range: { alignItems: 'center', gap: 8 },
  dash: { fontSize: ms(15), fontFamily: font.regular },
  time: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: ms(15), fontFamily: font.medium, textAlign: 'center', minHeight: 42 },
  rangeAction: { width: 24, height: 44, alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: ms(13), fontFamily: font.medium },
  copy: { paddingBottom: 12 },
  preview: { gap: 10 },
  previewRow: { alignItems: 'center', gap: 12 },
  previewDay: { flex: 1, fontSize: ms(14), fontFamily: font.medium },
  previewHours: { fontSize: ms(13), fontFamily: font.regular },
});
