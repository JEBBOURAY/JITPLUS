import { AxiosInstance } from 'axios';
import { Merchant, StampsOverview, QrTokenResponse } from '@/types';
import { getToken } from './storage';
import { pointKey } from '@/utils/merchantPoint';

/** Server-side maximum (PaginationQueryDto). */
const MERCHANTS_PAGE_SIZE = 100;
/** Safety cap: 2000 merchants. Past that the map needs a viewport-based endpoint. */
const MAX_MERCHANT_PAGES = 20;
const PAGE_FETCH_CONCURRENCY = 3;
/** Server-side maximum for the wallet (WalletPaginationQueryDto). */
const WALLET_PAGE_SIZE = 100;
/** Safety cap: 1000 cards. */
const MAX_WALLET_PAGES = 10;

export function createMerchantMethods(http: AxiosInstance) {
  async function fetchMerchantsPage(page = 1, limit = MERCHANTS_PAGE_SIZE): Promise<{ merchants: Merchant[]; totalPages: number }> {
    const token = await getToken();
    const url = token ? '/client/merchants' : '/client-auth/merchants';
    const { data } = await http.get(url, { params: { page, limit } });
    if (Array.isArray(data)) return { merchants: data, totalPages: 1 };
    if (data?.merchants && Array.isArray(data.merchants)) {
      const totalPages = Number(data.pagination?.totalPages);
      return { merchants: data.merchants, totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : 1 };
    }
    if (__DEV__) console.warn('[API] Unexpected getMerchants response shape:', data);
    return { merchants: [], totalPages: 1 };
  }

  return {
    /**
     * The whole wallet. The endpoint is paginated (100 cards a page at most):
     * reading one page with no `limit` showed only the 20 most recent cards.
     */
    async getStampsOverview(): Promise<StampsOverview> {
      const fetchPage = async (page: number) =>
        (await http.get('/client/stamps', { params: { page, limit: WALLET_PAGE_SIZE } })).data as
          StampsOverview & { pagination?: { totalPages?: number } };
      const first = await fetchPage(1);
      const totalPages = Math.min(Number(first.pagination?.totalPages) || 1, MAX_WALLET_PAGES);
      if (totalPages <= 1 || !Array.isArray(first.cards)) return first;
      const cards = [...first.cards];
      let totalStamps = first.totalStamps;
      for (let page = 2; page <= totalPages; page++) {
        const next = await fetchPage(page);
        if (!Array.isArray(next.cards) || next.cards.length === 0) break;
        cards.push(...next.cards);
        totalStamps += next.totalStamps;
      }
      // A card that moved between two page reads must not appear twice.
      const seen = new Set<string>();
      const unique = cards.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
      return { ...first, totalStamps, cards: unique };
    },
    /**
     * Every merchant point (one per merchant + one per extra store). The API caps
     * a page at 100 merchants: reading only the first page dropped everyone after
     * the 100th name in alphabetical order from the map.
     */
    async getMerchants(): Promise<Merchant[]> {
      const first = await fetchMerchantsPage(1);
      const lastPage = Math.min(first.totalPages, MAX_MERCHANT_PAGES);
      const pages = [first.merchants];
      // Small batches: the guest endpoint is throttled per minute.
      for (let start = 2; start <= lastPage; start += PAGE_FETCH_CONCURRENCY) {
        const batch = [];
        for (let p = start; p < start + PAGE_FETCH_CONCURRENCY && p <= lastPage; p++) batch.push(fetchMerchantsPage(p));
        for (const res of await Promise.all(batch)) pages.push(res.merchants);
      }
      // A merchant added or renamed between two page reads can shift into the next page.
      const seen = new Set<string>();
      const all: Merchant[] = [];
      for (const m of pages.flat()) {
        const key = pointKey(m);
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(m);
      }
      return all;
    },
    async getMerchantById(id: string): Promise<Merchant> {
      const token = await getToken();
      const base = token ? '/client/merchants' : '/client-auth/merchants';
      const { data } = await http.get(`${base}/${encodeURIComponent(id)}`);
      return data;
    },
    async joinMerchant(merchantId: string): Promise<{ success: boolean; card: { id: string; stamps: number; createdAt: string } }> {
      const { data } = await http.post(`/client/merchants/${encodeURIComponent(merchantId)}/join`);
      return data;
    },
    async leaveMerchant(merchantId: string): Promise<{ success: boolean }> {
      const { data } = await http.delete(`/client/merchants/${encodeURIComponent(merchantId)}/leave`);
      return data;
    },
    async reportMerchant(
      merchantId: string,
      reason: 'inappropriate' | 'spam' | 'fraud' | 'closed' | 'wrong_info' | 'other',
      details?: string,
    ): Promise<{ success: boolean; message: string }> {
      const { data } = await http.post(`/client/merchants/${encodeURIComponent(merchantId)}/report`, { reason, details });
      return data;
    },
    async blockMerchant(merchantId: string): Promise<{ success: boolean }> {
      const { data } = await http.post(`/client/merchants/${encodeURIComponent(merchantId)}/block`);
      return data;
    },
    async unblockMerchant(merchantId: string): Promise<{ success: boolean }> {
      const { data } = await http.delete(`/client/merchants/${encodeURIComponent(merchantId)}/block`);
      return data;
    },
    async getBlockedMerchants(): Promise<{ merchantId: string; blockedAt: string; id: string; nom: string; logoUrl: string | null; categorie: string }[]> {
      const { data } = await http.get('/client/blocked-merchants');
      return Array.isArray(data) ? data : [];
    },
    async getQrToken(): Promise<QrTokenResponse> {
      const { data } = await http.post('/client-auth/qr-token');
      return data;
    },
  };
}
