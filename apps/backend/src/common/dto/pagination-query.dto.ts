import { IsOptional, IsInt, Min, Max, IsString, IsIn, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Shared pagination query DTO — replaces manual parseInt(page/limit) in 5+ controllers.
 * Usage: `@Query() pagination: PaginationQueryDto`
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

/**
 * Pagination + optional text search.
 */
export class SearchPaginationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export const MERCHANT_CLIENT_VIEWS = ['reward', 'loyal', 'inactive'] as const;
export type MerchantClientView = (typeof MERCHANT_CLIENT_VIEWS)[number];

/**
 * Merchant's own client list — search + optional view (omitted = newest first).
 */
export class MerchantClientsQueryDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional({ enum: MERCHANT_CLIENT_VIEWS })
  @IsOptional()
  @IsIn(MERCHANT_CLIENT_VIEWS)
  view?: MerchantClientView;
}

/**
 * Merchant list query — search + plan/status/categorie filters.
 */
export class MerchantListQueryDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categorie?: string;

  @ApiPropertyOptional({ enum: ['active30', 'dormant', 'never'] })
  @IsOptional()
  @IsIn(['active30', 'dormant', 'never'])
  activity?: 'active30' | 'dormant' | 'never';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ville?: string;

  @ApiPropertyOptional({ enum: ['recent', 'oldest', 'name', 'clients', 'views', 'expiring'] })
  @IsOptional()
  @IsIn(['recent', 'oldest', 'name', 'clients', 'views', 'expiring'])
  sort?: 'recent' | 'oldest' | 'name' | 'clients' | 'views' | 'expiring';
}

/**
 * Client list query — search + status filter.
 */
export class ClientListQueryDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: ['active30', 'inactive', 'never'] })
  @IsOptional()
  @IsIn(['active30', 'inactive', 'never'])
  activity?: 'active30' | 'inactive' | 'never';

  @ApiPropertyOptional({ enum: ['registered', 'anonymous'] })
  @IsOptional()
  @IsIn(['registered', 'anonymous'])
  type?: 'registered' | 'anonymous';

  @ApiPropertyOptional({ enum: ['recent', 'oldest', 'name', 'cards'] })
  @IsOptional()
  @IsIn(['recent', 'oldest', 'name', 'cards'])
  sort?: 'recent' | 'oldest' | 'name' | 'cards';
}

/**
 * Notification list query — search + channel filter.
 */
export class NotificationListQueryDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  channel?: string;

  @ApiPropertyOptional({ enum: ['admin', 'merchant'] })
  @IsOptional()
  @IsIn(['admin', 'merchant'])
  sender?: 'admin' | 'merchant';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  merchantId?: string;
}
