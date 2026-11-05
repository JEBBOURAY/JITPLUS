import { IsBoolean, IsOptional } from 'class-validator';

/** Per-category push switches of JitPlus Pro. Omitted keys stay unchanged. */
export class UpdateNotificationPrefsDto {
  @IsOptional() @IsBoolean() news?: boolean;
  @IsOptional() @IsBoolean() tips?: boolean;
  @IsOptional() @IsBoolean() reminders?: boolean;
  @IsOptional() @IsBoolean() reports?: boolean;
}
