import { Prisma } from '@prisma/client';
import { moroccoYmd } from '../common/utils/morocco-time';
import { dealDisplayStatus } from './deal-rules';
import { haversineKm } from './morocco-cities';

const num = (v: Prisma.Decimal | null) => (v == null ? null : v.toNumber());

export const MERCHANT_DEAL_INCLUDE = { stores: { select: { storeId: true } } } satisfies Prisma.DealInclude;
export type MerchantDealRow = Prisma.DealGetPayload<{ include: typeof MERCHANT_DEAL_INCLUDE }>;

export function toMerchantDealDto(d: MerchantDealRow, now: Date = new Date()) {
  return {
    id: d.id,
    scope: d.scope,
    type: d.type,
    title: d.title,
    description: d.description,
    conditions: d.conditions,
    imageUrl: d.imageUrl,
    linkUrl: d.linkUrl,
    originalPrice: num(d.originalPrice),
    dealPrice: num(d.dealPrice),
    percentOff: d.percentOff,
    buyQty: d.buyQty,
    freeQty: d.freeQty,
    allStores: d.allStores,
    storeIds: d.stores.map((s) => s.storeId),
    startsAt: d.startsAt.toISOString(),
    endsAt: d.endsAt.toISOString(),
    startsOn: moroccoYmd(d.startsAt),
    endsOn: moroccoYmd(d.endsAt),
    status: d.status,
    displayStatus: dealDisplayStatus(d, now),
    endedReason: d.endedReason,
    stats: {
      views: d.viewCount,
      linkClicks: d.linkClickCount,
      directions: d.directionsCount,
      shares: d.shareCount,
    },
    createdAt: d.createdAt.toISOString(),
  };
}

const STORE_SELECT = {
  id: true,
  nom: true,
  ville: true,
  quartier: true,
  adresse: true,
  latitude: true,
  longitude: true,
  telephone: true,
} satisfies Prisma.StoreSelect;

/** What a client list needs: the offer, the merchant and the store positions for the distance. */
export const CLIENT_DEAL_SELECT = {
  id: true,
  merchantId: true,
  scope: true,
  type: true,
  title: true,
  imageUrl: true,
  linkUrl: true,
  originalPrice: true,
  dealPrice: true,
  percentOff: true,
  buyQty: true,
  freeQty: true,
  allStores: true,
  startsAt: true,
  endsAt: true,
  isPopular: true,
  stores: { select: { storeId: true } },
  merchant: {
    select: {
      id: true,
      nom: true,
      logoUrl: true,
      coverUrl: true,
      categorie: true,
      themeColor: true,
      stores: { where: { isActive: true }, orderBy: { createdAt: 'asc' }, select: STORE_SELECT },
    },
  },
} satisfies Prisma.DealSelect;
export type ClientDealRow = Prisma.DealGetPayload<{ select: typeof CLIENT_DEAL_SELECT }>;

export const CLIENT_DEAL_DETAIL_SELECT = {
  ...CLIENT_DEAL_SELECT,
  description: true,
  conditions: true,
  status: true,
  merchant: {
    select: {
      ...CLIENT_DEAL_SELECT.merchant.select,
      phoneNumber: true,
      isActive: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.DealSelect;
export type ClientDealDetailRow = Prisma.DealGetPayload<{ select: typeof CLIENT_DEAL_DETAIL_SELECT }>;

export interface Position {
  lat: number;
  lng: number;
}

/** Active stores the deal applies to (all of them, or the selected ones). */
export function concernedStores<T extends { id: string }>(
  deal: { allStores: boolean; stores: { storeId: string }[] },
  merchantStores: T[],
): T[] {
  if (deal.allStores) return merchantStores;
  const ids = new Set(deal.stores.map((s) => s.storeId));
  return merchantStores.filter((s) => ids.has(s.id));
}

const round1 = (km: number) => Math.round(km * 10) / 10;

function storeDistance(s: { latitude: number | null; longitude: number | null }, pos?: Position | null): number | null {
  if (!pos || s.latitude == null || s.longitude == null) return null;
  return round1(haversineKm(pos.lat, pos.lng, s.latitude, s.longitude));
}

function minDistance(stores: { latitude: number | null; longitude: number | null }[], pos?: Position | null): number | null {
  let best: number | null = null;
  for (const s of stores) {
    const km = storeDistance(s, pos);
    if (km != null && (best == null || km < best)) best = km;
  }
  return best;
}

export function toClientDealSummary(d: ClientDealRow, pos?: Position | null) {
  return {
    id: d.id,
    scope: d.scope,
    type: d.type,
    title: d.title,
    imageUrl: d.imageUrl,
    originalPrice: num(d.originalPrice),
    dealPrice: num(d.dealPrice),
    percentOff: d.percentOff,
    buyQty: d.buyQty,
    freeQty: d.freeQty,
    startsAt: d.startsAt.toISOString(),
    endsAt: d.endsAt.toISOString(),
    isPopular: d.isPopular,
    hasLink: !!d.linkUrl,
    distanceKm: d.scope === 'LOCAL' ? minDistance(concernedStores(d, d.merchant.stores), pos) : null,
    merchant: {
      id: d.merchant.id,
      nom: d.merchant.nom,
      logoUrl: d.merchant.logoUrl,
      coverUrl: d.merchant.coverUrl,
      categorie: d.merchant.categorie,
      themeColor: d.merchant.themeColor,
    },
  };
}

export function toClientDealDetail(d: ClientDealDetailRow, isOver: boolean, pos?: Position | null) {
  const stores = d.scope === 'LOCAL' ? concernedStores(d, d.merchant.stores) : [];
  return {
    ...toClientDealSummary(d, pos),
    description: d.description,
    conditions: d.conditions,
    linkUrl: isOver ? null : d.linkUrl,
    isOver,
    stores: stores
      .map((s) => ({ ...s, distanceKm: storeDistance(s, pos) }))
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)),
    merchantPhone: d.merchant.phoneNumber,
  };
}
