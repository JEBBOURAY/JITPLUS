import { IsOptional, IsString, MaxLength, Matches, IsUrl, ValidateIf } from 'class-validator';

// Instagram/TikTok/Snapchat/Facebook/YouTube handles: letters, digits, dot, underscore, dash.
// Accepts with or without the leading @ (the client strips it, but defense-in-depth).
const HANDLE_REGEX = /^@?[A-Za-z0-9._-]{1,100}$/;

export class SocialLinksDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(HANDLE_REGEX, { message: 'Instagram invalide' })
  instagram?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(HANDLE_REGEX, { message: 'Facebook invalide' })
  facebook?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(HANDLE_REGEX, { message: 'TikTok invalide' })
  tiktok?: string;

  // Website MUST be an http(s) absolute URL — blocks javascript:, data:, file: …
  // which the client could inject and which gets shown to end users in jitplus.
  @IsOptional()
  @ValidateIf((_o, v) => v !== '' && v !== undefined && v !== null)
  @IsString()
  @MaxLength(200)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'URL du site web invalide' })
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(HANDLE_REGEX, { message: 'Snapchat invalide' })
  snapchat?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(HANDLE_REGEX, { message: 'YouTube invalide' })
  youtube?: string;
}
