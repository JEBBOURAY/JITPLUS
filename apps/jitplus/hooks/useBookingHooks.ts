/**
 * React Query hooks for appointment booking (client app).
 * Real-time invalidation is wired in useRealtimeEvents (booking:client_changed)
 * and via FCM data payloads (event 'booking').
 */
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { isBookingNotFound } from '@/utils/booking';
import { isEntityId } from '@/utils/ids';
import { invalidateStamps, queryKeys } from './useQueryHooks';
import type { ClientBookingScope, CreateBookingInput } from '@/services/api/booking';
import type { AvailableDays, BookingSearchShop, ClientBooking, DayAvailability, MerchantBookingOffer } from '@jitplus/shared/src/booking';
import type { Coords } from '@/hooks/useKnownLocation';

/** Zone used until the offer (or an older server's response) says otherwise. */
export const DEFAULT_BOOKING_TZ = 'Africa/Casablanca';

export const bookingKeys = {
  all: ['booking'] as const,
  offer: (merchantId: string) => ['booking', 'offer', merchantId] as const,
  availabilityOf: (merchantId: string) => ['booking', 'availability', merchantId] as const,
  /** Under availabilityOf: refreshed with the slots after a booking or a cancel. */
  availableDays: (merchantId: string, serviceId: string) => ['booking', 'availability', merchantId, 'days', serviceId] as const,
  availability: (merchantId: string, serviceId: string, date: string) =>
    ['booking', 'availability', merchantId, serviceId, date] as const,
  /** Prefix of every "my bookings" query (lists and details). */
  mine: ['booking', 'mine'] as const,
  list: (scope: ClientBookingScope) => ['booking', 'mine', 'list', scope] as const,
  detail: (id: string) => ['booking', 'mine', 'detail', id] as const,
  /** Prefix of every booking search (the merchant order depends on the caller's cards and blocks). */
  searches: ['booking', 'search'] as const,
  /** Position rounded to ~1 km so small GPS moves reuse the cache. */
  search: (signedIn: boolean, lat: number | null, lng: number | null) => ['booking', 'search', signedIn, lat, lng] as const,
} as const;

/** After a booking changes anywhere: the client's lists/details and that merchant's slots. */
export function invalidateBookings(qc: QueryClient, merchantId?: string) {
  qc.invalidateQueries({ queryKey: bookingKeys.mine });
  qc.invalidateQueries({ queryKey: merchantId ? bookingKeys.availabilityOf(merchantId) : ['booking', 'availability'] });
}

export function useBookingOffer(merchantId: string | undefined, enabled = true) {
  return useQuery<MerchantBookingOffer>({
    queryKey: bookingKeys.offer(merchantId ?? ''),
    queryFn: () => api.getBookingOffer(merchantId!),
    enabled: enabled && isEntityId(merchantId),
    staleTime: 60 * 1000,
  });
}

export function useBookingAvailability(
  merchantId: string | undefined,
  serviceId: string | undefined,
  date: string | undefined,
) {
  return useQuery<DayAvailability>({
    queryKey: bookingKeys.availability(merchantId ?? '', serviceId ?? '', date ?? ''),
    queryFn: () => api.getBookingAvailability(merchantId!, { serviceId: serviceId!, date: date! }),
    enabled: isEntityId(merchantId) && isEntityId(serviceId) && !!date,
    // Slots go fast: never show a minute-old grid as fresh.
    staleTime: 15 * 1000,
  });
}

/** Days with a free slot for the service (whole bookable window). */
export function useBookingAvailableDays(merchantId: string | undefined, serviceId: string | undefined) {
  return useQuery<AvailableDays>({
    queryKey: bookingKeys.availableDays(merchantId ?? '', serviceId ?? ''),
    queryFn: () => api.getBookingAvailableDays(merchantId!, serviceId!),
    enabled: isEntityId(merchantId) && isEntityId(serviceId),
    staleTime: 60 * 1000,
  });
}

/** ~1 km: the shop list barely changes within it, so small moves reuse the cache (deals use ~110 m, `roundCoord`). */
const roundToKm = (v: number) => Math.round(v * 100) / 100;

/** The "Rendez-vous" tab list: own shops first, then nearest. */
export function useBookingSearch(coords: Coords | null, signedIn: boolean) {
  const lat = coords ? roundToKm(coords.latitude) : null;
  const lng = coords ? roundToKm(coords.longitude) : null;
  return useQuery<{ shops: BookingSearchShop[] }>({
    queryKey: bookingKeys.search(signedIn, lat, lng),
    queryFn: () => api.searchBookingServices(lat != null && lng != null ? { lat, lng } : null),
    staleTime: 5 * 60 * 1000,
  });
}

export function useClientBookings(scope: ClientBookingScope, enabled = true) {
  return useQuery<ClientBooking[]>({
    queryKey: bookingKeys.list(scope),
    queryFn: () => api.getClientBookings(scope),
    staleTime: 30 * 1000,
    enabled,
  });
}

function findCached(qc: QueryClient, id: string): ClientBooking | undefined {
  for (const scope of ['upcoming', 'past'] as const) {
    const hit = qc.getQueryData<ClientBooking[]>(bookingKeys.list(scope))?.find((b) => b.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/** One booking (GET booking/client/bookings/:id); a row already in a list shows while it loads. */
export function useClientBooking(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery<ClientBooking>({
    queryKey: bookingKeys.detail(id ?? ''),
    queryFn: () => api.getClientBooking(id!),
    placeholderData: () => (id ? findCached(qc, id) : undefined),
    enabled: isEntityId(id),
    staleTime: 15 * 1000,
    retry: (count, err) => !isBookingNotFound(err) && count < 2,
  });
}

export function useCreateBooking(merchantId: string | undefined) {
  const qc = useQueryClient();
  return useMutation<ClientBooking, unknown, CreateBookingInput>({
    mutationFn: (input) => api.createBooking(merchantId!, input),
    onSuccess: (booking) => {
      qc.setQueryData(bookingKeys.detail(booking.id), booking);
      invalidateBookings(qc, booking.merchant.id);
      // Every booking also creates the loyalty card at that merchant.
      invalidateStamps(qc);
      qc.invalidateQueries({ queryKey: queryKeys.merchant(booking.merchant.id) });
    },
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation<ClientBooking, unknown, { id: string; reason?: string }>({
    mutationFn: ({ id, reason }) => api.cancelClientBooking(id, reason),
    onSuccess: (booking) => {
      qc.setQueryData(bookingKeys.detail(booking.id), booking);
      invalidateBookings(qc, booking.merchant.id);
    },
    // Refused (too late, changed meanwhile, not found): show the booking as it is now.
    onError: () => { qc.invalidateQueries({ queryKey: bookingKeys.mine }); },
  });
}
