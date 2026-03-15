import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty({ message: 'Le nom de l\'appareil est requis' })
  @MaxLength(100)
  deviceName: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceOS?: string;
}
