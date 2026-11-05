import { IntersectionType, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateStoreDto } from './create-store.dto';

class StoreActiveFlagDto {
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

/**
 * Every CreateStoreDto field made optional, plus `isActive`. `telephone` /
 * `email` accept `null` to clear the value.
 */
export class UpdateStoreDto extends IntersectionType(PartialType(CreateStoreDto), StoreActiveFlagDto) {}
