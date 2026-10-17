import { IsIn, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { INSIGHT_PERIODS, type InsightPeriod } from '../admin-insights.service';

export class InsightsQueryDto {
  @ApiPropertyOptional({ enum: INSIGHT_PERIODS, default: 30, description: 'Analysis window in days' })
  @IsOptional()
  @Type(() => Number)
  @IsIn(INSIGHT_PERIODS as unknown as number[])
  days?: InsightPeriod;
}
