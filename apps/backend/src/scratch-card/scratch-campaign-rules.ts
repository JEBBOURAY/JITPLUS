import { BadRequestException } from '@nestjs/common';
import { diffDaysYmd, endOfMoroccoDay, isValidYmd, moroccoYmd } from '../common/utils/morocco-time';
import { SCRATCH_LIMITS } from './scratch-limits';
import type { CouponRewardTypeValue, ScratchAudienceTypeValue } from './dto';

export interface RewardInput {
  type: CouponRewardTypeValue;
  label: string;
  value?: number | null;
  maxDiscount?: number | null;
  rewardId?: string | null;
  weight: number;
  totalStock?: number | null;
  minPurchaseAmount?: number | null;
  minDelayHours?: number;
  allowedWeekdays?: number | null;
  allowedFromMin?: number | null;
  allowedToMin?: number | null;
}

export interface NormalizedReward {
  type: CouponRewardTypeValue;
  label: string;
  value: number | null;
  maxDiscount: number | null;
  rewardId: string | null;
  weight: number;
  totalStock: number | null;
  remaining: number | null;
  minPurchaseAmount: number | null;
  minDelayHours: number;
  allowedWeekdays: number | null;
  allowedFromMin: number | null;
  allowedToMin: number | null;
}

/** Validates and normalises the reward list (throws 400 with a French message). */
export function normalizeRewards(rewards: RewardInput[]): NormalizedReward[] {
  if (!Array.isArray(rewards) || rewards.length === 0) {
    throw new BadRequestException('Au moins une récompense est requise');
  }
  if (rewards.length > SCRATCH_LIMITS.MAX_REWARDS) {
    throw new BadRequestException(`${SCRATCH_LIMITS.MAX_REWARDS} récompenses maximum`);
  }

  const normalized = rewards.map((r, index) => {
    const n = index + 1;
    const label = (r.label || '').trim();
    if (!label) throw new BadRequestException(`Récompense ${n} : le libellé est requis`);

    let value: number | null = null;
    let maxDiscount: number | null = null;
    switch (r.type) {
      case 'PERCENT_DISCOUNT':
        if (r.value == null || r.value < 1 || r.value > SCRATCH_LIMITS.MAX_PERCENT) {
          throw new BadRequestException(`Récompense ${n} : le pourcentage doit être entre 1 et 100`);
        }
        value = Math.round(r.value * 100) / 100;
        maxDiscount = r.maxDiscount != null && r.maxDiscount > 0 ? Math.round(r.maxDiscount * 100) / 100 : null;
        break;
      case 'FIXED_DISCOUNT':
        if (r.value == null || r.value < 1 || r.value > SCRATCH_LIMITS.MAX_FIXED_DISCOUNT) {
          throw new BadRequestException(
            `Récompense ${n} : le montant doit être entre 1 et ${SCRATCH_LIMITS.MAX_FIXED_DISCOUNT}`,
          );
        }
        value = Math.round(r.value * 100) / 100;
        break;
      case 'BONUS_STAMPS':
        if (r.value == null || !Number.isInteger(r.value) || r.value < 1 || r.value > SCRATCH_LIMITS.MAX_BONUS_STAMPS) {
          throw new BadRequestException(
            `Récompense ${n} : le nombre de tampons doit être entre 1 et ${SCRATCH_LIMITS.MAX_BONUS_STAMPS}`,
          );
        }
        value = r.value;
        break;
      case 'FREE_PRODUCT':
        break;
      default:
        throw new BadRequestException(`Récompense ${n} : type invalide`);
    }

    const hasFrom = r.allowedFromMin != null;
    const hasTo = r.allowedToMin != null;
    if (hasFrom !== hasTo) {
      throw new BadRequestException(`Récompense ${n} : la plage horaire doit avoir un début et une fin`);
    }
    if (hasFrom && r.allowedFromMin === r.allowedToMin) {
      throw new BadRequestException(`Récompense ${n} : la plage horaire est vide`);
    }
    const allowedWeekdays = r.allowedWeekdays != null && (r.allowedWeekdays & 127) !== 127 ? r.allowedWeekdays & 127 : null;
    if (r.allowedWeekdays != null && (r.allowedWeekdays & 127) === 0) {
      throw new BadRequestException(`Récompense ${n} : choisissez au moins un jour`);
    }

    const totalStock = r.totalStock != null ? r.totalStock : null;
    return {
      type: r.type,
      label: label.slice(0, SCRATCH_LIMITS.LABEL_MAX),
      value,
      maxDiscount,
      rewardId: r.type === 'FREE_PRODUCT' ? r.rewardId ?? null : null,
      weight: r.weight,
      totalStock,
      remaining: totalStock,
      minPurchaseAmount: r.minPurchaseAmount != null && r.minPurchaseAmount > 0 ? r.minPurchaseAmount : null,
      minDelayHours: r.minDelayHours ?? 0,
      allowedWeekdays,
      allowedFromMin: hasFrom ? r.allowedFromMin! : null,
      allowedToMin: hasTo ? r.allowedToMin! : null,
    };
  });

  if (!normalized.some((r) => r.totalStock == null)) {
    throw new BadRequestException(
      'Au moins une récompense doit avoir un stock illimité : chaque carte doit toujours gagner',
    );
  }
  return normalized;
}

export function validateAudience(type: ScratchAudienceTypeValue, value?: number | null): number | null {
  if (type === 'ALL_CLIENTS') return null;
  if (value == null || !Number.isInteger(value) || value < 1) {
    throw new BadRequestException('Précisez la valeur du ciblage');
  }
  const max = type === 'MIN_STAMPS' ? SCRATCH_LIMITS.MAX_AUDIENCE_STAMPS : SCRATCH_LIMITS.MAX_AUDIENCE_DAYS;
  if (value > max) throw new BadRequestException(`La valeur du ciblage doit être au plus ${max}`);
  return value;
}

/**
 * Turns the two YYYY-MM-DD dates chosen by the merchant into end-of-day
 * instants (Morocco) and checks them against the send date.
 */
export function resolveCampaignDates(
  cardExpiresOn: string,
  couponExpiresOn: string,
  sendAt: Date,
): { cardExpiresAt: Date; couponExpiresAt: Date } {
  if (!isValidYmd(cardExpiresOn)) throw new BadRequestException('Date limite de grattage invalide');
  if (!isValidYmd(couponExpiresOn)) throw new BadRequestException('Date de fin des coupons invalide');

  const sendYmd = moroccoYmd(sendAt);
  const cardDays = diffDaysYmd(sendYmd, cardExpiresOn);
  if (cardDays < 1) {
    throw new BadRequestException('La date limite de grattage doit être au moins le lendemain de l\'envoi');
  }
  if (cardDays > SCRATCH_LIMITS.MAX_CARD_DAYS) {
    throw new BadRequestException(
      `La date limite de grattage doit être au plus ${SCRATCH_LIMITS.MAX_CARD_DAYS} jours après l'envoi`,
    );
  }
  if (diffDaysYmd(cardExpiresOn, couponExpiresOn) < SCRATCH_LIMITS.MIN_COUPON_AFTER_CARD_DAYS) {
    throw new BadRequestException(
      'Les coupons doivent rester valables au moins 1 jour après la date limite de grattage',
    );
  }
  if (diffDaysYmd(sendYmd, couponExpiresOn) > SCRATCH_LIMITS.MAX_COUPON_DAYS) {
    throw new BadRequestException(
      `La date de fin des coupons doit être au plus ${SCRATCH_LIMITS.MAX_COUPON_DAYS} jours après l'envoi`,
    );
  }
  return { cardExpiresAt: endOfMoroccoDay(cardExpiresOn), couponExpiresAt: endOfMoroccoDay(couponExpiresOn) };
}

/**
 * Reference instant used to validate the dates of a campaign being saved:
 * the planned send time sent by the wizard (never in the past), `now` when
 * explicitly null, `fallback` when the field is absent.
 */
export function plannedSendAt(input: string | null | undefined, fallback: Date, now: Date = new Date()): Date {
  if (input === undefined) return fallback;
  if (input === null) return now;
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Date d\'envoi invalide');
  return date.getTime() < now.getTime() ? now : date;
}

/**
 * Extension after sending: dates can only move later. Missing values keep the
 * current date. Limits are counted from the original send date.
 */
export function resolveExtendedDates(
  current: { cardExpiresAt: Date; couponExpiresAt: Date; sentAt: Date },
  input: { cardExpiresOn?: string; couponExpiresOn?: string },
  now: Date,
): { cardExpiresAt: Date; couponExpiresAt: Date } {
  const cardYmd = input.cardExpiresOn ?? moroccoYmd(current.cardExpiresAt);
  const couponYmd = input.couponExpiresOn ?? moroccoYmd(current.couponExpiresAt);
  if (!isValidYmd(cardYmd) || !isValidYmd(couponYmd)) throw new BadRequestException('Date invalide');

  const cardExpiresAt = endOfMoroccoDay(cardYmd);
  const couponExpiresAt = endOfMoroccoDay(couponYmd);
  if (cardExpiresAt < current.cardExpiresAt || couponExpiresAt < current.couponExpiresAt) {
    throw new BadRequestException('Après l\'envoi, les dates peuvent seulement être prolongées');
  }
  if (input.cardExpiresOn && diffDaysYmd(moroccoYmd(now), cardYmd) < 0) {
    throw new BadRequestException('La date limite de grattage ne peut pas être dans le passé');
  }
  const sentYmd = moroccoYmd(current.sentAt);
  if (diffDaysYmd(sentYmd, cardYmd) > SCRATCH_LIMITS.MAX_CARD_DAYS) {
    throw new BadRequestException(
      `La date limite de grattage doit être au plus ${SCRATCH_LIMITS.MAX_CARD_DAYS} jours après l'envoi`,
    );
  }
  if (diffDaysYmd(cardYmd, couponYmd) < SCRATCH_LIMITS.MIN_COUPON_AFTER_CARD_DAYS) {
    throw new BadRequestException(
      'Les coupons doivent rester valables au moins 1 jour après la date limite de grattage',
    );
  }
  if (diffDaysYmd(sentYmd, couponYmd) > SCRATCH_LIMITS.MAX_COUPON_DAYS) {
    throw new BadRequestException(
      `La date de fin des coupons doit être au plus ${SCRATCH_LIMITS.MAX_COUPON_DAYS} jours après l'envoi`,
    );
  }
  return { cardExpiresAt, couponExpiresAt };
}
