import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsDateString,
  IsArray,
  ValidateNested,
  Min,
  Max,
  MaxLength,
  IsEnum,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ── Prize DTO (nested in campaign creation) ──────────────────

export class CreatePrizeDto {
  @ApiProperty({ example: 'Café gratuit' })
  @IsString()
  @MaxLength(255)
  label: string;

  @ApiPropertyOptional({ example: 'Un café offert au choix' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: 3, description: 'Poids relatif pour le tirage pondéré' })
  @IsInt()
  @Min(1)
  weight: number;

  @ApiProperty({ example: 50, description: 'Stock total pour ce lot' })
  @IsInt()
  @Min(1)
  totalStock: number;

  @ApiPropertyOptional({ example: 72, description: 'Durée en heures pour réclamer le lot' })
  @IsOptional()
  @IsInt()
  @Min(1)
  claimWindowHours?: number;
}

export class UpdatePrizeDto {
  @ApiPropertyOptional({ description: 'ID du lot existant (omis pour un nouveau lot)' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'Café gratuit' })
  @IsString()
  @MaxLength(255)
  label: string;

  @ApiPropertyOptional({ example: 'Un café offert au choix' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  weight: number;

  @ApiProperty({ example: 50 })
  @IsInt()
  @Min(1)
  totalStock: number;

  @ApiPropertyOptional({ example: 72 })
  @IsOptional()
  @IsInt()
  @Min(1)
  claimWindowHours?: number;
}

// ── Campaign DTOs ────────────────────────────────────────────

export class CreateCampaignDto {
  @ApiProperty({ example: 'luckyWheel été 2026' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Tentez votre chance à chaque visite !' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 0.4, description: 'Probabilité globale de gagner (0.01 à 1.0)' })
  @IsNumber()
  @Min(0.01)
  @Max(1)
  globalWinRate: number;

  @ApiProperty({ example: '2026-05-01T00:00:00Z' })
  @IsDateString()
  startsAt: string;

  @ApiProperty({ example: '2026-08-31T23:59:59Z' })
  @IsDateString()
  endsAt: string;

  @ApiPropertyOptional({ example: 0, description: 'Coût en points pour un ticket (0 = gratuit avec transaction)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  ticketCostPoints?: number;

  @ApiPropertyOptional({ example: 5, description: 'Un ticket tous les N visites' })
  @IsOptional()
  @IsInt()
  @Min(1)
  ticketEveryNVisits?: number;

  @ApiPropertyOptional({ example: 50, description: 'Montant d\'achat minimum (en devise) pour obtenir un ticket de roue de la chance' })
  @IsOptional()
  @IsInt()
  @Min(0)
  minSpendAmount?: number;

  @ApiProperty({ type: [CreatePrizeDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePrizeDto)
  prizes: CreatePrizeDto[];
}

export class UpdateCampaignStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'PAUSED', 'ENDED'] })
  @IsEnum(['ACTIVE', 'PAUSED', 'ENDED'] as const)
  status: 'ACTIVE' | 'PAUSED' | 'ENDED';
}

export class UpdateCampaignDto {
  @ApiPropertyOptional({ example: 'luckyWheel été 2026' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ example: 0.4 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(1)
  globalWinRate?: number;

  @ApiPropertyOptional({ example: '2026-05-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-08-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minSpendAmount?: number;

  @ApiPropertyOptional({ type: [UpdatePrizeDto], description: 'Liste mise à jour des lots (remplace tous les lots existants)' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdatePrizeDto)
  prizes?: UpdatePrizeDto[];
}

// ── Draw DTOs ────────────────────────────────────────────────

export class TriggerDrawDto {
  @ApiProperty({ description: 'ID du ticket de roue de la chance' })
  @IsString()
  ticketId: string;
}

export class FulfilPrizeDto {
  @ApiProperty({ description: 'ID du tirage à valider' })
  @IsString()
  drawId: string;
}
