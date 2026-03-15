import { IsEmail, IsNotEmpty, IsString, IsOptional, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
  @IsEmail()
  @IsNotEmpty()
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  password: string;

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
