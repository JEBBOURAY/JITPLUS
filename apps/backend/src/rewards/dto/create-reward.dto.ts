import { IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

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
}
