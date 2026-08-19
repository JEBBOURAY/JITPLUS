import { IsEmail, IsOptional, IsString, IsUrl, MaxLength, MinLength, Matches, IsArray, ArrayMaxSize, IsEnum, IsIn, IsObject, ValidateNested, IsBoolean, ArrayUnique } from 'class-validator';
import { Type } from 'class-transformer';
import { MerchantCategory } from '@prisma/client';

const MERCHANT_BADGE_CODES = [
  'WIFI',
  'PARKING',
  'TERRASSE',
  'CLIMATISE',
  'CARTE_BANCAIRE',
  'LIVRAISON',
  'TAKEAWAY',
  'HALAL',
  'VEGETARIEN',
  'ACCESS_PMR',
  'PETS_OK',
  'KID_FRIENDLY',
  'RESERVATION',
] as const;

class OpeningSlotDto {
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Heure invalide (HH:mm attendu)' })
  open!: string;

  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Heure invalide (HH:mm attendu)' })
  close!: string;
}

class OpeningHoursDayDto {
  @IsBoolean()
  @IsOptional()
  closed?: boolean;

  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => OpeningSlotDto)
  @IsOptional()
  slots?: OpeningSlotDto[];
}

class OpeningHoursDto {
  @ValidateNested() @Type(() => OpeningHoursDayDto) @IsOptional() mon?: OpeningHoursDayDto;
  @ValidateNested() @Type(() => OpeningHoursDayDto) @IsOptional() tue?: OpeningHoursDayDto;
  @ValidateNested() @Type(() => OpeningHoursDayDto) @IsOptional() wed?: OpeningHoursDayDto;
  @ValidateNested() @Type(() => OpeningHoursDayDto) @IsOptional() thu?: OpeningHoursDayDto;
  @ValidateNested() @Type(() => OpeningHoursDayDto) @IsOptional() fri?: OpeningHoursDayDto;
  @ValidateNested() @Type(() => OpeningHoursDayDto) @IsOptional() sat?: OpeningHoursDayDto;
  @ValidateNested() @Type(() => OpeningHoursDayDto) @IsOptional() sun?: OpeningHoursDayDto;
}

export class UpdateProfileDto {
  @IsString()
  @MinLength(1, { message: 'Le nom ne peut pas être vide' })
  @MaxLength(100, { message: 'Le nom ne doit pas dépasser 100 caractères' })
  @IsOptional()
  nom?: string;

  @IsString()
  @MaxLength(3, { message: 'Code pays invalide' })
  @Matches(/^[A-Z]{2,3}$/, { message: 'Code pays invalide' })
  @IsOptional()
  countryCode?: string;

  @IsString()
  @MaxLength(20, { message: 'Numéro de téléphone trop long' })
  @IsOptional()
  phoneNumber?: string;

  @IsEmail({}, { message: 'Adresse email invalide' })
  @IsString()
  @MaxLength(255, { message: 'Email trop long' })
  @IsOptional()
  email?: string;

  @IsUrl({}, { message: 'URL du logo invalide' })
  @IsOptional()
  logoUrl?: string | null;

  @IsString()
  @Matches(/^(https?:\/\/|\/uploads\/).+/i, { message: 'URL de couverture invalide' })
  @IsOptional()
  coverUrl?: string | null;

  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Couleur hex invalide (#RRGGBB attendu)' })
  @IsOptional()
  themeColor?: string;

  @IsString()
  @MaxLength(32, { message: 'Identifiant d\'icône trop long' })
  @Matches(/^[a-zA-Z][a-zA-Z0-9]{0,31}$/, { message: 'Identifiant d\'icône invalide' })
  @IsOptional()
  themeIcon?: string;

  @IsString()
  @Matches(/^(https?:\/\/|\/uploads\/).+/i, { message: 'URL du fond de carte invalide' })
  @IsOptional()
  cardBackgroundUrl?: string | null;

  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Couleur de fond de carte invalide (#RRGGBB)' })
  @IsOptional()
  cardBackgroundColor?: string | null;

  @IsString()
  @IsIn(['LIGHT', 'DARK'], { message: 'Couleur du texte invalide (LIGHT ou DARK)' })
  @IsOptional()
  cardTextColor?: string | null;

  @IsArray()
  @ArrayMaxSize(3, { message: 'Maximum 3 catégories secondaires' })
  @IsEnum(MerchantCategory, { each: true, message: 'Catégorie secondaire invalide' })
  @IsOptional()
  secondaryCategories?: MerchantCategory[];

  @IsString()
  @MaxLength(120, { message: 'Slogan trop long (120 caractères max)' })
  @IsOptional()
  tagline?: string;

  @IsArray()
  @ArrayMaxSize(8, { message: 'Maximum 8 badges' })
  @ArrayUnique({ message: 'Badges en double' })
  @IsString({ each: true })
  @IsIn(MERCHANT_BADGE_CODES as unknown as string[], { each: true, message: 'Badge invalide' })
  @IsOptional()
  badges?: string[];

  @IsArray()
  @ArrayMaxSize(5, { message: 'Maximum 5 photos dans la galerie' })
  @IsString({ each: true })
  @Matches(/^(https?:\/\/|\/uploads\/).+/i, { each: true, message: 'URL de photo invalide' })
  @IsOptional()
  gallery?: string[];

  @IsObject()
  @ValidateNested()
  @Type(() => OpeningHoursDto)
  @IsOptional()
  openingHours?: OpeningHoursDto;

  @IsBoolean({ message: 'Valeur invalide pour la visibilité du guide de bienvenue' })
  @IsOptional()
  welcomeGuideVisible?: boolean;
}
