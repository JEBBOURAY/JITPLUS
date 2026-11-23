import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, CalendarX } from 'lucide-react-native';

import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import Skeleton from '@/components/Skeleton';
import {
  BookingBottomBar, BookingHeader, BookingMerchantStrip, BookingPrimaryButton, BookingSectionTitle, BookingState, bookingStyles,
} from '@/components/booking/BookingParts';
import BookingDone from '@/components/booking/BookingDone';
import BookingRecap from '@/components/booking/BookingRecap';
import DayStrip from '@/components/booking/DayStrip';
import ServiceList from '@/components/booking/ServiceList';
import SlotGrid from '@/components/booking/SlotGrid';
import { useMerchantById } from '@/hooks/useQueryHooks';
import {
  DEFAULT_BOOKING_TZ, useBookingAvailability, useBookingAvailableDays, useBookingOffer,
} from '@/hooks/useBookingHooks';
import { useBookingSubmit } from '@/hooks/useBookingSubmit';
import { bookableDays, dayChipParts, formatYmdLong, groupSlotsByPeriod } from '@/utils/booking';
import { haptic } from '@/utils/haptics';
import { isEntityId } from '@/utils/ids';
import { hp, ms, wp } from '@/utils/responsive';
import { formatBookingTime, type ClientBooking } from '@jitplus/shared/src/booking';
export { ScreenErrorBoundary as ErrorBoundary } from '@/components/ScreenErrorBoundary';

type Step = 'pick' | 'recap' | 'done';

const DEFAULT_MAX_ADVANCE_DAYS = 30;

export default function BookScreen() {
  const { merchantId, serviceId: initialServiceId } = useLocalSearchParams<{ merchantId: string; serviceId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { t, locale } = useLanguage();

  const validId = isEntityId(merchantId);
  const offerQuery = useBookingOffer(merchantId, validId);
  const offer = offerQuery.data;
  const { data: merchant } = useMerchantById(merchantId, validId);
  const tz = offer?.timeZone || DEFAULT_BOOKING_TZ;
  // The shop accepts each request: the recap must not promise a confirmed booking.
  const needsApproval = offer?.autoConfirm === false;
  const services = useMemo(() => offer?.services ?? [], [offer?.services]);

  const [step, setStep] = useState<Step>('pick');
  // What the client chose. The service and day shown are derived from it (below),
  // so a choice that is no longer offered falls back without an effect.
  const [pickedServiceId, setServiceId] = useState<string | undefined>(initialServiceId);
  const [pickedDate, setDate] = useState<string>();
  const [slotStart, setSlotStart] = useState<string>();
  const [note, setNote] = useState('');
  const [result, setResult] = useState<ClientBooking | null>(null);

  const days = useMemo(
    () => bookableDays(tz, offer?.maxAdvanceDays ?? DEFAULT_MAX_ADVANCE_DAYS),
    // Recomputed when the offer arrives; a screen left open past midnight keeps yesterday, the API returns no slot for it.
    [tz, offer?.maxAdvanceDays],
  );
  const dayChips = useMemo(
    () => days.map((ymd) => ({ ymd, ...dayChipParts(ymd, locale), label: formatYmdLong(ymd, locale) })),
    [days, locale],
  );

  // The chosen service while offered (e.g. tapped on the shop page); a single service needs no choice.
  const service = services.find((s) => s.id === pickedServiceId) ?? (services.length === 1 ? services[0] : undefined);
  const serviceId = service?.id;

  // Days with a free slot: the others are greyed out.
  const availableDays = useBookingAvailableDays(merchantId, serviceId);
  const openDays = useMemo(
    () => (availableDays.data ? new Set(availableDays.data.days) : null),
    [availableDays.data],
  );
  // The client's day while listed (the strip is rebuilt in the merchant zone once the offer
  // arrives), else the first day with a free slot rather than a full one, else the first day.
  const date = pickedDate && days.includes(pickedDate)
    ? pickedDate
    : (openDays && days.find((d) => openDays.has(d))) || days[0];
  const nextOpenDay = openDays ? days.find((d) => (!date || d > date) && openDays.has(d)) : undefined;

  // Wait for the days before asking for a day's slots: today's were fetched
  // first, so a full today flashed "no slot" before the jump to the first free
  // day (and cost a request for nothing on a weak network).
  const daysSettled = !serviceId || !availableDays.isLoading;
  const availability = useBookingAvailability(merchantId, serviceId, daysSettled ? date : undefined);
  const slots = useMemo(() => availability.data?.slots ?? [], [availability.data]);
  const slotTz = availability.data?.timeZone || tz;
  const slotLabels = useMemo(() => slots.map((s) => formatBookingTime(s.startsAt, slotTz)), [slots, slotTz]);
  const slotGroups = useMemo(() => groupSlotsByPeriod(slotLabels), [slotLabels]);

  // A slot that vanished on refresh is no longer selected.
  const selectedSlot = slots.find((s) => s.startsAt === slotStart);

  const onBooked = useCallback((booking: ClientBooking) => {
    setResult(booking);
    setStep('done');
  }, []);
  const onSlotTaken = useCallback(() => {
    setSlotStart(undefined);
    setStep('pick');
  }, []);
  const { startAttempt, submit, isPending: submitting } = useBookingSubmit(merchantId, { onBooked, onSlotTaken });

  const goBack = useCallback(() => {
    if (step === 'recap') { if (!submitting) setStep('pick'); return; }
    if (router.canGoBack()) router.back();
    else if (validId) router.replace({ pathname: '/merchant/[id]', params: { id: merchantId } });
    else router.replace('/(tabs)');
  }, [step, submitting, router, validId, merchantId]);

  // Same on iOS, where the edge swipe is not a BackHandler event: it left the
  // whole flow from the recap, losing the slot and the note, even mid-submit.
  usePreventRemove(step === 'recap', () => {
    if (!submitting) setStep('pick');
  });

  // Android back on the recap returns to the slot choice, and never interrupts a submit.
  // Kept next to usePreventRemove: when this screen is the only route (opened from a
  // link), a hardware back dispatches no navigation action and would leave the app.
  useEffect(() => {
    if (step !== 'recap') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!submitting) setStep('pick');
      return true;
    });
    return () => sub.remove();
  }, [step, submitting]);

  const pickService = useCallback((id: string) => {
    haptic();
    setServiceId(id);
    setSlotStart(undefined);
  }, []);
  const pickDay = useCallback((ymd: string) => {
    haptic();
    setDate(ymd);
    setSlotStart(undefined);
  }, []);
  const pickSlot = useCallback((iso: string) => {
    haptic();
    setSlotStart(iso);
  }, []);

  const goRecap = useCallback(() => {
    if (!selectedSlot) return;
    haptic();
    startAttempt(service?.id, slotStart);
    setStep('recap');
  }, [selectedSlot, startAttempt, service?.id, slotStart]);

  const confirm = useCallback(() => {
    if (!slotStart || !service) return;
    submit({ serviceId: service.id, startsAt: slotStart, note });
  }, [slotStart, service, submit, note]);

  const refetchSlots = availability.refetch;
  const retrySlots = useCallback(() => { void refetchSlots(); }, [refetchSlots]);

  const renderPick = () => (
    <>
      <ScrollView contentContainerStyle={bookingStyles.scrollBody} showsVerticalScrollIndicator={false}>
        <BookingMerchantStrip merchant={merchant} />

        {/* 1. Service */}
        <BookingSectionTitle label={t('booking.stepService')} />
        <ServiceList services={services} selectedId={serviceId} currency={offer?.currency} onPick={pickService} />

        {/* 2. Day and time */}
        {!!service && (
          <>
            <BookingSectionTitle label={t('booking.stepDay')} />
            <DayStrip days={dayChips} selected={date} openDays={openDays} onPick={pickDay} />
            {/* Names the day: the selected chip may be scrolled out of view. */}
            <BookingSectionTitle label={date ? `${t('booking.stepTime')} · ${formatYmdLong(date, locale)}` : t('booking.stepTime')} />
            <SlotGrid
              loading={!daysSettled || availability.isLoading}
              error={availability.isError}
              onRetry={retrySlots}
              slots={slots}
              labels={slotLabels}
              groups={slotGroups}
              selected={slotStart}
              onPick={pickSlot}
              nextOpenDay={nextOpenDay}
              onPickDay={pickDay}
            />
          </>
        )}
      </ScrollView>

      <BookingBottomBar>
        <BookingPrimaryButton label={t('booking.continue')} onPress={goRecap} disabled={!selectedSlot} />
      </BookingBottomBar>
    </>
  );

  const renderBody = () => {
    if (step === 'done') {
      if (!result) return null;
      return (
        <BookingDone
          pending={result.status === 'PENDING'}
          booking={{
            merchant,
            serviceName: result.serviceName,
            startsAt: result.startsAt,
            timeZone: result.timeZone || slotTz,
            durationMin: service?.durationMin,
            price: result.price,
            currency: result.merchant.currency,
          }}
          onViewBooking={() => router.replace({ pathname: '/bookings/[id]', params: { id: result.id } })}
          onDone={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        />
      );
    }
    if (offerQuery.isLoading) {
      return (
        <View style={bookingStyles.scrollBody}>
          <Skeleton width={wp(160)} height={hp(18)} borderRadius={6} />
          <Skeleton width="100%" height={hp(76)} borderRadius={16} />
          <Skeleton width="100%" height={hp(76)} borderRadius={16} />
        </View>
      );
    }
    if (offerQuery.isError) {
      return (
        <BookingState
          icon={<AlertCircle size={ms(40)} color={theme.danger} />}
          message={t('booking.offerError')}
          onRetry={() => { void offerQuery.refetch(); }}
        />
      );
    }
    if (!offer?.enabled || services.length === 0) {
      return <BookingState icon={<CalendarX size={ms(40)} color={theme.textMuted} strokeWidth={1.6} />} message={t('booking.unavailable')} />;
    }
    if (step === 'recap') {
      if (!slotStart || !service) return null;
      return (
        <BookingRecap
          booking={{
            merchant,
            serviceName: service.nom,
            startsAt: slotStart,
            timeZone: slotTz,
            durationMin: service.durationMin,
            price: service.priceFrom,
            currency: offer?.currency,
          }}
          note={note}
          onChangeNote={setNote}
          cancelDeadlineHours={offer?.cancelDeadlineHours ?? 0}
          needsApproval={needsApproval}
          submitting={submitting}
          onConfirm={confirm}
        />
      );
    }
    return renderPick();
  };

  const title = step === 'done' ? t('booking.doneHeader') : step === 'recap' ? t('booking.recapTitle') : t('booking.title');

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top + hp(8) }]}>
      <BookingHeader title={title} onBack={step !== 'done' ? goBack : undefined} />
      {renderBody()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
