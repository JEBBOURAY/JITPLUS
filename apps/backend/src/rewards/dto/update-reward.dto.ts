import { IsNumber, IsOptional, IsPositive, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class UpdateRewardDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  titre?: string;

  @IsNumber()
  @IsPositive()
  @IsOptional()
  cout?: number;

  @IsString()
  @IsOptional()
  description?: string;

  // Allow null to explicitly clear the image
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @IsOptional()
  @MaxLength(500)
  @Matches(/^(https?:\/\/|\/uploads\/).+/i)
  imageUrl?: string | null;
}
