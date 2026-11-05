import { IsInt, Max, Min, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { MAX_REWARD_COST } from './create-reward.dto';

export class UpdateRewardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255) // column is VarChar(255): longer values were a 500
  @IsOptional()
  titre?: string;

  // Stamps required: an integer within the Int column (fractions / overflow were 500s)
  @IsInt()
  @Min(1)
  @Max(MAX_REWARD_COST)
  @IsOptional()
  cout?: number;

  @IsString()
  @IsOptional()
  @MaxLength(1000) // column is VarChar(1000)
  description?: string;

  // Allow null to explicitly clear the image
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @IsOptional()
  @MaxLength(500)
  @Matches(/^(https?:\/\/|\/uploads\/).+/i)
  imageUrl?: string | null;
}
