import { useState } from 'react';
import { toast } from '@/components/ui/Toast';
import { View, StyleSheet, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from '@/components/AppText';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getErrorStatus } from '@jitplus/shared';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useBooking, useRescheduleBooking } from '@/hooks/queries/booking';
import { getErrorMessage } from '@/utils/error';
import { hapticSuccess } from '@/utils/haptics';
import { ms } from '@/utils/responsive';
import { font } from '@/constants/design';
import { Button, Notice, ScreenHeader, Section } from '@/components/scratch/ScratchUI';
import { capitalizeFirst, useBookingTz, useDayFormatter } from '@/components/booking/BookingUI';
import { DayPicker } from '@/components/booking/DayPicker';
import { useDayFreeStarts } from '@/components/booking/useDayFreeStarts';
import { StartTimePicker } from '@/components/booking/StartTimePicker';
import { MS_PER_MIN, parseTimeInput, wallTimeToIso, ymdIn } from '@/utils/bookingTime';
import { bookingClientLabel, formatBookingTime, minutesToHhmm } from '@jitplus/shared/src/booking';
import { useDir } from '@/hooks/useDir';

/**
 * Moves a booking to another day or time, same service and duration. Free slots
 * first (the booking itself does not count as busy), any other time allowed,
 * like a booking taken at the counter.
 */
export default function MoveBookingScreen() {
  const shouldWait = useRequireAuth();
  const theme = useTheme();
  const { t } = useLanguage();
  const { textAlign } = useDir();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tz = useBookingTz(!shouldWait);
  const formatDay = useDayFormatter(tz);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: booking, isLoading } = useBooking(shouldWait ? undefined : id);
  const move = useRescheduleBooking();
  const today = ymdIn(new Date(), tz);

  const current = booking ? ymdIn(new Date(booking.startsAt), tz) : today;
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? (current >= today ? current : today);
  const [time, setTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  // What the booking holds: its duration plus the buffer after it.
  const needMin = booking
    ? Math.round((new Date(booking.blockedUntil).getTime() - new Date(booking.startsAt).getTime()) / MS_PER_MIN)
    : null;
  const { freeStarts, loading, loadError } = useDayFreeStarts({ date, tz, needMin, ignoreId: booking?.id, enabled: !shouldWait && !!booking });
  const startMin = parseTimeInput(time);

  if (shouldWait) return null;

  const header = <ScreenHeader title={t('booking.move.title')} onBack={() => router.back()} />;
  if (!booking) {
    return (
      <View style={[styles.container, { backgroundColor: theme.bg }]}>
        {header}
        {isLoading ? <ActivityIndicator color={theme.primary} style={styles.loader} /> : <Notice tone="danger" text={t('booking.detail.loadError')} />}
      </View>
    );
  }

  const currentLabel = `${capitalizeFirst(formatDay(new Date(booking.startsAt)))} · ${formatBookingTime(booking.startsAt, tz)}`;

  const submit = () => {
    setError(null);
    if (!time.trim()) return setError(t('booking.move.pickTime'));
    if (startMin === null || startMin >= 1440) return setError(t('booking.new.errTime'));
    move.mutate(
      { id: booking.id, startsAt: wallTimeToIso(date, startMin, tz) },
      {
        onSuccess: () => {
          hapticSuccess();
          router.back();
        },
        onError: (err) => {
          const msg = getErrorMessage(err, t('booking.move.error'));
          // 409: the new time overlaps another booking, shown by the form.
          if (getErrorStatus(err) === 409) setError(msg);
          else toast.error(msg);
        },
      },
    );
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {header}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Section>
          <Text style={[styles.client, { color: theme.text, textAlign }]} maxFontSizeMultiplier={1.3}>
            {bookingClientLabel(booking)} · {booking.serviceName}
          </Text>
          <Text style={[styles.hint, { color: theme.textMuted, textAlign }]} maxFontSizeMultiplier={1.3}>
            {t('booking.move.current', { when: currentLabel })}
          </Text>
        </Section>

        <Section title={t('booking.move.newDay')}>
          <DayPicker
            label={t('booking.new.date')}
            value={date}
            today={today}
            onChange={(ymd) => {
              setPicked(ymd);
              setTime('');
            }}
          />
          <StartTimePicker freeStarts={freeStarts} loading={loading} loadError={loadError} ready time={time} onChange={setTime} />
        </Section>

        {booking.client ? <Notice text={t('booking.move.clientTold')} /> : null}
        {error ? <Notice tone="danger" text={error} /> : null}
        <Button
          label={startMin !== null && startMin < 1440 ? t('booking.move.submit', { time: minutesToHhmm(startMin) }) : t('booking.move.title')}
          onPress={submit}
          loading={move.isPending}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { marginTop: 24 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
  client: { fontSize: ms(16), fontFamily: font.semibold },
  hint: { fontSize: ms(13), fontFamily: font.regular },
});
