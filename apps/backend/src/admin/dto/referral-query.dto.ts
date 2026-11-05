import { IsIn, IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayoutStatus } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/**
 * Admin referral / payout lists. `search` and `status` live in the DTO: with
 * `forbidNonWhitelisted`, a bare `PaginationQueryDto` would reject them.
 */
export class ReferralListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class ClientReferralListQueryDto extends ReferralListQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'VALIDATED'] })
  @IsOptional()
  @IsIn(['PENDING', 'VALIDATED'])
  status?: 'PENDING' | 'VALIDATED';
}

export class PayoutRequestListQueryDto extends ReferralListQueryDto {
  @ApiPropertyOptional({ enum: PayoutStatus })
  @IsOptional()
  @IsIn(Object.values(PayoutStatus))
  status?: PayoutStatus;
}

export class TopReferrersQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export class UpdatePayoutStatusDto {
  @ApiProperty({ enum: PayoutStatus })
  @IsIn(Object.values(PayoutStatus))
  status: PayoutStatus;
}
