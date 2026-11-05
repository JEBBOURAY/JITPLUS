import { IsInt, Max, Min, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Upper bound for a reward's stamp cost. */
export const MAX_REWARD_COST = 1000;

export class CreateRewardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255) // column is VarChar(255): longer values were a 500
  titre: string;

  // Stamps required: an integer within the Int column (fractions / overflow were 500s)
  @IsInt()
  @Min(1)
  @Max(MAX_REWARD_COST)
  cout: number;

  @IsString()
  @IsOptional()
  @MaxLength(1000) // column is VarChar(1000)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  @Matches(/^(https?:\/\/|\/uploads\/).+/i)
  imageUrl?: string;
}
