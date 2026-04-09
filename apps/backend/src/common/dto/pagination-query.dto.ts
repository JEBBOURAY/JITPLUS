import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';
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
}

/**
 * Client list query — search + status filter.
 */
export class ClientListQueryDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

/**
 * Notification list query — search + channel filter.
 */
export class NotificationListQueryDto extends SearchPaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  channel?: string;
}
