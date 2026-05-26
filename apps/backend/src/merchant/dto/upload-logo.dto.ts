import { IsEnum, IsOptional } from 'class-validator';

export enum UploadType {
  LOGO = 'logo',
  COVER = 'cover',
  GALLERY = 'gallery',
  REWARD = 'reward',
  CARD_BACKGROUND = 'cardBackground',
}

export class UploadQueryDto {
  @IsEnum(UploadType)
  @IsOptional()
  type?: UploadType = UploadType.LOGO;
}
