import { IsEnum, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MerchantCategory, MerchantPlan } from '@prisma/client';
import { MERCHANT_PUSH_ACTIONS } from '../../merchant-inbox/merchant-notif-policy';

/** Audience filters shared by the preview and the send. */
export class MerchantNewsAudienceDto {
  @ApiPropertyOptional({ enum: MerchantPlan })
  @IsOptional() @IsEnum(MerchantPlan)
  plan?: MerchantPlan;

  @ApiPropertyOptional({ description: 'City (case-insensitive exact match)' })
  @IsOptional() @IsString() @MaxLength(100)
  ville?: string;

  @ApiPropertyOptional({ enum: MerchantCategory })
  @IsOptional() @IsEnum(MerchantCategory)
  categorie?: MerchantCategory;

  @ApiPropertyOptional({ description: 'Only merchants registered at least N days ago' })
  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  minAccountAgeDays?: number;
}

export class SendMerchantNewsDto extends MerchantNewsAudienceDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120)
  title!: string;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(500)
  body!: string;

  @ApiPropertyOptional({ enum: MERCHANT_PUSH_ACTIONS, description: 'Screen opened on tap' })
  @IsOptional() @IsIn([...MERCHANT_PUSH_ACTIONS])
  action?: string;
}
