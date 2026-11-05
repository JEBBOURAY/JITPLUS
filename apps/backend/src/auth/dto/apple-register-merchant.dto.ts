import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { MerchantSignupFieldsDto } from './merchant-signup-fields.dto';

/**
 * DTO for merchant registration via Apple Sign-In.
 * Same as GoogleRegisterMerchantDto but uses an identityToken instead of idToken.
 */
export class AppleRegisterMerchantDto extends MerchantSignupFieldsDto {
  @IsString()
  @IsNotEmpty({ message: "Le token Apple est requis" })
  identityToken: string;

  /** Apple provides givenName only on the very first sign-in */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  givenName?: string;

  /** Apple provides familyName only on the very first sign-in */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  familyName?: string;

  /** Raw nonce used to derive the SHA-256 nonce sent to Apple. Used to verify the JWT `nonce` claim (replay protection). */
  @IsString()
  @IsOptional()
  @MaxLength(128)
  rawNonce?: string;

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
}
