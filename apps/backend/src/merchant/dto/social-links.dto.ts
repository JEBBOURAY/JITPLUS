import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SocialLinksDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  instagram?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  facebook?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tiktok?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  snapchat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  youtube?: string;
}
