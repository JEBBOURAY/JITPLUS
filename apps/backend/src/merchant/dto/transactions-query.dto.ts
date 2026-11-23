import { IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/** Groups of transaction types the history can be filtered on (one chip each in the app). */
export const TRANSACTION_KINDS = ['stamps', 'rewards', 'games', 'coupons', 'adjustments', 'cancelled'] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

/** `owner` = done by the merchant account itself (no team member). */
const STAFF_PATTERN = /^(owner|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Merchant transaction history: every filter is optional, so app versions that
 * only send page/limit keep the full history.
 */
export class MerchantTransactionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TRANSACTION_KINDS })
  @IsOptional()
  @IsIn(TRANSACTION_KINDS)
  kind?: TransactionKind;

  /** Client name or phone. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Inclusive lower bound, computed on the device (its local midnight for "today"). */
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ description: 'Team member id, or "owner"' })
  @IsOptional()
  @Matches(STAFF_PATTERN)
  staff?: string;
}
