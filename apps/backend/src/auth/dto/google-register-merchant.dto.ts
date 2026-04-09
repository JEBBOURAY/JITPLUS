import { IsEnum, IsNotEmpty, IsOptional, IsString, IsNumber, IsBoolean, IsUrl, MaxLength, Matches, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { MerchantCategory } from '@prisma/client';

/**
 * DTO for merchant registration via Google Sign-In.
 * Same as RegisterMerchantDto but uses an idToken instead of password.
 */
export class GoogleRegisterMerchantDto {
  @IsString()
  @IsNotEmpty({ message: 'Le token Google est requis' })
  idToken: string;

  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Le nom ne doit pas dépasser 100 caractères' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  nom?: string;

  /** Nom du commerce (utilisé pour le premier store) */
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Le nom du commerce ne doit pas dépasser 100 caractères' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  nomCommerce?: string;

  @IsEnum(MerchantCategory)
  @IsOptional()
  categorie?: MerchantCategory;

  @IsString()
  @IsOptional()
  ville?: string;

  @IsString()
  @IsOptional()
  quartier?: string;

  @IsString()
  @IsOptional()
  adresse?: string;

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: "L'URL du logo doit être une URL valide (http/https)" })
  @IsOptional()
  logoUrl?: string;

  @IsNumber()
  @IsOptional()
  @Min(-90, { message: 'La latitude doit être entre -90 et 90' })
  @Max(90, { message: 'La latitude doit être entre -90 et 90' })
  latitude?: number;

  @IsNumber()
  @IsOptional()
  @Min(-180, { message: 'La longitude doit être entre -180 et 180' })
  @Max(180, { message: 'La longitude doit être entre -180 et 180' })
  longitude?: number;

  @IsBoolean()
  @IsOptional()
  termsAccepted?: boolean;

  @IsString()
  @IsOptional()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Numéro de téléphone invalide' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  phoneNumber?: string;

  /** Prénom du propriétaire (optionnel) */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  prenom?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  deviceName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  deviceOS?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  deviceId?: string;

  /** Description du commerce (optionnelle) */
  @IsString()
  @IsOptional()
  @MaxLength(1000, { message: 'La description ne doit pas dépasser 1000 caractères' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  description?: string;

  /** Téléphone du commerce (optionnel) */
  @IsString()
  @IsOptional()
  @MaxLength(20)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  storePhone?: string;

  /** Instagram du commerce (optionnel) */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  instagram?: string;

  /** TikTok du commerce (optionnel) */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  tiktok?: string;

  /** Code de parrainage optionnel d'un commerce existant */
  @IsString()
  @IsOptional()
  referralCode?: string;
}
