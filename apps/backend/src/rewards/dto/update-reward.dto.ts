import { IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

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
}
