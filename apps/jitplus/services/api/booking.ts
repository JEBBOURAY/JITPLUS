import { AxiosInstance } from 'axios';
import type { AvailableDays, BookingSearchShop, ClientBooking, DayAvailability, MerchantBookingOffer } from '@jitplus/shared/src/booking';
import { getToken } from './storage';

export type ClientBookingScope = 'upcoming' | 'past';

export interface CreateBookingInput {
  serviceId: string;
  /** ISO instant of the chosen slot */
  startsAt: string;
  note?: string;
  /** One per booking attempt: a retry returns the same booking. */
  idempotencyKey: string;
}

export function createBookingMethods(http: AxiosInstance) {
  return {
    /**
     * Shops taking bookings and their services: signed in, own shops first and
     * blocked ones left out; then nearest when a position is given.
     */
    async searchBookingServices(pos: { lat: number; lng: number } | null): Promise<{ shops: BookingSearchShop[] }> {
      const token = await getToken();
      const url = token ? '/booking/client/search' : '/booking/merchants/search';
      const { data } = await http.get(url, { params: pos ?? undefined });
      return data;
    },
    /** Public: whether the merchant takes bookings, and its services. */
    async getBookingOffer(merchantId: string): Promise<MerchantBookingOffer> {
      const { data } = await http.get(`/booking/merchants/${encodeURIComponent(merchantId)}/offer`);
      return data;
    },
    /** Public: free slots of one local day (YYYY-MM-DD in the offer's time zone). */
    async getBookingAvailability(
      merchantId: string,
      params: { serviceId: string; date: string },
    ): Promise<DayAvailability> {
      const { data } = await http.get(`/booking/merchants/${encodeURIComponent(merchantId)}/availability`, { params });
      return data;
    },
    /** Public: the days with at least one free slot for the service, so the day strip greys out the others. */
    async getBookingAvailableDays(merchantId: string, serviceId: string): Promise<AvailableDays> {
      const { data } = await http.get(`/booking/merchants/${encodeURIComponent(merchantId)}/availability/days`, { params: { serviceId } });
      return data;
    },
    /** Idempotent through `idempotencyKey`: a replay after a timeout returns the same booking. */
    async createBooking(merchantId: string, input: CreateBookingInput): Promise<ClientBooking> {
      const { data } = await http.post(
        `/booking/client/merchants/${encodeURIComponent(merchantId)}/bookings`,
        input,
        { idempotent: true },
      );
      return data;
    },
    async getClientBookings(scope: ClientBookingScope): Promise<ClientBooking[]> {
      const { data } = await http.get('/booking/client/bookings', { params: { scope } });
      return data;
    },
    async getClientBooking(bookingId: string): Promise<ClientBooking> {
      const { data } = await http.get(`/booking/client/bookings/${encodeURIComponent(bookingId)}`);
      return data;
    },
    async cancelClientBooking(bookingId: string, reason?: string): Promise<ClientBooking> {
      const { data } = await http.post(
        `/booking/client/bookings/${encodeURIComponent(bookingId)}/cancel`,
        reason ? { reason } : {},
      );
      return data;
    },
  };
}
