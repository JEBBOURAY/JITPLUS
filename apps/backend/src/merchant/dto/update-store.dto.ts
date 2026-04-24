import { IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, IsUrl, MaxLength, MinLength, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MerchantCategory } from '@prisma/client';
import { SocialLinksDto } from './social-links.dto';

export class UpdateStoreDto {
  @IsString()
  @MinLength(2, { message: 'Le nom du magasin doit contenir au moins 2 caractères' })
  @MaxLength(100)
  @IsOptional()
  nom?: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  description?: string;

  @IsEnum(MerchantCategory)
  @IsOptional()
  categorie?: MerchantCategory;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  ville?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  quartier?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  adresse?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  telephone?: string;

  @IsEmail({}, { message: 'Email invalide' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  email?: string;

  @IsUrl({}, { message: 'URL du logo invalide' })
  @IsOptional()
  logoUrl?: string;

  @IsUrl({}, { message: 'URL de la couverture invalide' })
  @IsOptional()
  coverUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SocialLinksDto)
  socialLinks?: SocialLinksDto;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
