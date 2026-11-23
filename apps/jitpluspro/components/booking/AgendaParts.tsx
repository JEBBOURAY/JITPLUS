import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from '@/components/AppText';
import { Plus } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useDir } from '@/hooks/useDir';
import { font, icon } from '@/constants/design';
import { fieldFill } from '@/components/settings/surface';
import { capitalizeFirst } from '@/components/booking/BookingUI';
import { MS_PER_MIN } from '@/utils/bookingTime';
import {
  bookingClientLabel,
  formatBookingTime,
  formatDuration,
  minutesToHhmm,
  pendingExpiresAt,
  type MerchantBooking,
} from '@jitplus/shared/src/booking';

// Rows and buttons of the agenda screen (app/agenda/index.tsx).

/** The flat buttons of the loyalty card screen. */
export function FillButton({ label, onPress, primary, disabled, busy, style }: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const color = primary ? '#FFFFFF' : theme.textSecondary;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || busy}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={[styles.fillBtn, { backgroundColor: primary ? theme.primary : fieldFill(theme), opacity: disabled && !busy ? 0.55 : 1 }, style]}
    >
      {busy
        ? <ActivityIndicator size="small" color={color} />
        : <Text style={[styles.fillBtnText, { color }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>{label}</Text>}
    </TouchableOpacity>
  );
}

/** One day of the week strip: its name, its number, and a dot when something is on. */
export const DayCell = React.memo(function DayCell({ ymd, weekday, day, label, selected, isToday, past, count, closed, onPress }: {
  ymd: string;
  weekday: string;
  day: string;
  label: string;
  selected: boolean;
  isToday: boolean;
  /** Before today: shown quieter, the eye goes to what is still to come. */
  past: boolean;
  count: number;
  closed: boolean;
  onPress: (ymd: string) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const main = selected ? '#FFFFFF' : isToday ? theme.primary : past ? theme.textMuted : theme.text;
  const mark = selected ? '#FFFFFF' : closed ? theme.warning : past ? theme.textMuted : theme.primary;
  return (
    <TouchableOpacity
      onPress={() => onPress(ymd)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={[label, `${t('booking.summary.day')} ${count}`, closed ? t('booking.closedShort') : null].filter(Boolean).join(', ')}
      style={[styles.dayCell, { backgroundColor: selected ? theme.primary : fieldFill(theme) }]}
    >
      <Text style={[styles.dayName, { color: selected ? 'rgba(255,255,255,0.8)' : theme.textMuted }]} numberOfLines={1} maxFontSizeMultiplier={1.1}>
        {weekday}
      </Text>
      <Text style={[styles.dayNumber, { color: main }]} maxFontSizeMultiplier={1.1}>{day}</Text>
      {/* The number of bookings, so a busy day reads at a glance; a dot for a closure without bookings. */}
      {count > 0 ? (
        <Text style={[styles.dayCount, { color: mark }]} maxFontSizeMultiplier={1.1}>{count}</Text>
      ) : (
        <View style={[styles.dayDot, { backgroundColor: closed ? mark : 'transparent' }]} />
      )}
    </TouchableOpacity>
  );
});

/** A free stretch of the day between bookings: one tap adds a booking at its start. */
export const FreeRow = React.memo(function FreeRow({ startMin, endMin, onPress }: {
  startMin: number;
  endMin: number;
  onPress: (startMin: number) => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  const range = `${minutesToHhmm(startMin)} – ${minutesToHhmm(endMin)}`;
  return (
    <TouchableOpacity
      onPress={() => onPress(startMin)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${t('booking.free')} ${range}`}
      accessibilityHint={t('booking.freeHint')}
      style={[styles.freeRow, { flexDirection: row, borderColor: theme.border }]}
    >
      <Text style={[styles.freeText, styles.shrink, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
        {t('booking.free')} · {range} · {formatDuration(endMin - startMin, t)}
      </Text>
      <Plus size={16} color={theme.primary} strokeWidth={icon.stroke} />
    </TouchableOpacity>
  );
});

/** Minutes left (rounded down to the hour past one hour) before an unanswered request expires; null once expired. */
function expiresInMinutes(b: MerchantBooking): number | null {
  const left = Math.round((pendingExpiresAt(b).getTime() - Date.now()) / MS_PER_MIN);
  if (left <= 0) return null;
  return left >= 60 ? Math.floor(left / 60) * 60 : left;
}

/** A request waiting for an answer, with Accept / Decline. */
export const PendingItem = React.memo(function PendingItem({ booking, tz, formatDay, busy, locked, onOpen, onAnswer }: {
  booking: MerchantBooking;
  tz: string;
  formatDay: (date: Date) => string;
  /** This card's answer is being sent */
  busy: boolean;
  /** Any answer is being sent: one at a time, so each error is reported */
  locked: boolean;
  onOpen: (id: string) => void;
  onAnswer: (b: MerchantBooking, kind: 'confirm' | 'decline') => void;
}) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { row, textAlign } = useDir();
  const time = `${formatBookingTime(booking.startsAt, tz)} – ${formatBookingTime(booking.endsAt, tz)}`;
  const left = expiresInMinutes(booking);
  return (
    <View style={styles.pendingItem}>
      <TouchableOpacity onPress={() => onOpen(booking.id)} activeOpacity={0.75} accessibilityRole="button" style={styles.pendingBody}>
        <Text style={[styles.pendingWhen, { color: theme.warning, textAlign }]} maxFontSizeMultiplier={1.3}>
          {capitalizeFirst(formatDay(new Date(booking.startsAt)))} · {time}
        </Text>
        <Text style={[styles.pendingClient, { color: theme.text, textAlign }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {bookingClientLabel(booking)}
        </Text>
        <Text style={[styles.pendingMeta, { color: theme.textSecondary, textAlign }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
          {booking.serviceName}
        </Text>
        {booking.note ? (
          <Text style={[styles.pendingMeta, { color: theme.textMuted, textAlign }]} numberOfLines={2} maxFontSizeMultiplier={1.3}>
            « {booking.note} »
          </Text>
        ) : null}
        {/* Unanswered, the request expires: the client is told, the slot is lost. */}
        {left !== null && (
          <Text style={[styles.pendingExpiry, { color: left <= 120 ? theme.danger : theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
            {t('booking.pending.expiresIn', { time: formatDuration(left, t) })}
          </Text>
        )}
      </TouchableOpacity>
      <View style={[styles.pendingActions, { flexDirection: row }]}>
        <FillButton label={t('booking.actions.decline')} onPress={() => onAnswer(booking, 'decline')} disabled={locked} style={styles.flex} />
        <FillButton primary label={t('booking.actions.confirm')} onPress={() => onAnswer(booking, 'confirm')} busy={busy} disabled={locked} style={styles.flex} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },

  freeRow: { alignItems: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingHorizontal: 14, minHeight: 44 },
  freeText: { flex: 1, fontSize: 13, fontFamily: font.medium },

  dayCell: { flex: 1, minHeight: 60, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 6 },
  dayName: { fontSize: 11, fontFamily: font.medium, textTransform: 'capitalize' },
  dayNumber: { fontSize: 16, fontFamily: font.semibold },
  dayDot: { width: 5, height: 5, borderRadius: 2.5, marginVertical: 4.5 },
  dayCount: { fontSize: 11, lineHeight: 14, fontFamily: font.semibold },

  pendingItem: { gap: 10 },
  pendingBody: { gap: 3 },
  pendingWhen: { fontSize: 12, lineHeight: 17, fontFamily: font.semibold },
  pendingClient: { fontSize: 15, fontFamily: font.semibold },
  pendingMeta: { fontSize: 13, fontFamily: font.regular },
  pendingExpiry: { fontSize: 12, fontFamily: font.medium },
  pendingActions: { gap: 10 },

  fillBtn: { alignItems: 'center', justifyContent: 'center', minHeight: 50, paddingHorizontal: 8, borderRadius: 12 },
  fillBtnText: { fontSize: 15, fontFamily: font.semibold },
});
