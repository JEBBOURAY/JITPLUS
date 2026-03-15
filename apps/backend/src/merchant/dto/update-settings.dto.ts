import { IsNumber, IsOptional, IsPositive } from 'class-validator';

export class UpdateSettingsDto {
  @IsNumber()
  @IsPositive()
  @IsOptional()
  pointsRate?: number;
}
