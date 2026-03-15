import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Shared push-token update DTO — used by both merchant and client controllers.
 * Replaces two identical UpdatePushTokenDto definitions.
 */
export class UpdatePushTokenDto {
  @ApiProperty({ description: 'Firebase push notification token' })
  @IsString()
  @IsNotEmpty()
  pushToken: string;
}
