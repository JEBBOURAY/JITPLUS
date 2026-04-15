import { IsEmail, IsOptional, IsString, IsUrl, MaxLength, MinLength, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @MinLength(1, { message: 'Le nom ne peut pas être vide' })
  @MaxLength(100, { message: 'Le nom ne doit pas dépasser 100 caractères' })
  @IsOptional()
  nom?: string;

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
}
