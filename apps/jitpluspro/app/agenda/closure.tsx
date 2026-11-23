import { useState } from 'react';
import { StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useAuthStore } from '@/stores/authStore';
import { useCreateClosure } from '@/hooks/queries/booking';
import { getErrorMessage } from '@/utils/error';
import { Button, FieldLabel, Input, Notice, ScreenHeader, Section } from '@/components/scratch/ScratchUI';
import { DateField } from '@/components/scratch/DateField';
import { OwnerOnlyNotice } from '@/components/stores/StoreUi';
import { SwitchRow, useBookingTz } from '@/components/booking/BookingUI';
import { parseTimeInput, wallTimeToIso, ymdIn } from '@/utils/bookingTime';
import { addDaysToYmd } from '@jitplus/shared/src/booking';
import { TIME_KEYBOARD } from '@/utils/bookingTime';

/** Holidays or a day off: whole days or a few hours. */
export default function BookingClosureScreen() {
  const shouldWait = useRequireAuth();
  const isTeamMember = useAuthStore((s) => s.isTeamMember);
  const theme = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tz = useBookingTz(!shouldWait && !isTeamMember);
  const today = ymdIn(new Date(), tz);
  const create = useCreateClosure();

  const [startDay, setStartDay] = useState(today);
  const [endDay, setEndDay] = useState(today);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState('14:00');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (shouldWait) return null;
  if (isTeamMember) return <OwnerOnlyNotice />;

  const submit = () => {
    setError(null);
    let startsAt: string;
    let endsAt: string;
    if (allDay) {
      startsAt = wallTimeToIso(startDay, 0, tz);
      endsAt = wallTimeToIso(addDaysToYmd(endDay, 1), 0, tz);
    } else {
      const a = parseTimeInput(startTime);
      const b = parseTimeInput(endTime);
      if (a === null || b === null) return setError(t('booking.hours.errFormat'));
      startsAt = wallTimeToIso(startDay, a, tz);
      endsAt = wallTimeToIso(endDay, b, tz);
    }
    if (endsAt <= startsAt) return setError(t('booking.closure.errOrder'));
    create.mutate(
      { startsAt, endsAt, ...(reason.trim() && { reason: reason.trim() }) },
      {
        onSuccess: ({ affectedBookings }) => {
          // Bookings in the closure are kept: the merchant decides what to do with them.
          if (affectedBookings > 0) {
            // Straight to the day concerned, where each booking can be moved or cancelled.
            Alert.alert(t('booking.closure.affectedTitle'), t('booking.closure.affected', { count: affectedBookings }), [
              { text: t('common.gotIt'), style: 'cancel', onPress: () => router.back() },
              { text: t('booking.closure.seeBookings'), onPress: () => router.dismissTo({ pathname: '/agenda', params: { date: startDay } }) },
            ]);
          } else {
            router.back();
          }
        },
        onError: (err) => setError(getErrorMessage(err, t('booking.setup.saveError'))),
      },
    );
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: theme.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t('booking.closure.addTitle')} onBack={() => router.back()} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Section title={t('booking.closure.when')}>
          {/* The kind of closure first: it decides which fields follow. */}
          <SwitchRow title={t('booking.closure.allDay')} hint={t('booking.closure.allDayHint')} value={allDay} onChange={setAllDay} />
          <DateField
            label={t('booking.closure.from')}
            value={startDay}
            minYmd={today}
            onChange={(ymd) => {
              setStartDay(ymd);
              if (endDay < ymd) setEndDay(ymd);
            }}
          />
          {allDay ? null : (
            <>
              <FieldLabel text={t('booking.closure.fromTime')} />
              <Input value={startTime} onChangeText={setStartTime} keyboardType={TIME_KEYBOARD} maxLength={5} placeholder="12:00" accessibilityLabel={t('booking.closure.fromTime')} />
            </>
          )}
          <DateField label={t('booking.closure.to')} value={endDay} minYmd={startDay} onChange={setEndDay} />
          {allDay ? null : (
            <>
              <FieldLabel text={t('booking.closure.toTime')} />
              <Input value={endTime} onChangeText={setEndTime} keyboardType={TIME_KEYBOARD} maxLength={5} placeholder="14:00" accessibilityLabel={t('booking.closure.toTime')} />
            </>
          )}
        </Section>

        <Section>
          <FieldLabel text={t('booking.closure.reason')} hint={t('booking.optional')} />
          <Input value={reason} onChangeText={setReason} maxLength={200} placeholder={t('booking.closure.reasonPlaceholder')} />
        </Section>

        {error ? <Notice tone="danger" text={error} /> : null}
        <Button label={t('booking.closure.save')} onPress={submit} loading={create.isPending} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },
});
