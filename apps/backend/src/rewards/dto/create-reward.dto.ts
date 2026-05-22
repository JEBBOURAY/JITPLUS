import { IsNumber, IsOptional, IsPositive, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateRewardDto {
  @IsString()
  @MinLength(1)
  titre: string;

  @IsNumber()
  @IsPositive()
  cout: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  @Matches(/^(https?:\/\/|\/uploads\/).+/i)
  imageUrl?: string;
}
