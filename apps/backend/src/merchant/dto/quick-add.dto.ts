import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

/**
 * "Quick-Add" — merchant credits points to a walk-in client identified by
 * their phone number (no app, no SMS). Backend creates an anonymous Client
 * row and returns a WhatsApp-ready claim URL.
 */
export class QuickAddTransactionDto {
  /** Local or E.164 phone. Backend normalises to E.164 using countryCode. */
  @IsString()
  @Length(6, 25)
  // Lookahead enforces at least 6 actual digits so '+++---' or '(   )' can't
  // pass even though they fit the length/character class.
  @Matches(/^(?=(?:[^\d]*\d){6,})[+\d\s().-]+$/, { message: 'Format de téléphone invalide' })
  telephone: string;

  /** ISO-3166-1 alpha-2 country code. Defaults to MA on the backend. */
  @IsOptional()
  @IsString()
  @Length(2, 5)
  countryCode?: string;

  /** Optional first name to personalise the WhatsApp greeting. */
  @IsOptional()
  @IsString()
  @Length(1, 100)
  prenom?: string;

  @IsEnum(['EARN_POINTS', 'REDEEM_REWARD'])
  type: 'EARN_POINTS' | 'REDEEM_REWARD';

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Le montant ne peut pas être négatif' })
  @Max(1_000_000, { message: 'Le montant ne peut pas dépasser 1 000 000 DH' })
  amount: number;

  @IsInt({ message: 'Le nombre de points doit être un entier' })
  @IsPositive({ message: 'Le nombre de points doit être supérieur à zéro' })
  @Max(1_000_000)
  points: number;

  @IsOptional()
  @IsUUID()
  rewardId?: string;
}

export class ConsumeClaimDto {
  @IsString()
  @Length(16, 256)
  token: string;
}
