import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { MerchantSignupFieldsDto } from './merchant-signup-fields.dto';

export class RegisterMerchantDto extends MerchantSignupFieldsDto {
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

  /** Nom de l'appareil (pour créer une session avec refresh token) */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  deviceName?: string;

  /** OS de l'appareil */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  deviceOS?: string;

  /** Identifiant unique de l'appareil */
  @IsString()
  @IsOptional()
  @MaxLength(200)
  deviceId?: string;
}
