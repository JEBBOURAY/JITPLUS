import { IsEnum, IsOptional } from 'class-validator';

export enum UploadType {
  LOGO = 'logo',
  COVER = 'cover',
  GALLERY = 'gallery',
  REWARD = 'reward',
}

export class UploadQueryDto {
  @IsEnum(UploadType)
  @IsOptional()
  type?: UploadType = UploadType.LOGO;
}
