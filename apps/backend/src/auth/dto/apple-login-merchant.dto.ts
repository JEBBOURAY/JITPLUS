import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class AppleLoginMerchantDto {
  @IsString()
  @IsNotEmpty({ message: 'Le token Apple est requis' })
  identityToken: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  givenName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  familyName?: string;

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

  /** Raw nonce used to derive the SHA-256 nonce sent to Apple. Used to verify the JWT `nonce` claim. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  rawNonce?: string;
}
