import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsNumber, IsBoolean, IsUrl, Equals, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { MerchantCategory } from '../../generated/client';

/**
 * DTO for merchant registration via Google Sign-In.
 * Same as RegisterMerchantDto but uses an idToken instead of password.
 */
export class GoogleRegisterMerchantDto {
  @IsString()
  @IsNotEmpty({ message: 'Le token Google est requis' })
  idToken: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Le nom ne doit pas dépasser 100 caractères' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  nom: string;

  @IsEnum(MerchantCategory)
  @IsNotEmpty()
  categorie: MerchantCategory;

  @IsString()
  @IsNotEmpty()
  ville: string;

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
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsBoolean()
  @Equals(true, { message: "Vous devez accepter les conditions d'utilisation" })
  termsAccepted: boolean;

  @IsString()
  @IsNotEmpty({ message: 'Le numéro de téléphone est obligatoire' })
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Numéro de téléphone invalide' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  phoneNumber: string;

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

  /** Code de parrainage optionnel d'un commerce existant */
  @IsString()
  @IsOptional()
  referralCode?: string;
}
