import { IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { MerchantCategory } from '@prisma/client';

export class UpdateStoreDto {
  @IsString()
  @MaxLength(100)
  @IsOptional()
  nom?: string;

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

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
