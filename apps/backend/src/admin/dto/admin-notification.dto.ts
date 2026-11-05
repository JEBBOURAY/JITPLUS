import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const ADMIN_NOTIFICATION_CHANNELS = ['PUSH', 'EMAIL', 'WHATSAPP'] as const;
export type AdminNotificationChannel = (typeof ADMIN_NOTIFICATION_CHANNELS)[number];

export const ADMIN_NOTIFICATION_AUDIENCES = ['MERCHANT_CLIENTS', 'ALL_CLIENTS', 'ALL_MERCHANTS'] as const;
export type AdminNotificationAudience = (typeof ADMIN_NOTIFICATION_AUDIENCES)[number];

export class SendAdminNotificationDto {
  @ApiProperty({ enum: ADMIN_NOTIFICATION_CHANNELS })
  @IsIn(ADMIN_NOTIFICATION_CHANNELS)
  channel: AdminNotificationChannel;

  @ApiPropertyOptional({ enum: ADMIN_NOTIFICATION_AUDIENCES, default: 'MERCHANT_CLIENTS' })
  @IsOptional()
  @IsIn(ADMIN_NOTIFICATION_AUDIENCES)
  audience: AdminNotificationAudience = 'MERCHANT_CLIENTS';

  /** Required for the MERCHANT_CLIENTS audience. */
  @ApiPropertyOptional()
  @ValidateIf((o: SendAdminNotificationDto) => o.audience === 'MERCHANT_CLIENTS')
  @IsUUID()
  merchantId?: string;

  /** Push title / email subject — unused by WhatsApp. */
  @ApiPropertyOptional()
  @ValidateIf((o: SendAdminNotificationDto) => o.channel !== 'WHATSAPP' || o.title !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string = '';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body: string;
}
