import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Shared push-token update DTO — used by both merchant and client controllers.
 * Replaces two identical UpdatePushTokenDto definitions.
 */
export class UpdatePushTokenDto {
  @ApiProperty({ description: 'Firebase push notification token (empty string to clear on logout)' })
  @IsString()
  pushToken: string;

  @ApiPropertyOptional({ description: 'App language preference (fr, en, ar)' })
  @IsString()
  @IsIn(['fr', 'en', 'ar'])
  @IsOptional()
  language?: string;
}
