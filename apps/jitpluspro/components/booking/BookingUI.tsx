import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, Switch } from 'react-native';
import { Text } from '@/components/AppText';
import { ChevronRight } from 'lucide-react-native';
import { useTheme, type ThemeColors } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { getIntlLocale } from '@/config/currency';
import { ms } from '@/utils/responsive';
import { font, icon } from '@/constants/design';
import { deviceTimeZone } from '@/utils/bookingTime';
import { toZoneWall } from '@jitplus/shared/src/zoneTime';
import { useBookingSetup } from '@/hooks/queries/booking';
import { StatusPill } from '@/components/scratch/ScratchUI';
import { fieldFill } from '@/components/settings/surface';
import {
  bookingAwaitsStamps,
  bookingClientLabel,
  formatBookingTime,
  isActiveBooking,
  type BookingStatus,
  type MerchantBooking,
} from '@jitplus/shared/src/booking';

/**
 * The merchant's IANA zone, as the API gives it (setup response, cached):
 * bookings are shown in shop time, whatever the phone's zone. The phone's
 * zone stands in until the setup has loaded.
 */
export function useBookingTz(enabled = true): string {
  const { data } = useBookingSetup(enabled);
  return data?.timeZone ?? deviceTimeZone();
}

function bookingStatusColor(theme: ThemeColors, status: BookingStatus): string {
  switch (status) {
    case 'PENDING':
      return theme.warning;
    case 'CONFIRMED':
      return theme.primary;
    case 'CHECKED_IN':
    case 'COMPLETED':
      return theme.success;
    case 'CANCELLED_CLIENT':
    case 'CANCELLED_MERCHANT':
    case 'NO_SHOW':
      return theme.danger;
    default:
      return theme.textMuted;
  }
}

export function BookingStatusPill({ status }: { status: BookingStatus }) {
  const theme = useTheme();
  const { t } = useLanguage();
  return <StatusPill label={t(`booking.status.${status}`)} color={bookingStatusColor(theme, status)} />;
}

/** First letter only: "Mercredi 18 novembre", where CSS-like capitalize would also raise the month. */
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/** Null when the phone's Intl does not know this zone: callers show a plain fallback. */
function dateFormatter(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat | null {
  try {
    return new Intl.DateTimeFormat(getIntlLocale(locale), options);
  } catch {
    return null;
  }
}

/**
 * Formats instants in shop time. Hermes misreads some zones (Morocco printed at
 * UTC+0), so the wall clock comes from zoneTime and is printed as UTC.
 */
function zonedFormatter(locale: string, tz: string, options: Intl.DateTimeFormatOptions): { format: (date: Date) => string } | null {
  const f = dateFormatter(locale, { ...options, timeZone: 'UTC' });
  if (!f) return null;
  return { format: (date: Date) => f.format(toZoneWall(date, tz) ?? date) };
}

/** "lundi 17 novembre" of an instant, in shop time and the app language. */
export function useDayFormatter(tz: string, withYear = false) {
  const { locale } = useLanguage();
  return useMemo(() => {
    const f = zonedFormatter(locale, tz, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      ...(withYear ? { year: 'numeric' } : {}),
    });
    return (date: Date) => (f ? f.format(date) : date.toDateString());
  }, [locale, tz, withYear]);
}

/** "lun." and "17" of an instant, for the week strip of the agenda. */
export function useShortDayFormatter(tz: string) {
  const { locale } = useLanguage();
  return useMemo(() => {
    const weekday = zonedFormatter(locale, tz, { weekday: 'short' });
    const day = zonedFormatter(locale, tz, { day: 'numeric' });
    return (date: Date) => ({
      weekday: weekday ? weekday.format(date) : '',
      day: day ? day.format(date) : String(date.getDate()),
    });
  }, [locale, tz]);
}

/** "17 – 23 nov." (or "29 sept. – 5 oct.") of a week, in shop time: the month is always visible. */
export function useWeekRangeFormatter(tz: string) {
  const { locale } = useLanguage();
  return useMemo(() => {
    const day = zonedFormatter(locale, tz, { day: 'numeric' });
    const month = zonedFormatter(locale, tz, { month: 'numeric' });
    const dayMonth = zonedFormatter(locale, tz, { day: 'numeric', month: 'short' });
    return (first: Date, last: Date) => {
      if (!day || !month || !dayMonth) return '';
      const sameMonth = month.format(first) === month.format(last);
      return `${sameMonth ? day.format(first) : dayMonth.format(first)} – ${dayMonth.format(last)}`;
    };
  }, [locale, tz]);
}

/** One booking of the agenda: time column, coloured bar, client and service. */
export const BookingRow = React.memo(function BookingRow({ booking, tz, onPress }: {
  booking: MerchantBooking;
  tz: string;
  onPress: (id: string) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign, flip } = useDir();
  const color = bookingStatusColor(theme, booking.status);
  const start = formatBookingTime(booking.startsAt, tz);
  const end = formatBookingTime(booking.endsAt, tz);
  const client = bookingClientLabel(booking);
  const muted = !isActiveBooking(booking.status);
  const cancelled = muted && booking.status !== 'COMPLETED';
  const meta = booking.serviceName;
  // A visit under way or closed whose stamps were not given: said on the row, so it is not forgotten.
  const stampsDue = booking.status !== 'CONFIRMED' && bookingAwaitsStamps(booking);
  const statusLabel = [t(`booking.status.${booking.status}`), stampsDue && t('booking.stampsDue')].filter(Boolean).join(' · ');
  return (
    <TouchableOpacity
      onPress={() => onPress(booking.id)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={[`${start} – ${end}`, client, meta, statusLabel].join(', ')}
      style={[styles.row, { flexDirection: row, backgroundColor: fieldFill(theme), opacity: muted ? 0.7 : 1 }]}
    >
      <View style={[styles.bar, { backgroundColor: color }]} />
      <View style={styles.time}>
        <Text style={[styles.timeStart, { color: theme.text }]} maxFontSizeMultiplier={1.2}>{start}</Text>
        <Text style={[styles.timeEnd, { color: theme.textMuted }]} maxFontSizeMultiplier={1.2}>{end}</Text>
      </View>
      <View style={styles.body}>
        <Text
          style={[styles.client, { color: theme.text, textAlign }, cancelled && styles.struck]}
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
        >
          {client}
        </Text>
        <Text style={[styles.meta, { color: theme.textSecondary, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {meta}
        </Text>
        {/* Confirmed is the normal case: only the exceptions are spelled out. */}
        {booking.status !== 'CONFIRMED' && (
          <Text style={[styles.status, { color, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {statusLabel}
          </Text>
        )}
      </View>
      <ChevronRight size={18} color={theme.textMuted} strokeWidth={icon.stroke} style={flip} />
    </TouchableOpacity>
  );
});

/** A setting with an on/off switch, its title and a one-line explanation. */
export function SwitchRow({ title, hint, value, onChange, disabled }: {
  title: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const { row, textAlign } = useDir();
  return (
    <View style={[styles.switchRow, { flexDirection: row }]}>
      <View style={styles.switchText}>
        <Text style={[styles.switchTitle, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>{title}</Text>
        {hint ? (
          <Text style={[styles.switchHint, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.4}>{hint}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: theme.primary, false: theme.border }}
        thumbColor="#FFFFFF"
        accessibilityLabel={title}
      />
    </View>
  );
}

/** A tappable line of a setup list (a service, the hours, a closure). */
export function ListLine({ title, subtitle, onPress, trailing, dimmed }: {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  dimmed?: boolean;
}) {
  const theme = useTheme();
  const { row, textAlign, flip } = useDir();
  const content = (
    <>
      <View style={styles.lineText}>
        <Text style={[styles.lineTitle, { color: theme.text, textAlign }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.lineSub, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>{subtitle}</Text>
        ) : null}
      </View>
      {trailing}
      {onPress ? <ChevronRight size={18} color={theme.textMuted} strokeWidth={icon.stroke} style={flip} /> : null}
    </>
  );
  const style = [styles.line, { flexDirection: row, borderTopColor: theme.borderLight, opacity: dimmed ? 0.55 : 1 }];
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle].filter(Boolean).join(', ')}
      style={style}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', gap: 12, borderRadius: 12, padding: 12, overflow: 'hidden' },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
  time: { width: ms(48), alignItems: 'center' },
  timeStart: { fontSize: ms(15), fontFamily: font.semibold },
  timeEnd: { fontSize: ms(12), fontFamily: font.regular },
  body: { flex: 1, gap: 4 },
  client: { fontSize: ms(15), fontFamily: font.semibold },
  struck: { textDecorationLine: 'line-through' },
  meta: { fontSize: ms(13), fontFamily: font.regular },
  status: { fontSize: ms(12), fontFamily: font.medium },
  switchRow: { alignItems: 'center', gap: 12 },
  switchText: { flex: 1, gap: 2 },
  switchTitle: { fontSize: ms(15), fontFamily: font.medium },
  switchHint: { fontSize: ms(12), lineHeight: ms(17), fontFamily: font.regular },
  line: { alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  lineText: { flex: 1, gap: 2 },
  lineTitle: { fontSize: ms(15), fontFamily: font.medium },
  lineSub: { fontSize: ms(12), fontFamily: font.regular },
});
