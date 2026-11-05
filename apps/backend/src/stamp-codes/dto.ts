import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Length, Matches, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { MAX_STAMPS_PER_TX, MAX_STAMP_CODES_PER_BATCH } from '../common/constants';
import { STAMP_CODE_TOKEN_RE } from './stamp-code-token.service';

/**
 * A batch of single-use QR codes for e-commerce parcels. The merchant sets
 * either a stamp count or an order amount (converted with the merchant's
 * amount-per-stamp rule): exactly one of the two, checked by the service.
 */
export class CreateStampCodeBatchDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 80, { message: 'Le libellé doit contenir entre 1 et 80 caractères' })
  label: string;

  @IsInt({ message: 'La quantité doit être un entier' })
  @Min(1, { message: 'La quantité doit être d\'au moins 1' })
  @Max(MAX_STAMP_CODES_PER_BATCH, { message: `Maximum ${MAX_STAMP_CODES_PER_BATCH} QR codes par lot` })
  quantity: number;

  @IsOptional()
  @IsInt({ message: 'Le nombre de tampons doit être un entier' })
  @IsPositive({ message: 'Le nombre de tampons doit être supérieur à zéro' })
  @Max(MAX_STAMPS_PER_TX, { message: `Maximum ${MAX_STAMPS_PER_TX} tampons par QR code` })
  stamps?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive({ message: 'Le montant doit être supérieur à zéro' })
  @Max(1_000_000, { message: 'Le montant ne peut pas dépasser 1 000 000' })
  amount?: number;
}

export class RedeemStampCodeDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(STAMP_CODE_TOKEN_RE, { message: 'QR code invalide' })
  token: string;
}
