// Calendar picker in plain React Native: avoids a native date-picker module
// (and a new store build) for the three campaign dates.
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet } from 'react-native';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getIntlLocale } from '@/config/currency';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { diffDaysYmd, toYmd } from '@jitplus/shared/src/scratch';

// One formatter per language and style: building an Intl formatter costs far more than using it.
const ymdFormatters = new Map<string, Intl.DateTimeFormat>();

/** 'YYYY-MM-DD' → '17 oct. 2026' in the app language */
export function formatYmd(ymd: string, locale: string, withYear = true): string {
  const [y, m, d] = (ymd || '').split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const key = `${locale}|${withYear}`;
  let formatter = ymdFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(getIntlLocale(locale), {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
    });
    ymdFormatters.set(key, formatter);
  }
  return formatter.format(new Date(y, m - 1, d));
}

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (ymd: string) => void;
  minYmd?: string;
  maxYmd?: string;
  disabled?: boolean;
}

export function DateField({ label, value, onChange, minYmd, maxYmd, disabled }: DateFieldProps) {
  const theme = useTheme();
  const { locale, isRTL } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        disabled={disabled}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${formatYmd(value, locale)}`}
        style={[
          styles.field,
          { backgroundColor: theme.inputBg, borderColor: theme.inputBorder, flexDirection: isRTL ? 'row-reverse' : 'row', opacity: disabled ? 0.55 : 1 },
        ]}
      >
        <Calendar size={18} color={theme.primary} strokeWidth={icon.stroke} />
        <View style={styles.fieldText}>
          <Text style={[styles.fieldLabel, { color: theme.textMuted, textAlign: isRTL ? 'right' : 'left' }]} maxFontSizeMultiplier={1.3}>{label}</Text>
          <Text style={[styles.fieldValue, { color: theme.text, textAlign: isRTL ? 'right' : 'left' }]} maxFontSizeMultiplier={1.3}>
            {formatYmd(value, locale)}
          </Text>
        </View>
      </TouchableOpacity>
      <DatePickerModal
        visible={open}
        title={label}
        value={value}
        minYmd={minYmd}
        maxYmd={maxYmd}
        onClose={() => setOpen(false)}
        onSelect={(ymd) => {
          setOpen(false);
          onChange(ymd);
        }}
      />
    </>
  );
}

interface DatePickerModalProps {
  visible: boolean;
  title: string;
  value: string;
  minYmd?: string;
  maxYmd?: string;
  onSelect: (ymd: string) => void;
  onClose: () => void;
}

function DatePickerModal({ visible, title, value, minYmd, maxYmd, onSelect, onClose }: DatePickerModalProps) {
  const theme = useTheme();
  const { t, locale, isRTL } = useLanguage();
  const initial = useMemo(() => {
    const [y, m] = (value || toYmd(new Date())).split('-').map(Number);
    return { y, m: m - 1 };
  }, [value]);
  const [month, setMonth] = useState(initial);

  // Re-centre on the selected value each time the picker opens.
  const [lastVisible, setLastVisible] = useState(visible);
  if (visible !== lastVisible) {
    setLastVisible(visible);
    if (visible) setMonth(initial);
  }

  const cells = useMemo(() => {
    const first = new Date(month.y, month.m, 1);
    const offset = (first.getDay() + 6) % 7; // Monday first
    const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
    const list: (string | null)[] = Array.from({ length: offset }, () => null);
    for (let d = 1; d <= daysInMonth; d++) list.push(toYmd(new Date(month.y, month.m, d)));
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [month]);

  const isAllowed = (ymd: string) =>
    (!minYmd || diffDaysYmd(minYmd, ymd) >= 0) && (!maxYmd || diffDaysYmd(ymd, maxYmd) >= 0);

  const monthTitle = new Date(month.y, month.m, 1).toLocaleDateString(getIntlLocale(locale), { month: 'long', year: 'numeric' });
  const shift = (delta: number) => setMonth((cur) => {
    const d = new Date(cur.y, cur.m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const firstOfMonth = toYmd(new Date(month.y, month.m, 1));
  const lastOfMonth = toYmd(new Date(month.y, month.m + 1, 0));
  const canPrev = !minYmd || diffDaysYmd(minYmd, firstOfMonth) > 0;
  const canNext = !maxYmd || diffDaysYmd(lastOfMonth, maxYmd) > 0;
  const PrevIcon = isRTL ? ChevronRight : ChevronLeft;
  const NextIcon = isRTL ? ChevronLeft : ChevronRight;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('common.close')}>
        <Pressable style={[styles.sheet, { backgroundColor: theme.bgCard }]} onPress={(e) => e.stopPropagation()} accessibilityViewIsModal>
          <Text style={[styles.title, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{title}</Text>
          <View style={[styles.monthRow, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity onPress={() => shift(-1)} disabled={!canPrev} style={[styles.navBtn, { opacity: canPrev ? 1 : 0.3 }]} accessibilityRole="button" accessibilityLabel={t('scratch.wizard.prevMonth')}>
              <PrevIcon size={20} color={theme.text} strokeWidth={icon.stroke} />
            </TouchableOpacity>
            <Text style={[styles.monthTitle, { color: theme.text }]} maxFontSizeMultiplier={1.3}>{monthTitle}</Text>
            <TouchableOpacity onPress={() => shift(1)} disabled={!canNext} style={[styles.navBtn, { opacity: canNext ? 1 : 0.3 }]} accessibilityRole="button" accessibilityLabel={t('scratch.wizard.nextMonth')}>
              <NextIcon size={20} color={theme.text} strokeWidth={icon.stroke} />
            </TouchableOpacity>
          </View>
          <View style={[styles.grid, { flexDirection: isRTL ? 'row-reverse' : 'row' }]}>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <Text key={`h${d}`} style={[styles.weekday, { color: theme.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.1}>
                {t(`scratch.weekdayShort.${d}`).slice(0, 3)}
              </Text>
            ))}
            {cells.map((ymd, i) => {
              if (!ymd) return <View key={`e${i}`} style={styles.cell} />;
              const allowed = isAllowed(ymd);
              const selected = ymd === value;
              return (
                <TouchableOpacity
                  key={ymd}
                  disabled={!allowed}
                  onPress={() => onSelect(ymd)}
                  style={[styles.cell, selected && { backgroundColor: theme.primary, borderRadius: 999 }]}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: !allowed }}
                  accessibilityLabel={formatYmd(ymd, locale)}
                >
                  <Text
                    style={[styles.day, { color: selected ? '#FFFFFF' : allowed ? theme.text : theme.textMuted, opacity: allowed ? 1 : 0.35 }]}
                    maxFontSizeMultiplier={1.2}
                  >
                    {Number(ymd.slice(8))}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.cancel} accessibilityRole="button">
            <Text style={[styles.cancelText, { color: theme.primary }]} maxFontSizeMultiplier={1.3}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  field: { alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 54 },
  fieldText: { flex: 1, gap: 2 },
  fieldLabel: { fontSize: ms(12), fontFamily: font.regular },
  fieldValue: { fontSize: ms(15), fontFamily: font.semibold },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  sheet: { borderRadius: 24, padding: 18, gap: 10 },
  title: { fontSize: ms(16), fontFamily: font.semibold, textAlign: 'center' },
  monthRow: { alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { fontSize: ms(15), fontFamily: font.semibold, textTransform: 'capitalize' },
  grid: { flexWrap: 'wrap' },
  weekday: { width: `${100 / 7}%`, textAlign: 'center', fontSize: ms(11), fontFamily: font.medium, paddingVertical: 4 },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { fontSize: ms(14), fontFamily: font.medium },
  cancel: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 20 },
  cancelText: { fontSize: ms(14), fontFamily: font.semibold },
});
