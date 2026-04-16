import { IsString, IsOptional, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  password?: string;

  /** Google ID token for re-authentication */
  @IsOptional()
  @IsString()
  idToken?: string;

  /** Apple identity token for re-authentication */
  @IsOptional()
  @IsString()
  appleIdentityToken?: string;
}
