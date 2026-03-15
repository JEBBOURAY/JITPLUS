import { IsString, IsNotEmpty, Length, Matches, MaxLength, IsOptional, IsBoolean, IsEmail, IsDateString, ValidateIf } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9+\s\-()]{10,15}$/, { message: 'Numéro de téléphone invalide' })
  telephone: string;

  @IsOptional()
  @IsBoolean()
  isRegister?: boolean;
}

export class DevLoginDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9+\s\-()]{10,15}$/, { message: 'Numéro de téléphone invalide' })
  telephone: string;
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9+\s\-()]{10,15}$/, { message: 'Numéro de téléphone invalide' })
  telephone: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'Le code doit contenir 6 chiffres' })
  code: string;

  @IsOptional()
  @IsBoolean()
  isRegister?: boolean;
}

export class SendOtpEmailDto {
  @IsEmail({}, { message: 'Adresse email invalide' })
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsBoolean()
  isRegister?: boolean;
}

export class VerifyOtpEmailDto {
  @IsEmail({}, { message: 'Adresse email invalide' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'Le code doit contenir 6 chiffres' })
  code: string;

  @IsOptional()
  @IsBoolean()
  isRegister?: boolean;
}

export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty({ message: 'Le token Google est requis' })
  idToken: string;
}

export class CompleteProfileDto {
  @IsString()
  @IsNotEmpty({ message: 'Le prénom est requis' })
  prenom: string;

  @IsString()
  @IsNotEmpty({ message: 'Le nom est requis' })
  nom: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\s\-()]{10,15}$/, { message: 'Numéro de téléphone invalide' })
  telephone?: string;

  @IsBoolean()
  @IsNotEmpty({ message: 'Vous devez accepter les mentions légales' })
  termsAccepted: boolean;

  @IsOptional()
  @IsDateString()
  dateNaissance?: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  prenom?: string;

  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Adresse email invalide' })
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\s\-()]{10,15}$/, { message: 'Numéro de téléphone invalide' })
  telephone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3, { message: 'Code pays invalide' })
  @Matches(/^[A-Z]{2,3}$/, { message: 'Code pays invalide (ex: MA, FR, US)' })
  countryCode?: string;

  @IsOptional()
  @IsBoolean()
  shareInfoMerchants?: boolean;

  @IsOptional()
  @IsBoolean()
  notifWhatsapp?: boolean;

  @IsOptional()
  @ValidateIf(o => o.dateNaissance !== null)
  @IsDateString()
  dateNaissance?: string | null;
}

export class LoginEmailDto {
  @IsEmail({}, { message: 'Adresse email invalide' })
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est requis' })
  password: string;
}

export class LoginPhoneDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-9+\s\-()]{10,15}$/, { message: 'Numéro de téléphone invalide' })
  telephone: string;

  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est requis' })
  password: string;
}

export class SetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est requis' })
  @Length(8, 100, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'Le mot de passe doit contenir au moins une majuscule, un chiffre et un caractère spécial',
  })
  password: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'Le refresh token est requis' })
  refresh_token: string;
}

export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est requis' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'Veuillez confirmer la suppression en tapant "SUPPRIMER"' })
  @Matches(/^(SUPPRIMER|DELETE|حذف)$/, { message: 'Veuillez taper exactement "SUPPRIMER" pour confirmer' })
  confirmation: string;
}

// Re-export from shared DTO to avoid duplication
export { UpdatePushTokenDto } from '../common/dto/update-push-token.dto';
