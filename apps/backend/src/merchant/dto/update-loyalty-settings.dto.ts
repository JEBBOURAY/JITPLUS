import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsUUID, Min, ValidateIf } from 'class-validator';

export class PreviewAccumulationLimitDto {
  @IsInt()
  @Min(1)
  limit!: number;
}

export class UpdateLoyaltySettingsDto {
  @IsEnum(['POINTS', 'STAMPS'])
  @IsOptional()
  loyaltyType?: 'POINTS' | 'STAMPS';

  @IsNumber()
  @IsPositive()
  @IsOptional()
  conversionRate?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  stampsForReward?: number;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  pointsRate?: number;

  @ValidateIf((o) => o.accumulationLimit !== null)
  @IsInt({ message: 'La limite d\'accumulation doit être un entier' })
  @Min(1, { message: 'La limite d\'accumulation doit être ≥ 1' })
  @IsOptional()
  accumulationLimit?: number | null;

  @IsBoolean()
  @IsOptional()
  forceCapClients?: boolean;

  @ValidateIf((o) => o.activeRewardId !== null)
  @IsUUID('4', { message: 'activeRewardId doit être un UUID valide' })
  @IsOptional()
  activeRewardId?: string | null;
}
