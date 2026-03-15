import { IsIn, IsOptional } from 'class-validator';

const VALID_PERIODS = ['day', 'week', 'month', 'year'] as const;
export type DashboardPeriod = (typeof VALID_PERIODS)[number];

export class DashboardQueryDto {
  @IsIn(VALID_PERIODS, { message: 'La période doit être day, week, month ou year' })
  @IsOptional()
  period?: DashboardPeriod = 'day';
}
