import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsUUID, Min, Max, ValidateIf } from 'class-validator';
import { MAX_STAMP_VALIDITY_DAYS, MIN_STAMP_VALIDITY_DAYS } from '../../common/constants';

export class PreviewAccumulationLimitDto {
  @IsInt()
  @Min(1)
  limit!: number;
}

export class UpdateLoyaltySettingsDto {
  @IsEnum(['PER_VISIT', 'PER_AMOUNT'])
  @IsOptional()
  stampEarningMode?: 'PER_VISIT' | 'PER_AMOUNT';

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Min(0.01, { message: 'Le montant par tampon doit être ≥ 0.01' })
  @Max(10000, { message: 'Le montant par tampon ne peut pas dépasser 10 000' })
  @IsOptional()
  amountPerStamp?: number;

  @IsInt({ message: 'Le nombre de tampons doit être un entier' })
  @IsPositive()
  @Min(1, { message: 'Le nombre de tampons doit être ≥ 1' })
  @Max(100, { message: 'Le nombre de tampons ne peut pas dépasser 100' })
  @IsOptional()
  stampsForReward?: number;

  @ValidateIf((o) => o.accumulationLimit !== null)
  @IsInt({ message: "La limite d'accumulation doit être un entier" })
  @Min(1, { message: "La limite d'accumulation doit être ≥ 1" })
  @Max(1000000, { message: "La limite d'accumulation ne peut pas dépasser 1 000 000" })
  @IsOptional()
  accumulationLimit?: number | null;

  @ValidateIf((o) => o.stampValidityDays !== null)
  @IsInt({ message: 'La durée de validité doit être un nombre entier de jours' })
  @Min(MIN_STAMP_VALIDITY_DAYS, { message: `La durée de validité doit être d'au moins ${MIN_STAMP_VALIDITY_DAYS} jours` })
  @Max(MAX_STAMP_VALIDITY_DAYS, { message: `La durée de validité ne peut pas dépasser ${MAX_STAMP_VALIDITY_DAYS} jours` })
  @IsOptional()
  stampValidityDays?: number | null;

  @IsBoolean()
  @IsOptional()
  forceCapClients?: boolean;

  @ValidateIf((o) => o.activeRewardId !== null)
  @IsUUID('4', { message: 'activeRewardId doit être un UUID valide' })
  @IsOptional()
  activeRewardId?: string | null;
}
