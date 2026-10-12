import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SCRATCH_LIMITS } from '../scratch-limits';

export const COUPON_REWARD_TYPES = ['PERCENT_DISCOUNT', 'FIXED_DISCOUNT', 'FREE_PRODUCT', 'BONUS_STAMPS'] as const;
export const SCRATCH_AUDIENCE_TYPES = ['ALL_CLIENTS', 'ACTIVE_SINCE', 'INACTIVE_SINCE', 'MIN_STAMPS', 'NEW_SINCE'] as const;
export type ScratchAudienceTypeValue = (typeof SCRATCH_AUDIENCE_TYPES)[number];
export type CouponRewardTypeValue = (typeof COUPON_REWARD_TYPES)[number];

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class ScratchRewardDto {
  @ApiProperty({ enum: COUPON_REWARD_TYPES })
  @IsIn(COUPON_REWARD_TYPES as unknown as string[], { message: 'Type de récompense invalide' })
  type: CouponRewardTypeValue;

  @ApiProperty({ example: '-20 % sur l\'addition' })
  @IsString()
  @MinLength(1, { message: 'Le libellé est requis' })
  @MaxLength(SCRATCH_LIMITS.LABEL_MAX)
  label: string;

  @ApiPropertyOptional({ example: 20, description: 'Pourcentage, montant (MAD) ou tampons bonus selon le type' })
  @IsOptional()
  @IsNumber({}, { message: 'Valeur invalide' })
  @Min(0)
  value?: number | null;

  @ApiPropertyOptional({ example: 50, description: 'Plafond de remise (MAD) pour un pourcentage' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(SCRATCH_LIMITS.MAX_FIXED_DISCOUNT)
  maxDiscount?: number | null;

  @ApiPropertyOptional({ description: 'Récompense du catalogue liée (produit offert)' })
  @IsOptional()
  @IsUUID()
  rewardId?: string | null;

  @ApiProperty({ example: 10, description: 'Poids relatif dans le tirage' })
  @IsInt({ message: 'Le poids doit être un entier' })
  @Min(SCRATCH_LIMITS.MIN_WEIGHT)
  @Max(SCRATCH_LIMITS.MAX_WEIGHT)
  weight: number;

  @ApiPropertyOptional({ example: 50, description: 'Stock total (vide = illimité)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(SCRATCH_LIMITS.MAX_STOCK)
  totalStock?: number | null;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(SCRATCH_LIMITS.MAX_MIN_PURCHASE)
  minPurchaseAmount?: number | null;

  @ApiPropertyOptional({ example: 24, description: 'Heures avant que le coupon soit utilisable' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(SCRATCH_LIMITS.MAX_MIN_DELAY_HOURS)
  minDelayHours?: number;

  @ApiPropertyOptional({ example: 31, description: 'Masque des jours (lundi=1 … dimanche=64)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(127)
  allowedWeekdays?: number | null;

  @ApiPropertyOptional({ example: 600, description: 'Début de plage horaire (minutes, heure du Maroc)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  allowedFromMin?: number | null;

  @ApiPropertyOptional({ example: 1080 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  allowedToMin?: number | null;
}

export class CreateScratchCampaignDto {
  @ApiProperty({ example: 'Ramadan 2026' })
  @IsString()
  @MinLength(1, { message: 'Le nom est requis' })
  @MaxLength(SCRATCH_LIMITS.NAME_MAX)
  name: string;

  @ApiPropertyOptional({ example: 'Merci pour votre fidélité !' })
  @IsOptional()
  @IsString()
  @MaxLength(SCRATCH_LIMITS.MESSAGE_MAX)
  message?: string | null;

  @ApiPropertyOptional({ example: 'violet' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{1,32}$/, { message: 'Design invalide' })
  designId?: string;

  @ApiProperty({ enum: SCRATCH_AUDIENCE_TYPES })
  @IsIn(SCRATCH_AUDIENCE_TYPES as unknown as string[], { message: 'Audience invalide' })
  audienceType: ScratchAudienceTypeValue;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(SCRATCH_LIMITS.MAX_AUDIENCE_STAMPS)
  audienceValue?: number | null;

  @ApiProperty({ example: '2026-03-10', description: 'Dernier jour pour gratter (heure du Maroc)' })
  @Matches(YMD, { message: 'Date de grattage invalide (AAAA-MM-JJ)' })
  cardExpiresOn: string;

  @ApiProperty({ example: '2026-03-17', description: 'Dernier jour d\'utilisation des coupons' })
  @Matches(YMD, { message: 'Date d\'utilisation invalide (AAAA-MM-JJ)' })
  couponExpiresOn: string;

  @ApiProperty({ type: [ScratchRewardDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Au moins une récompense est requise' })
  @ArrayMaxSize(SCRATCH_LIMITS.MAX_REWARDS)
  @ValidateNested({ each: true })
  @Type(() => ScratchRewardDto)
  rewards: ScratchRewardDto[];

  @ApiPropertyOptional({
    example: '2026-03-03T10:00:00Z',
    description: 'Envoi prévu, sert uniquement de référence pour valider les dates. null = maintenant. Ne programme pas l\'envoi.',
  })
  @IsOptional()
  @IsDateString()
  sendAt?: string | null;
}

export class ScheduleScratchCampaignDto {
  @ApiPropertyOptional({ example: '2026-03-03T10:00:00Z', description: 'Vide = envoyer maintenant' })
  @IsOptional()
  @IsDateString()
  sendAt?: string;
}

export class UpdateScratchStatusDto {
  @ApiProperty({ enum: ['CANCELLED', 'DRAFT'], description: 'CANCELLED = annulation définitive, DRAFT = déprogrammer' })
  @IsIn(['CANCELLED', 'DRAFT'])
  status: 'CANCELLED' | 'DRAFT';
}

export class ExtendScratchDatesDto {
  @ApiPropertyOptional({ example: '2026-03-15' })
  @IsOptional()
  @Matches(YMD, { message: 'Date de grattage invalide (AAAA-MM-JJ)' })
  cardExpiresOn?: string;

  @ApiPropertyOptional({ example: '2026-03-25' })
  @IsOptional()
  @Matches(YMD, { message: 'Date d\'utilisation invalide (AAAA-MM-JJ)' })
  couponExpiresOn?: string;
}

export class AudienceEstimateDto {
  @ApiProperty({ enum: SCRATCH_AUDIENCE_TYPES })
  @IsIn(SCRATCH_AUDIENCE_TYPES as unknown as string[], { message: 'Audience invalide' })
  audienceType: ScratchAudienceTypeValue;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(SCRATCH_LIMITS.MAX_AUDIENCE_STAMPS)
  audienceValue?: number | null;
}

export class CheckCouponDto {
  @ApiPropertyOptional({ description: 'Contenu du QR (jitplus://coupon/c1.…)' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  token?: string;

  @ApiPropertyOptional({ example: '042913' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  code?: string;
}

export class RedeemCouponDto {
  @ApiProperty({ example: 180, description: 'Total du ticket AVANT remise (0 si aucun achat)' })
  @Type(() => Number)
  @IsNumber({}, { message: 'Montant invalide' })
  @Min(0)
  @Max(1_000_000)
  purchaseAmount: number;
}

export class ListCouponsQueryDto {
  @ApiPropertyOptional({ enum: ['active', 'used', 'expired'] })
  @IsOptional()
  @IsIn(['active', 'used', 'expired'])
  status?: 'active' | 'used' | 'expired';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  merchantId?: string;
}

export class ListCardsQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'SCRATCHED'] })
  @IsOptional()
  @IsIn(['PENDING', 'SCRATCHED'])
  status?: 'PENDING' | 'SCRATCHED';
}

export class MerchantCouponsQueryDto {
  @ApiPropertyOptional({ enum: ['REDEEMED', 'ACTIVE', 'EXPIRED', 'CANCELLED'] })
  @IsOptional()
  @IsIn(['REDEEMED', 'ACTIVE', 'EXPIRED', 'CANCELLED'])
  status?: 'REDEEMED' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
