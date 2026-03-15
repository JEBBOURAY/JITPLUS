import { IsOptional, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SetPlanDatesDto {
  @ApiPropertyOptional({ description: 'Subscription start date — updates trialStartedAt (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Subscription end date — sets planExpiresAt and promotes merchant to time-limited PREMIUM (ISO 8601). Pass null string to clear.' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
