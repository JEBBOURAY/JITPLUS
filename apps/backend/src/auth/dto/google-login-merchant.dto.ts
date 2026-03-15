import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class GoogleLoginMerchantDto {
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
