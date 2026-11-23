import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { COLLECTION_LIMITS as L } from './collection-rules';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class CollectionItemDto {
  @ApiPropertyOptional({ description: 'Produit existant (modification) : garde les produits déjà cochés par les clients' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Espresso' })
  @IsString()
  @MaxLength(L.LABEL_MAX)
  label: string;

  @ApiPropertyOptional({ description: 'Photo envoyée avec /merchant/upload-image?type=collection' })
  @ValidateIf((o) => o.imageUrl !== null && o.imageUrl !== undefined)
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;
}

export class CreateCollectionDto {
  @ApiProperty({ example: 'Collection d\'été' })
  @IsString()
  @MinLength(1)
  @MaxLength(L.NAME_MAX)
  name: string;

  @ApiProperty({ type: () => [CollectionItemDto], description: 'Produits à collectionner' })
  @IsArray()
  @ArrayMinSize(L.MIN_ITEMS)
  @ArrayMaxSize(L.MAX_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CollectionItemDto)
  items: CollectionItemDto[];

  @ApiProperty({ example: 'Un café glacé', description: 'Le cadeau offert une fois la collection complète' })
  @IsString()
  @MinLength(1)
  @MaxLength(L.GIFT_MAX)
  giftLabel: string;

  @ApiPropertyOptional({ description: 'Photo du cadeau, envoyée avec /merchant/upload-image?type=collection' })
  @ValidateIf((o) => o.giftImageUrl !== null && o.giftImageUrl !== undefined)
  @IsString()
  @MaxLength(500)
  giftImageUrl?: string | null;

  @ApiPropertyOptional({ description: 'Un seul produit par client et par jour' })
  @IsOptional()
  @IsBoolean()
  onePerVisit?: boolean;

  @ApiPropertyOptional({ description: 'Une nouvelle collection démarre après le cadeau' })
  @IsOptional()
  @IsBoolean()
  repeatable?: boolean;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(L.MAX_COUPON_DAYS)
  couponValidityDays?: number;

  @ApiPropertyOptional({ example: 0, description: 'Heures avant que le cadeau soit utilisable' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(L.MAX_GIFT_DELAY_HOURS)
  giftDelayHours?: number;

  @ApiPropertyOptional({ example: '2027-03-31', description: 'Dernier jour (vide = sans fin)' })
  @ValidateIf((o) => o.endsOn !== null && o.endsOn !== undefined)
  @Matches(YMD)
  endsOn?: string | null;
}

export class CheckCollectionItemsDto {
  @ApiProperty()
  @IsUUID()
  clientId: string;

  @ApiProperty({ type: [String], description: 'Produits achetés pendant cette visite' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(L.MAX_ITEMS)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  itemIds: string[];
}
