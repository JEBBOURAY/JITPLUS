import { AxiosInstance } from 'axios';
import type { CouponDto, ScratchCardDto } from '@jitplus/shared/src/scratch';

export type ScratchCardListStatus = 'PENDING' | 'SCRATCHED';
export type ClientCouponStatus = 'active' | 'used' | 'expired';

export interface ScratchResult {
  card: ScratchCardDto;
  coupon: CouponDto;
}

export function createScratchMethods(http: AxiosInstance) {
  return {
    async getScratchCards(status?: ScratchCardListStatus): Promise<ScratchCardDto[]> {
      const { data } = await http.get('/scratch/client/cards', { params: status ? { status } : {} });
      return data;
    },
    async getScratchCard(cardId: string): Promise<ScratchCardDto> {
      const { data } = await http.get(`/scratch/client/cards/${encodeURIComponent(cardId)}`);
      return data;
    },
    async getScratchCardByCampaign(campaignId: string): Promise<ScratchCardDto> {
      const { data } = await http.get(`/scratch/client/cards/by-campaign/${encodeURIComponent(campaignId)}`);
      return data;
    },
    async markScratchCardOpened(cardId: string): Promise<{ ok: true }> {
      const { data } = await http.post(`/scratch/client/cards/${encodeURIComponent(cardId)}/open`);
      return data;
    },
    /** Idempotent: a retry after a network failure returns the same coupon. */
    async scratchCard(cardId: string): Promise<ScratchResult> {
      const { data } = await http.post(`/scratch/client/cards/${encodeURIComponent(cardId)}/scratch`, undefined, { idempotent: true });
      return data;
    },
    async getClientCoupons(status?: ClientCouponStatus): Promise<CouponDto[]> {
      const { data } = await http.get('/scratch/client/coupons', { params: status ? { status } : {} });
      return data;
    },
    /** The owner gets `qrToken` on this route (needed to show the QR in store). */
    async getClientCoupon(couponId: string): Promise<CouponDto> {
      const { data } = await http.get(`/scratch/client/coupons/${encodeURIComponent(couponId)}`);
      return data;
    },
  };
}
