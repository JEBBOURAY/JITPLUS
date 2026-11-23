import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import api from '@/services/api';
import type {
  AvailabilityException,
  BookableService,
  BookingSettings,
  BookingSetup,
  HourRange,
  MerchantAgenda,
  MerchantBooking,
  MerchantBookingAction,
} from '@jitplus/shared/src/booking';
import { queryKeys, STALE } from './keys';

const BASE = '/booking/merchant';

// ── Payloads (mirror apps/backend/src/booking/dto) ───────────

interface ServiceInput {
  templateId?: string;
  nom?: string;
  description?: string | null;
  durationMin: number;
  bufferMin?: number;
  priceFrom?: number | null;
  isActive?: boolean;
}
type ServicePatch = Partial<Omit<ServiceInput, 'templateId'>>;

interface ClosureInput {
  startsAt: string;
  endsAt: string;
  reason?: string;
}

interface MerchantBookingInput {
  serviceId: string;
  startsAt: string;
  clientId?: string;
  clientName?: string;
  clientPhone?: string;
  note?: string;
}

// ── Queries ───────────────────────────────────────────────────

/** Settings, services, hours, catalogue and closures in one call (also read by team members). */
export function useBookingSetup(enabled = true) {
  return useQuery<BookingSetup>({
    queryKey: queryKeys.bookingSetup,
    queryFn: async () => (await api.get<BookingSetup>(`${BASE}/setup`)).data,
    staleTime: STALE.MEDIUM,
    enabled,
  });
}

/** Bookings and closures over [from, to) (ISO instants, 31 days at most). */
const fetchAgenda = async (from: string, to: string) =>
  (await api.get<MerchantAgenda>(`${BASE}/agenda`, { params: { from, to } })).data;

export function useBookingAgenda(from: string, to: string, enabled = true) {
  return useQuery<MerchantAgenda>({
    queryKey: queryKeys.bookingAgenda(from, to),
    queryFn: () => fetchAgenda(from, to),
    // No placeholder: the previous week would show as this one's, with "no booking" days.
    // The weeks around are prefetched instead (usePrefetchAgenda), so paging shows no loader.
    staleTime: STALE.FAST,
    enabled,
  });
}

/** Loads a range in the background, e.g. the weeks before and after the one on screen. */
export function usePrefetchAgenda() {
  const qc = useQueryClient();
  return useCallback(
    (from: string, to: string) => {
      void qc.prefetchQuery({ queryKey: queryKeys.bookingAgenda(from, to), queryFn: () => fetchAgenda(from, to), staleTime: STALE.FAST });
    },
    [qc],
  );
}

/** Upcoming requests waiting for an answer. */
export function usePendingBookings(enabled = true) {
  return useQuery<MerchantBooking[]>({
    queryKey: queryKeys.bookingPending,
    queryFn: async () => {
      const data = (await api.get<MerchantBooking[]>(`${BASE}/bookings/pending`)).data;
      return Array.isArray(data) ? data : [];
    },
    staleTime: STALE.FAST,
    enabled,
  });
}

/** Number of requests waiting for an answer, for badges. */
export function usePendingBookingsCount(enabled = true) {
  const { data } = usePendingBookings(enabled);
  return data?.length ?? 0;
}

/** A booking already in an agenda or pending list, so the detail opens at once. */
function cachedBooking(qc: QueryClient, id: string): MerchantBooking | undefined {
  const pending = qc.getQueryData<MerchantBooking[]>(queryKeys.bookingPending)?.find((b) => b.id === id);
  if (pending) return pending;
  for (const [, agenda] of qc.getQueriesData<MerchantAgenda>({ queryKey: queryKeys.bookingAgendaRoot })) {
    const hit = agenda?.bookings.find((b) => b.id === id);
    if (hit) return hit;
  }
  return undefined;
}

export function useBooking(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery<MerchantBooking>({
    queryKey: queryKeys.booking(id ?? ''),
    queryFn: async () => (await api.get<MerchantBooking>(`${BASE}/bookings/${id}`)).data,
    enabled: !!id,
    staleTime: STALE.FAST,
    placeholderData: () => (id ? cachedBooking(qc, id) : undefined),
  });
}

// ── Booking mutations ─────────────────────────────────────────

/** Agenda and pending lists change with every booking. */
function invalidateBookings(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: queryKeys.bookingAgendaRoot });
  qc.invalidateQueries({ queryKey: queryKeys.bookingPending });
}

/** The server's answer is the new state of the booking. */
function applySavedBooking(qc: QueryClient, booking: MerchantBooking) {
  if (booking?.id) {
    qc.setQueryData(queryKeys.booking(booking.id), booking);
    // An answered request leaves the list now, not when the refetch lands: the
    // card stayed tappable meanwhile and a second tap answered a 409.
    if (booking.status !== 'PENDING') {
      qc.setQueryData<MerchantBooking[]>(queryKeys.bookingPending, (prev) => prev?.filter((b) => b.id !== booking.id));
    }
  }
  invalidateBookings(qc);
}

export function useBookingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, reason }: { id: string; action: MerchantBookingAction; reason?: string }) =>
      (await api.post<MerchantBooking>(`${BASE}/bookings/${id}/${action}`, reason ? { reason } : {})).data,
    onSuccess: (booking) => applySavedBooking(qc, booking),
    // Usually a 409 (the client cancelled, the slot started…): show the booking as it is now.
    onError: (_err, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.booking(id) });
      invalidateBookings(qc);
    },
  });
}

export function useCreateMerchantBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: MerchantBookingInput) =>
      (await api.post<MerchantBooking>(`${BASE}/bookings`, payload)).data,
    onSuccess: (booking) => applySavedBooking(qc, booking),
  });
}

/** Moves a booking to another start (same duration): POST bookings/:id/reschedule. */
export function useRescheduleBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, startsAt }: { id: string; startsAt: string }) =>
      (await api.post<MerchantBooking>(`${BASE}/bookings/${id}/reschedule`, { startsAt })).data,
    onSuccess: (booking) => applySavedBooking(qc, booking),
  });
}

// ── Setup mutations (owner only) ──────────────────────────────

function useSetupMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>, alsoAgenda = false) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookingSetup });
      if (alsoAgenda) qc.invalidateQueries({ queryKey: queryKeys.bookingAgendaRoot });
    },
  });
}

export function useUpdateBookingSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<BookingSettings>) =>
      (await api.put<BookingSettings>(`${BASE}/settings`, patch)).data,
    onSuccess: (settings) => {
      qc.setQueryData<BookingSetup>(queryKeys.bookingSetup, (old) => (old ? { ...old, settings } : old));
    },
  });
}

export function useCreateBookingService() {
  return useSetupMutation(async (payload: ServiceInput) =>
    (await api.post<BookableService>(`${BASE}/services`, payload)).data);
}

export function useUpdateBookingService() {
  return useSetupMutation(async ({ id, patch }: { id: string; patch: ServicePatch }) =>
    (await api.patch<BookableService>(`${BASE}/services/${id}`, patch)).data);
}

export function useDeleteBookingService() {
  return useSetupMutation(async (id: string) => (await api.delete(`${BASE}/services/${id}`)).data);
}

export function useSetBookingHours() {
  return useSetupMutation(async (ranges: HourRange[]) =>
    (await api.put<{ hours: HourRange[] }>(`${BASE}/hours`, { ranges })).data);
}

export function useCreateClosure() {
  return useSetupMutation(async (payload: ClosureInput) =>
    (await api.post<{ exception: AvailabilityException; affectedBookings: number }>(`${BASE}/exceptions`, payload)).data, true);
}

export function useDeleteClosure() {
  return useSetupMutation(async (id: string) => (await api.delete(`${BASE}/exceptions/${id}`)).data, true);
}
