import { IsEmail, IsEnum, IsNumber, IsOptional, IsString, IsUrl, MaxLength, Matches, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { MerchantCategory } from '@prisma/client';

class SocialLinksDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  instagram?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  facebook?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tiktok?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  snapchat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  youtube?: string;
}

export class UpdateProfileDto {
  @IsString()
  @MaxLength(100, { message: 'Le nom ne doit pas dépasser 100 caractères' })
  @IsOptional()
  nom?: string;

  @IsString()
  @MaxLength(1000, { message: 'La description ne doit pas dépasser 1000 caractères' })
  @IsOptional()
  description?: string;

  @IsEnum(MerchantCategory)
  @IsOptional()
  categorie?: MerchantCategory;

  @IsString()
  @MaxLength(100, { message: 'La ville ne doit pas dépasser 100 caractères' })
  @IsOptional()
  ville?: string;

  @IsString()
  @MaxLength(100, { message: 'Le quartier ne doit pas dépasser 100 caractères' })
  @IsOptional()
  quartier?: string;

  @IsString()
  @MaxLength(200, { message: "L'adresse ne doit pas dépasser 200 caractères" })
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
  @MaxLength(3, { message: 'Code pays invalide' })
  @Matches(/^[A-Z]{2,3}$/, { message: 'Code pays invalide' })
  @IsOptional()
  countryCode?: string;

  @IsString()
  @MaxLength(20, { message: 'Numéro de téléphone trop long' })
  @IsOptional()
  phoneNumber?: string;

  @IsEmail({}, { message: 'Adresse email invalide' })
  @IsString()
  @MaxLength(255, { message: 'Email trop long' })
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
}
