import { BadRequestException } from '@nestjs/common';
import type { DealType } from '@prisma/client';
import {
  diffDaysYmd,
  endOfMoroccoDay,
  isValidYmd,
  moroccoWallTimeToUtc,
  moroccoYmd,
} from '../common/utils/morocco-time';
import { BLOCKED_LINK_HOSTS, DEAL_LIMITS } from './deal-limits';

export interface OfferInput {
  type: DealType;
  originalPrice?: number | null;
  dealPrice?: number | null;
  percentOff?: number | null;
  buyQty?: number | null;
  freeQty?: number | null;
}

export interface NormalizedOffer {
  type: DealType;
  originalPrice: number | null;
  dealPrice: number | null;
  percentOff: number | null;
  buyQty: number | null;
  freeQty: number | null;
}

const toPrice = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100) / 100);

function priceOrNull(v: number | null | undefined, label: string): number | null {
  const price = toPrice(v);
  if (price == null) return null;
  if (!Number.isFinite(price) || price < 0 || price > DEAL_LIMITS.MAX_PRICE) {
    throw new BadRequestException(`${label} invalide`);
  }
  return price;
}

function qty(v: number | null | undefined, label: string): number {
  if (v == null || !Number.isInteger(v) || v < 1 || v > DEAL_LIMITS.MAX_QTY) {
    throw new BadRequestException(`${label} : un nombre entre 1 et ${DEAL_LIMITS.MAX_QTY} est requis`);
  }
  return v;
}

/** Keep only the fields the type uses, so a type change never leaves stale values. */
export function normalizeOffer(input: OfferInput): NormalizedOffer {
  const empty: NormalizedOffer = {
    type: input.type,
    originalPrice: null,
    dealPrice: null,
    percentOff: null,
    buyQty: null,
    freeQty: null,
  };
  switch (input.type) {
    case 'PERCENT_OFF': {
      const pct = input.percentOff;
      if (pct == null || !Number.isInteger(pct) || pct < DEAL_LIMITS.MIN_PERCENT || pct > DEAL_LIMITS.MAX_PERCENT) {
        throw new BadRequestException(
          `La réduction doit être comprise entre ${DEAL_LIMITS.MIN_PERCENT} et ${DEAL_LIMITS.MAX_PERCENT} %`,
        );
      }
      return { ...empty, percentOff: pct };
    }
    case 'PRICE_DROP': {
      const original = priceOrNull(input.originalPrice, 'Prix initial');
      const price = priceOrNull(input.dealPrice, 'Prix promo');
      if (original == null || price == null) {
        throw new BadRequestException('Le prix initial et le prix promo sont requis');
      }
      if (!(original > 0) || price >= original) {
        throw new BadRequestException('Le prix promo doit être inférieur au prix initial');
      }
      const pct = Math.min(DEAL_LIMITS.MAX_PERCENT, Math.max(DEAL_LIMITS.MIN_PERCENT, Math.round((1 - price / original) * 100)));
      return { ...empty, originalPrice: original, dealPrice: price, percentOff: pct };
    }
    case 'BUY_X_GET_Y':
      return { ...empty, buyQty: qty(input.buyQty, 'Quantité achetée'), freeQty: qty(input.freeQty, 'Quantité offerte') };
    case 'FREE_ITEM':
      return { ...empty, originalPrice: priceOrNull(input.originalPrice, 'Valeur du produit') };
    case 'OTHER':
      return empty;
    default:
      throw new BadRequestException('Type de bon plan invalide');
  }
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * https only, no credentials, no IP address, no URL shortener (the real
 * destination must be visible). Returns null for an empty optional link.
 */
export function normalizeDealLink(raw: string | null | undefined, required: boolean): string | null {
  const value = raw?.trim() ?? '';
  if (!value) {
    if (required) throw new BadRequestException('Un lien https est obligatoire pour un bon plan en ligne');
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException('Lien invalide');
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:') throw new BadRequestException('Le lien doit commencer par https://');
  if (url.username || url.password) throw new BadRequestException('Lien invalide');
  if (!host.includes('.') || IPV4.test(host) || host.startsWith('[')) throw new BadRequestException('Lien invalide');
  const bare = host.startsWith('www.') ? host.slice(4) : host;
  if (BLOCKED_LINK_HOSTS.has(bare)) {
    throw new BadRequestException('Les liens raccourcis ne sont pas acceptés : utilisez l’adresse complète de la page');
  }
  const href = url.toString();
  if (href.length > DEAL_LIMITS.LINK_MAX) throw new BadRequestException('Lien trop long');
  return href;
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface DealDates {
  startsAt: Date;
  endsAt: Date;
}

/**
 * New deal (or one that has not started yet): starts today (immediately) or
 * at midnight of a later day within the scheduling horizon, ends at the end
 * of `endsOn`, Morocco time.
 */
export function resolveDealDates(startsOn: string | null | undefined, endsOn: string, now: Date = new Date()): DealDates {
  const today = moroccoYmd(now);
  const start = startsOn || today;
  if (!isValidYmd(start) || !isValidYmd(endsOn)) throw new BadRequestException('Date invalide');
  const ahead = diffDaysYmd(today, start);
  if (ahead < 0) throw new BadRequestException('La date de début ne peut pas être passée');
  if (ahead > DEAL_LIMITS.MAX_SCHEDULE_DAYS) {
    throw new BadRequestException(`Un bon plan se programme au plus ${DEAL_LIMITS.MAX_SCHEDULE_DAYS} jours à l’avance`);
  }
  const length = diffDaysYmd(start, endsOn);
  if (length < 0) throw new BadRequestException('La date de fin doit suivre la date de début');
  if (length > DEAL_LIMITS.MAX_DURATION_DAYS) {
    throw new BadRequestException(`Un bon plan dure au plus ${DEAL_LIMITS.MAX_DURATION_DAYS} jours`);
  }
  return {
    startsAt: ahead === 0 ? now : moroccoWallTimeToUtc(start, 0, 0),
    endsAt: endOfMoroccoDay(endsOn),
  };
}

/** Extending (or shortening) a deal that already started: the window counts from today. */
export function resolveExtendedEnd(endsOn: string, now: Date = new Date()): Date {
  if (!isValidYmd(endsOn)) throw new BadRequestException('Date invalide');
  const left = diffDaysYmd(moroccoYmd(now), endsOn);
  if (left < 0) throw new BadRequestException('La date de fin ne peut pas être passée');
  if (left > DEAL_LIMITS.MAX_DURATION_DAYS) {
    throw new BadRequestException(`La date de fin est au plus dans ${DEAL_LIMITS.MAX_DURATION_DAYS} jours`);
  }
  return endOfMoroccoDay(endsOn);
}

/** Title comparison for the "same deal already running" check. */
export function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export type DealDisplayStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'REMOVED';

export function dealDisplayStatus(
  deal: { status: string; startsAt: Date; endsAt: Date },
  now: Date = new Date(),
): DealDisplayStatus {
  if (deal.status === 'REMOVED' || deal.status === 'DELETED') return 'REMOVED';
  if (deal.status === 'ENDED' || deal.endsAt <= now) return 'ENDED';
  if (deal.startsAt > now) return 'SCHEDULED';
  return 'LIVE';
}

/** Prisma filter of the deals clients can see right now. */
export function liveDealWhere(now: Date = new Date()) {
  return {
    status: 'ACTIVE' as const,
    startsAt: { lte: now },
    endsAt: { gt: now },
    merchant: { isActive: true, deletedAt: null },
  };
}
