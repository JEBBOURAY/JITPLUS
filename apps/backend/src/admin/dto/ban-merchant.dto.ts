import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class BanMerchantDto {
  @ApiPropertyOptional({ description: 'Reason for the ban (stored in audit log metadata)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
