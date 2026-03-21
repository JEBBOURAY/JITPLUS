import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength, Matches, IsNumber, IsBoolean, IsUrl, Equals, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { MerchantCategory } from '@prisma/client';

export class RegisterMerchantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Le nom ne doit pas dépasser 100 caractères' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  nom: string;

  @IsEmail({}, { message: 'Adresse email invalide' })
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(100, { message: 'Le mot de passe est trop long' })
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'Le mot de passe doit contenir au moins une majuscule, un chiffre et un caractère spécial',
  })
  password: string;

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

  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'L\'URL du logo doit être une URL valide (http/https)' })
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

  /** Code de parrainage optionnel d'un commerce existant */
  @IsString()
  @IsOptional()
  referralCode?: string;
}
