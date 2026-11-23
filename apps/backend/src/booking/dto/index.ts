import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AvailabilityExceptionType } from '@prisma/client';
import { MAX_BOOKING_CAPACITY, MAX_HOUR_RANGES, SLOT_STEPS } from '../booking.constants';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

// ── Merchant: settings ────────────────────────────────────────

export class UpdateBookingSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoConfirm?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(10_080) minNoticeMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(180) maxAdvanceDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(168) cancelDeadlineHours?: number;
  @ApiPropertyOptional({ enum: SLOT_STEPS }) @IsOptional() @IsIn(SLOT_STEPS) slotStepMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(20) noShowLimit?: number;
  @ApiPropertyOptional({ description: 'Bookings taken at the same time' }) @IsOptional() @IsInt() @Min(1) @Max(MAX_BOOKING_CAPACITY) capacity?: number;
}

// ── Merchant: services ────────────────────────────────────────

export class CreateServiceDto {
  @ApiPropertyOptional({ description: 'Catalogue entry; omit for a custom service' })
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiPropertyOptional({ description: 'Required for a custom service; defaults to the template name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  nom?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string;

  @ApiProperty({ description: 'Set by the merchant, minutes', example: 30 })
  @IsInt()
  @Min(5)
  @Max(720)
  durationMin: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(240) bufferMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000) priceFrom?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateServiceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(120) nom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(5) @Max(720) durationMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(240) bufferMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000) priceFrom?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(1000) order?: number;
}

// ── Merchant: hours ───────────────────────────────────────────

export class HourRangeDto {
  @ApiProperty({ description: '1 = Monday … 7 = Sunday' }) @IsInt() @Min(1) @Max(7) weekday: number;
  @ApiProperty({ description: 'Local minutes since midnight' }) @IsInt() @Min(0) @Max(1439) startMin: number;
  @ApiProperty() @IsInt() @Min(1) @Max(1440) endMin: number;
}

export class SetHoursDto {
  @ApiProperty({ type: [HourRangeDto] })
  @IsArray()
  @ArrayMaxSize(MAX_HOUR_RANGES)
  @ValidateNested({ each: true })
  @Type(() => HourRangeDto)
  ranges: HourRangeDto[];
}

export class CreateExceptionDto {
  @ApiPropertyOptional({ enum: AvailabilityExceptionType }) @IsOptional() @IsEnum(AvailabilityExceptionType) type?: AvailabilityExceptionType;
  @ApiProperty() @IsDateString() startsAt: string;
  @ApiProperty() @IsDateString() endsAt: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

// ── Merchant: agenda and bookings ─────────────────────────────

export class AgendaQueryDto {
  @ApiProperty() @IsDateString() from: string;
  @ApiProperty() @IsDateString() to: string;
}

export class MerchantCreateBookingDto {
  @ApiProperty() @IsUUID() serviceId: string;
  @ApiProperty() @IsDateString() startsAt: string;
  @ApiPropertyOptional({ description: 'A client of the merchant (has a loyalty card)' }) @IsOptional() @IsUUID() clientId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) clientName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) clientPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class RescheduleBookingDto {
  @ApiProperty({ description: 'New start; the duration and the buffer stay the same' }) @IsDateString() startsAt: string;
}

export class CancelBookingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

// ── Client ────────────────────────────────────────────────────

export class AvailableDaysQueryDto {
  @ApiProperty() @IsUUID() serviceId: string;
}

export class AvailabilityQueryDto {
  @ApiProperty() @IsUUID() serviceId: string;
  @ApiProperty({ example: '2026-11-23' }) @Matches(YMD) date: string;
}

export class ClientCreateBookingDto {
  @ApiProperty() @IsUUID() serviceId: string;
  @ApiProperty() @IsDateString() startsAt: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) note?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) idempotencyKey?: string;
}

/** Client position, for "nearest first" in the booking search. */
export class SearchBookingQueryDto {
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng?: number;
}

export class ClientBookingsQueryDto {
  @ApiPropertyOptional({ enum: ['upcoming', 'past'] }) @IsOptional() @IsIn(['upcoming', 'past']) scope?: 'upcoming' | 'past';
}
