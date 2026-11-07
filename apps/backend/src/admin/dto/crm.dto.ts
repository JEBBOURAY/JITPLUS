import { Type } from 'class-transformer';
import {
  IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FollowUpKind, FollowUpStatus, PremiumGrant, SubscriptionPaymentMethod } from '@prisma/client';

// ── Follow-up (CRM) ───────────────────────────────────────────────────────────

export class UpdateFollowUpDto {
  @ApiPropertyOptional({ enum: FollowUpStatus })
  @IsOptional()
  @IsEnum(FollowUpStatus)
  status?: FollowUpStatus;

  /** ISO date; empty string clears the next action */
  @ApiPropertyOptional({ description: 'Next action due date (ISO 8601). Empty string clears it.' })
  @IsOptional()
  @IsString()
  nextActionAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nextAction?: string;

  @ApiPropertyOptional({ description: 'Admin in charge (email). Empty string clears it.' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  owner?: string;
}

export class AddFollowUpNoteDto extends UpdateFollowUpDto {
  @ApiProperty({ enum: FollowUpKind })
  @IsEnum(FollowUpKind)
  kind!: FollowUpKind;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class FollowUpListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @IsOptional() @IsEnum(FollowUpStatus)
  status?: FollowUpStatus;

  /** overdue = due before today, today = due today or earlier, week = due within 7 days, none = nothing planned */
  @IsOptional() @IsIn(['overdue', 'today', 'week', 'none'])
  due?: 'overdue' | 'today' | 'week' | 'none';

  /** Include converted and lost follow-ups (hidden by default) */
  @IsOptional() @IsIn(['1', 'true'])
  closed?: string;

  @IsOptional() @IsString() @MaxLength(100)
  search?: string;

  @IsOptional() @IsString() @MaxLength(255)
  owner?: string;
}

// ── Billing ───────────────────────────────────────────────────────────────────

export class PaymentInputDto {
  @ApiProperty({ description: 'Amount received (MAD)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  amount!: number;

  @ApiProperty({ enum: SubscriptionPaymentMethod })
  @IsEnum(SubscriptionPaymentMethod)
  method!: SubscriptionPaymentMethod;

  @ApiPropertyOptional({ description: 'Date the money was received (defaults to now)' })
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional() @IsDateString()
  periodStart?: string;

  @IsOptional() @IsDateString()
  periodEnd?: string;

  @IsOptional() @IsString() @MaxLength(120)
  reference?: string;

  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class ActivatePremiumDto {
  @ApiPropertyOptional({ enum: PremiumGrant, description: 'PAID or OFFERED (free). Omitted = not recorded.' })
  @IsOptional()
  @IsEnum(PremiumGrant)
  grant?: PremiumGrant;

  @IsOptional() @IsString() @MaxLength(300)
  grantNote?: string;

  @ApiPropertyOptional({ description: 'End of the subscription (ISO 8601). Omitted = no end date.' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ type: PaymentInputDto, description: 'Payment received with the activation (grant PAID only)' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentInputDto)
  payment?: PaymentInputDto;
}

export class SetPremiumGrantDto {
  @ApiProperty({ enum: PremiumGrant })
  @IsEnum(PremiumGrant)
  grant!: PremiumGrant;

  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

export class VoidPaymentDto {
  @IsString() @MinLength(3) @MaxLength(300)
  reason!: string;
}

export class RevenueQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(3) @Max(36)
  months?: number;
}
