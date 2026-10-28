import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
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
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType, OmitType } from '@nestjs/swagger';
import { MerchantCategory } from '@prisma/client';
import { DEAL_LIMITS } from '../deal-limits';

export const DEAL_TYPES = ['BUY_X_GET_Y', 'PERCENT_OFF', 'PRICE_DROP', 'FREE_ITEM', 'OTHER'] as const;
export const DEAL_SCOPES = ['LOCAL', 'ONLINE'] as const;
export const DEAL_REPORT_REASONS = ['INAPPROPRIATE', 'MISLEADING', 'OFF_TOPIC', 'EXPIRED', 'OTHER'] as const;
export const DEAL_FEED_TABS = ['nearby', 'new', 'ending', 'online'] as const;
export const DEAL_EVENT_TYPES = ['LINK_CLICK', 'DIRECTIONS', 'SHARE'] as const;
export const ADMIN_DEAL_FILTERS = ['all', 'live', 'reported', 'removed'] as const;

export type DealTypeValue = (typeof DEAL_TYPES)[number];
export type DealScopeValue = (typeof DEAL_SCOPES)[number];
export type DealFeedTab = (typeof DEAL_FEED_TABS)[number];
export type DealEventType = (typeof DEAL_EVENT_TYPES)[number];

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const CITY_KEY = /^[a-z_]{2,40}$/;

const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value;

export class CreateDealDto {
  @ApiProperty({ enum: DEAL_SCOPES })
  @IsIn(DEAL_SCOPES as unknown as string[], { message: 'Portée invalide' })
  scope: DealScopeValue;

  @ApiProperty({ enum: DEAL_TYPES })
  @IsIn(DEAL_TYPES as unknown as string[], { message: 'Type de bon plan invalide' })
  type: DealTypeValue;

  @ApiProperty({ example: '-30 % sur les baskets Run X' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(3, { message: 'Le titre est trop court' })
  @MaxLength(DEAL_LIMITS.TITLE_MAX, { message: `Le titre est limité à ${DEAL_LIMITS.TITLE_MAX} caractères` })
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(DEAL_LIMITS.DESCRIPTION_MAX)
  description?: string | null;

  @ApiPropertyOptional({ example: 'Hors soldes, dans la limite des stocks' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(DEAL_LIMITS.CONDITIONS_MAX)
  conditions?: string | null;

  @ApiPropertyOptional({ description: 'URL renvoyée par POST /merchant/upload-image?type=deal' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @ApiPropertyOptional({ description: 'Obligatoire (https) pour un bon plan en ligne' })
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(DEAL_LIMITS.LINK_MAX)
  linkUrl?: string | null;

  @ApiPropertyOptional({ example: 1140 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Prix invalide' })
  @Min(0)
  @Max(DEAL_LIMITS.MAX_PRICE)
  originalPrice?: number | null;

  @ApiPropertyOptional({ example: 799 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Prix invalide' })
  @Min(0)
  @Max(DEAL_LIMITS.MAX_PRICE)
  dealPrice?: number | null;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(DEAL_LIMITS.MIN_PERCENT)
  @Max(DEAL_LIMITS.MAX_PERCENT)
  percentOff?: number | null;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(DEAL_LIMITS.MAX_QTY)
  buyQty?: number | null;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(DEAL_LIMITS.MAX_QTY)
  freeQty?: number | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allStores?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(DEAL_LIMITS.MAX_STORES)
  @IsUUID('all', { each: true })
  storeIds?: string[];

  @ApiPropertyOptional({ example: '2026-11-01', description: 'Vide = aujourd’hui' })
  @IsOptional()
  @Transform(trimOrNull)
  @Matches(YMD, { message: 'Date de début invalide (AAAA-MM-JJ)' })
  startsOn?: string | null;

  @ApiProperty({ example: '2026-11-07' })
  @Matches(YMD, { message: 'Date de fin invalide (AAAA-MM-JJ)' })
  endsOn: string;
}

/** Every field optional; the portée cannot change once published. */
export class UpdateDealDto extends PartialType(OmitType(CreateDealDto, ['scope'] as const)) {}

export class DuplicateDealDto {
  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Matches(YMD, { message: 'Date de début invalide (AAAA-MM-JJ)' })
  startsOn?: string;

  @ApiPropertyOptional({ example: '2026-11-07' })
  @IsOptional()
  @Matches(YMD, { message: 'Date de fin invalide (AAAA-MM-JJ)' })
  endsOn?: string;
}

// ── Client ───────────────────────────────────────────────────

export class DealFeedQueryDto {
  @ApiPropertyOptional({ enum: DEAL_FEED_TABS, default: 'nearby' })
  @IsOptional()
  @IsIn(DEAL_FEED_TABS as unknown as string[])
  tab?: DealFeedTab = 'nearby';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({ example: 'casablanca' })
  @IsOptional()
  @Matches(CITY_KEY)
  cityKey?: string;

  @ApiPropertyOptional({ example: 'RESTAURANT' })
  @IsOptional()
  @Matches(/^[A-Z_]{2,30}$/)
  category?: string;

  @ApiPropertyOptional({ description: 'Valeur nextCursor de la page précédente' })
  @IsOptional()
  @Matches(/^\d{1,4}(\.\d{1,4})?$/)
  cursor?: string;
}

export class DealPositionQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;

  @ApiPropertyOptional({ example: 'casablanca' })
  @IsOptional()
  @Matches(CITY_KEY)
  cityKey?: string;
}

export class DealEventDto {
  @ApiProperty({ enum: DEAL_EVENT_TYPES })
  @IsIn(DEAL_EVENT_TYPES as unknown as string[])
  type: DealEventType;
}

export class ReportDealDto {
  @ApiProperty({ enum: DEAL_REPORT_REASONS })
  @IsIn(DEAL_REPORT_REASONS as unknown as string[], { message: 'Motif invalide' })
  reason: (typeof DEAL_REPORT_REASONS)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimOrNull)
  @IsString()
  @MaxLength(DEAL_LIMITS.REPORT_COMMENT_MAX)
  comment?: string | null;
}

export class DealAlertsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 'casablanca', nullable: true })
  @IsOptional()
  @Matches(CITY_KEY, { message: 'Ville invalide' })
  cityKey?: string | null;

  @ApiPropertyOptional({ enum: MerchantCategory, isArray: true, description: 'Vide = toutes les catégories' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(Object.keys(MerchantCategory).length)
  @IsEnum(MerchantCategory, { each: true, message: 'Catégorie invalide' })
  categories?: MerchantCategory[];

  @ApiPropertyOptional({ description: 'Alertes des bons plans en ligne' })
  @IsOptional()
  @IsBoolean()
  online?: boolean;
}
// ── Admin ────────────────────────────────────────────────────

export class AdminDealsQueryDto {
  @ApiPropertyOptional({ enum: ADMIN_DEAL_FILTERS, default: 'all' })
  @IsOptional()
  @IsIn(ADMIN_DEAL_FILTERS as unknown as string[])
  filter?: (typeof ADMIN_DEAL_FILTERS)[number] = 'all';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export class RemoveDealDto {
  @ApiProperty({ example: 'Contenu trompeur' })
  @IsString()
  @MinLength(3, { message: 'Le motif est requis' })
  @MaxLength(200)
  reason: string;
}
