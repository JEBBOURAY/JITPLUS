import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class VerifyQrDto {
  @IsString()
  @IsNotEmpty({ message: 'Le token QR est requis' })
  @MaxLength(1024, { message: 'Token QR trop long' })
  token: string;
}
