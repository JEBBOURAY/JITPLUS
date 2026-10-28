import type { AxiosInstance } from 'axios';
import type {
  ClientDealDetail, ClientDealSummary, DealAlertPreferences, DealCitiesResponse, DealEventType,
  DealFeedResponse, DealFeedTab, DealReportReason, DealTeaserResponse,
} from '@jitplus/shared/src/deals';

// Same patterns as the backend DTOs: a value they would reject is dropped
// rather than turning the whole request into a 400.
const CITY_KEY_RE = /^[a-z_]{2,40}$/;
const CATEGORY_RE = /^[A-Z_]{2,30}$/;
const CURSOR_RE = /^\d{1,4}(\.\d{1,4})?$/;

export interface DealPositionQuery {
  lat?: number | null;
  lng?: number | null;
  cityKey?: string | null;
}

export interface DealFeedQuery extends DealPositionQuery {
  tab: DealFeedTab;
  category?: string | null;
  cursor?: string | null;
}

type Params = Record<string, string | number>;

/** ~110 m: enough for distances, and keeps the exact position off the server logs. */
export function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function inRange(value: number | null | undefined, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max;
}

/**
 * Where the feed looks for deals. A chosen city is sent without the GPS
 * position: on the "Autour de moi" tab the server ranks by distance whenever
 * it has a position, which would ignore the city.
 */
export interface DealArea {
  cityKey: string | null;
  lat: number | null;
  lng: number | null;
}

export function dealArea(cityKey: string | null, coords: { latitude: number; longitude: number } | null): DealArea {
  if (cityKey) return { cityKey, lat: null, lng: null };
  return coords
    ? { cityKey: null, lat: roundCoord(coords.latitude), lng: roundCoord(coords.longitude) }
    : { cityKey: null, lat: null, lng: null };
}

export function buildDealPositionParams(q: DealPositionQuery): Params {
  const params: Params = {};
  if (inRange(q.lat, 90) && inRange(q.lng, 180)) {
    params.lat = roundCoord(q.lat);
    params.lng = roundCoord(q.lng);
  }
  if (q.cityKey && CITY_KEY_RE.test(q.cityKey)) params.cityKey = q.cityKey;
  return params;
}

export function buildDealFeedParams(q: DealFeedQuery): Params {
  const params: Params = { tab: q.tab, ...buildDealPositionParams(q) };
  if (q.category && CATEGORY_RE.test(q.category)) params.category = q.category;
  if (q.cursor && CURSOR_RE.test(q.cursor)) params.cursor = q.cursor;
  return params;
}

export interface DealReportResult {
  success: boolean;
  alreadyReported: boolean;
}

export type DealAlertUpdate = Partial<DealAlertPreferences>;

/** Body of PATCH /client/deal-alerts: only the fields given, with the values the DTO accepts. */
export function buildDealAlertUpdate(u: DealAlertUpdate): DealAlertUpdate {
  const body: DealAlertUpdate = {};
  if (typeof u.enabled === 'boolean') body.enabled = u.enabled;
  if (typeof u.online === 'boolean') body.online = u.online;
  if (u.cityKey === null || (typeof u.cityKey === 'string' && CITY_KEY_RE.test(u.cityKey))) body.cityKey = u.cityKey;
  if (Array.isArray(u.categories)) body.categories = [...new Set(u.categories.filter((c) => CATEGORY_RE.test(c)))];
  return body;
}

function toDealAlertPreferences(data: Partial<DealAlertPreferences> | null | undefined): DealAlertPreferences {
  return {
    enabled: data?.enabled === true,
    cityKey: typeof data?.cityKey === 'string' ? data.cityKey : null,
    categories: Array.isArray(data?.categories) ? data.categories.filter((c) => typeof c === 'string') : [],
    online: data?.online !== false,
  };
}

export function createDealMethods(http: AxiosInstance) {
  return {
    async getDealFeed(q: DealFeedQuery): Promise<DealFeedResponse> {
      const { data } = await http.get('/client/deals', { params: buildDealFeedParams(q) });
      return data;
    },
    /** Counts a view server-side (deduplicated there). */
    async getDeal(id: string, q: DealPositionQuery = {}): Promise<ClientDealDetail> {
      const { data } = await http.get(`/client/deals/${encodeURIComponent(id)}`, { params: buildDealPositionParams(q) });
      return data;
    },
    async recordDealEvent(id: string, type: DealEventType): Promise<void> {
      await http.post(`/client/deals/${encodeURIComponent(id)}/events`, { type });
    },
    async reportDeal(id: string, reason: DealReportReason, comment?: string): Promise<DealReportResult> {
      const body = comment?.trim() ? { reason, comment: comment.trim() } : { reason };
      const { data } = await http.post(`/client/deals/${encodeURIComponent(id)}/report`, body);
      return data;
    },
    async getMerchantDeals(merchantId: string, q: DealPositionQuery = {}): Promise<ClientDealSummary[]> {
      const { data } = await http.get(`/client/merchants/${encodeURIComponent(merchantId)}/deals`, {
        params: buildDealPositionParams({ lat: q.lat, lng: q.lng }),
      });
      return Array.isArray(data?.items) ? data.items : [];
    },
    async getDealCities(q: DealPositionQuery = {}): Promise<DealCitiesResponse> {
      const { data } = await http.get('/client/cities', { params: buildDealPositionParams({ lat: q.lat, lng: q.lng }) });
      return data;
    },
    /** Guests only: a count and blurred thumbnails, never the deals themselves. */
    async getDealTeaser(q: DealPositionQuery = {}): Promise<DealTeaserResponse> {
      const { data } = await http.get('/client-auth/deals/teaser', { params: buildDealPositionParams(q) });
      return data;
    },
    async getDealAlerts(): Promise<DealAlertPreferences> {
      const { data } = await http.get('/client/deal-alerts');
      return toDealAlertPreferences(data);
    },
    /** Only the city key is ever sent, never a position. */
    async updateDealAlerts(update: DealAlertUpdate): Promise<DealAlertPreferences> {
      const { data } = await http.patch('/client/deal-alerts', buildDealAlertUpdate(update));
      return toDealAlertPreferences(data);
    },
  };
}
