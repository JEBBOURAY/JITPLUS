import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { MerchantSignupFieldsDto } from './merchant-signup-fields.dto';

/**
 * DTO for merchant registration via Google Sign-In.
 * Same as RegisterMerchantDto but uses an idToken instead of password.
 */
export class GoogleRegisterMerchantDto extends MerchantSignupFieldsDto {
  @IsString()
  @IsNotEmpty({ message: 'Le token Google est requis' })
  idToken: string;

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
