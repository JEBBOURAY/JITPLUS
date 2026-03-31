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
}
