import type { MerchantPlan, WelcomeBonusTrigger } from '@prisma/client';
import {
  WELCOME_BONUS_MAX_STAMPS,
  WELCOME_BONUS_MIN_THRESHOLD,
} from '../../common/constants';
import type { TransactionClient } from '../../common/repositories';
import { computeRewardThreshold } from './loyalty.utils';
import { hasWelcomeBonusClaim } from './welcome-bonus-identity';

/**
 * Welcome gift: bonus stamps for a client new to a merchant, once per client
 * and merchant. It is credited when the client adds the card, or at their first
 * QR / e-commerce code scan.
 *
 * A till entry without proof of the client (typed phone, Quick-Add) only
 * reserves it, outside `stamps`, until their first scan: none → reserved →
 * credited, forward only.
 */

export interface WelcomeBonusMerchantRules {
  stampsForReward: number | null;
  rewards?: { cout: number }[];
  welcomeBonusEnabled?: boolean;
  welcomeBonusStamps?: number;
  welcomeBonusTrigger?: WelcomeBonusTrigger;
  welcomeBonusEndsAt?: Date | string | null;
}

export interface WelcomeBonusCardState {
  id: string;
  stamps: number;
  welcomeBonusReservedStamps?: number;
  welcomeBonusReservedAt?: Date | string | null;
  welcomeBonusCreditedAt?: Date | string | null;
}

export interface WelcomeOffer {
  stamps: number;
  trigger: WelcomeBonusTrigger;
}

/** Columns needed on a loyalty card to run the welcome gift rules. */
export const WELCOME_BONUS_CARD_SELECT = {
  welcomeBonusReservedStamps: true,
  welcomeBonusReservedAt: true,
  welcomeBonusCreditedAt: true,
} as const;

/** Same answer as MerchantPlanService for read paths that load many merchants at once. */
export function effectivePlanOf(
  merchant: { plan?: MerchantPlan | null; planExpiresAt?: Date | string | null },
  now: Date = new Date(),
): MerchantPlan {
  if (merchant.plan !== 'PREMIUM') return 'FREE';
  return merchant.planExpiresAt && new Date(merchant.planExpiresAt) <= now ? 'FREE' : 'PREMIUM';
}

/** A quarter of the first reward, 1 to 5 stamps; 0 when that reward is too close. */
export function computeWelcomeBonusMax(threshold: number): number {
  if (threshold < WELCOME_BONUS_MIN_THRESHOLD) return 0;
  return Math.min(Math.max(Math.floor(threshold / 4), 1), WELCOME_BONUS_MAX_STAMPS);
}

function capForMerchant(merchant: WelcomeBonusMerchantRules): number {
  return computeWelcomeBonusMax(computeRewardThreshold({
    stampsForReward: merchant.stampsForReward,
    rewards: merchant.rewards,
  }));
}

/** The offer a new client can get right now, or null. */
export function resolveWelcomeOffer(
  merchant: WelcomeBonusMerchantRules,
  plan: MerchantPlan | undefined,
  now: Date = new Date(),
): WelcomeOffer | null {
  if (!merchant.welcomeBonusEnabled || plan !== 'PREMIUM') return null;
  if (merchant.welcomeBonusEndsAt && new Date(merchant.welcomeBonusEndsAt) <= now) return null;
  const stamps = Math.min(merchant.welcomeBonusStamps ?? 0, capForMerchant(merchant));
  if (stamps <= 0) return null;
  return {
    stamps,
    trigger: merchant.welcomeBonusTrigger ?? 'CARD_OR_SCAN',
  };
}

/** The reservation still waiting on this card (capped to the current rules), or null. */
export function pendingWelcomeBonus(
  card: WelcomeBonusCardState | null | undefined,
  merchant: WelcomeBonusMerchantRules,
): { stamps: number } | null {
  if (!card || card.welcomeBonusCreditedAt || !card.welcomeBonusReservedAt) return null;
  const stamps = Math.min(card.welcomeBonusReservedStamps ?? 0, capForMerchant(merchant));
  return stamps > 0 ? { stamps } : null;
}

/** No stamps on this card and no gift started on it. */
export function canStartWelcomeBonus(
  card: Pick<WelcomeBonusCardState, 'stamps' | 'welcomeBonusReservedAt' | 'welcomeBonusCreditedAt'>,
): boolean {
  return card.stamps === 0 && !card.welcomeBonusReservedAt && !card.welcomeBonusCreditedAt;
}

function capToAccumulationLimit(stamps: number, balance: number, limit: number | null): number {
  return limit == null ? stamps : Math.min(stamps, Math.max(limit - balance, 0));
}

type HistoryTx = Pick<TransactionClient, 'transaction' | 'client' | 'welcomeBonusClaim'>;

/**
 * Stamps already earned or gifted here: this client is no longer new. Also true
 * when a deleted account with the same verified identity had history here
 * (see welcome-bonus-identity): a new client id must not reopen the gift.
 */
export async function hasWelcomeBonusHistory(
  tx: HistoryTx,
  clientId: string,
  merchantId: string,
): Promise<boolean> {
  const row = await tx.transaction.findFirst({
    where: { clientId, merchantId, type: { in: ['EARN_STAMPS', 'WELCOME_BONUS'] } },
    select: { id: true },
  });
  return !!row || hasWelcomeBonusClaim(tx, clientId, merchantId);
}

/**
 * Credit the offer on a card the client has just added. The conditional update
 * carries the stamps, so concurrent calls credit once and nothing can be lost
 * between reading and writing the balance.
 */
export async function grantWelcomeBonusInTx<C extends WelcomeBonusCardState>(
  tx: Pick<TransactionClient, 'loyaltyCard'> & HistoryTx,
  params: {
    card: C;
    clientId: string;
    merchantId: string;
    offer: WelcomeOffer | null;
    accumulationLimit: number | null;
    now?: Date;
  },
): Promise<{ card: C; granted: number }> {
  const { card, clientId, merchantId, offer, accumulationLimit } = params;
  const unchanged = { card, granted: 0 };
  if (!offer || !canStartWelcomeBonus(card)) return unchanged;

  const granted = capToAccumulationLimit(offer.stamps, 0, accumulationLimit);
  if (granted <= 0 || await hasWelcomeBonusHistory(tx, clientId, merchantId)) return unchanged;

  const now = params.now ?? new Date();
  const { count } = await tx.loyaltyCard.updateMany({
    where: { id: card.id, stamps: 0, welcomeBonusReservedAt: null, welcomeBonusCreditedAt: null },
    // A returning card keeps an old visit date: the gift must not expire at once.
    data: { stamps: { increment: granted }, welcomeBonusCreditedAt: now, lastVisitAt: now, expiryReminderSentAt: null },
  });
  if (count !== 1) return unchanged;

  await tx.transaction.create({
    data: { clientId, merchantId, type: 'WELCOME_BONUS', amount: 0, stamps: granted },
  });
  return { card: { ...card, stamps: granted, welcomeBonusCreditedAt: now }, granted };
}

/**
 * Reserve the offer on a card that never had one and never earned anything
 * here. Returns the card as it stands afterwards. Runs in the caller's
 * transaction; the conditional update makes concurrent calls reserve once.
 */
export async function reserveWelcomeBonusInTx<C extends WelcomeBonusCardState>(
  tx: Pick<TransactionClient, 'loyaltyCard'> & HistoryTx,
  params: { card: C; clientId: string; merchantId: string; offer: WelcomeOffer | null; now?: Date },
): Promise<C> {
  const { card, clientId, merchantId, offer } = params;
  if (!offer || !canStartWelcomeBonus(card) || await hasWelcomeBonusHistory(tx, clientId, merchantId)) return card;

  const now = params.now ?? new Date();
  const reservation = {
    welcomeBonusReservedStamps: offer.stamps,
    welcomeBonusReservedAt: now,
  };
  const { count } = await tx.loyaltyCard.updateMany({
    where: { id: card.id, welcomeBonusReservedAt: null, welcomeBonusCreditedAt: null },
    data: reservation,
  });
  return count === 1 ? { ...card, ...reservation } : card;
}

/**
 * Consume the reservation and return the stamps to add to the balance (capped
 * to the current rules and the accumulation limit). The card is marked first,
 * conditionally: a concurrent scan gets 0.
 */
export async function consumeWelcomeBonusInTx(
  tx: Pick<TransactionClient, 'loyaltyCard'>,
  params: {
    card: WelcomeBonusCardState;
    merchant: WelcomeBonusMerchantRules;
    balance: number;
    accumulationLimit: number | null;
    now?: Date;
  },
): Promise<number> {
  const now = params.now ?? new Date();
  const pending = pendingWelcomeBonus(params.card, params.merchant);
  if (!pending) return 0;

  const { count } = await tx.loyaltyCard.updateMany({
    where: { id: params.card.id, welcomeBonusCreditedAt: null },
    data: { welcomeBonusCreditedAt: now, welcomeBonusReservedStamps: 0 },
  });
  if (count !== 1) return 0;

  return capToAccumulationLimit(pending.stamps, params.balance, params.accumulationLimit);
}
