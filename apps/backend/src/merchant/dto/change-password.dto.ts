import { IsString, MinLength, MaxLength, Matches, IsOptional, IsBoolean } from 'class-validator';

export class ChangePasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  currentPassword?: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(100, { message: 'Le mot de passe est trop long' })
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'Le mot de passe doit contenir au moins une majuscule, un chiffre et un caractère spécial',
  })
  newPassword: string;

  @IsBoolean()
  @IsOptional()
  logoutOthers?: boolean;

  /** Google ID token: replaces currentPassword for Google accounts. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  idToken?: string;

  /** Apple identity token: replaces currentPassword for Apple accounts. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  appleIdentityToken?: string;
}
