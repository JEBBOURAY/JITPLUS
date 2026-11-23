import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useLanguage } from '@/contexts/LanguageContext';
import { bookingKeys, useCreateBooking } from '@/hooks/useBookingHooks';
import { BOOKING_NOTE_MAX, classifyBookingError, makeIdempotencyKey } from '@/utils/booking';
import { extractErrorCode, extractErrorMessage } from '@/utils/errorMessage';
import { hapticError, hapticSuccess } from '@/utils/haptics';
import type { ClientBooking } from '@jitplus/shared/src/booking';

interface Options {
  onBooked: (booking: ClientBooking) => void;
  /** Someone took the slot meanwhile: back to the choice (the slots are refreshed here). */
  onSlotTaken: () => void;
}

/**
 * Sends a booking with one idempotency key per attempt, and routes its errors
 * (slot taken, account to verify, too many upcoming bookings, other).
 */
export function useBookingSubmit(merchantId: string, { onBooked, onSlotTaken }: Options) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const createBooking = useCreateBooking(merchantId);
  // One key per attempt: a retry of the same recap replays, a new slot is a new attempt.
  const keyRef = useRef<string | null>(null);
  // The service + slot the key was made for: an unanswered attempt (timeout)
  // may already be booked, so the same choice must retry under the same key.
  const choiceRef = useRef<string | null>(null);

  /** Called when the recap opens for this service and slot. */
  const startAttempt = useCallback((serviceId: string | undefined, startsAt: string | undefined) => {
    const choice = `${serviceId}|${startsAt}`;
    if (!keyRef.current || choiceRef.current !== choice) {
      keyRef.current = makeIdempotencyKey();
      choiceRef.current = choice;
    }
  }, []);

  const submit = useCallback((input: { serviceId: string; startsAt: string; note: string }) => {
    if (createBooking.isPending) return;
    if (!keyRef.current) keyRef.current = makeIdempotencyKey();
    const trimmed = input.note.trim();
    createBooking.mutate({
      serviceId: input.serviceId,
      startsAt: input.startsAt,
      ...(trimmed ? { note: trimmed.slice(0, BOOKING_NOTE_MAX) } : {}),
      idempotencyKey: keyRef.current,
    }, {
      onSuccess: (booking) => {
        hapticSuccess();
        keyRef.current = null;
        onBooked(booking);
      },
      onError: (err) => {
        hapticError();
        const status = isAxiosError(err) ? err.response?.status : undefined;
        const message = extractErrorMessage(err);
        const code = extractErrorCode(err);
        const kind = classifyBookingError(status, message, code);
        // The server answered: this attempt is over. A network failure keeps the key for the retry.
        if (status) keyRef.current = null;
        if (kind === 'slotTaken') {
          onSlotTaken();
          void queryClient.invalidateQueries({ queryKey: bookingKeys.availabilityOf(merchantId) });
          Alert.alert(t('booking.slotTakenTitle'), t('booking.slotTakenBody'));
        } else if (kind === 'verify') {
          Alert.alert(t('booking.verifyTitle'), t('booking.verifyBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('booking.verifyCta'), onPress: () => router.push('/edit-profile') },
          ]);
        } else if (code === 'error.booking.maxUpcoming') {
          // The way forward is in the list: cancel or keep an existing booking.
          Alert.alert(t('booking.errorTitle'), message, [
            { text: t('common.close'), style: 'cancel' },
            { text: t('booking.myBookings'), onPress: () => router.push('/bookings') },
          ]);
        } else {
          Alert.alert(t('booking.errorTitle'), message);
        }
      },
    });
  }, [createBooking, merchantId, onBooked, onSlotTaken, queryClient, router, t]);

  return { startAttempt, submit, isPending: createBooking.isPending };
}
