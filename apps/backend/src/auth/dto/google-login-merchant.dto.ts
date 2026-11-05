import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class GoogleLoginMerchantDto {
  @IsString()
  @IsNotEmpty({ message: 'Le token Google est requis' })
  idToken: string;

  /** Required: a sign-in without a device gets no DeviceSession, so its token would be refused. */
  @IsString()
  @IsNotEmpty({ message: 'Le nom de l\'appareil est requis' })
  @MaxLength(100)
  deviceName: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  deviceOS?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  deviceId?: string;
}
