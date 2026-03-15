import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshMerchantTokenDto {
  @ApiProperty({ description: 'Opaque refresh token issued at login' })
  @IsString()
  @IsNotEmpty()
  refresh_token: string;

  @ApiProperty({ description: 'Session ID (jti) of the original access token' })
  @IsString()
  @IsNotEmpty()
  session_id: string;
}
