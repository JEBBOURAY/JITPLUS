import { IsEnum, IsInt, IsNumber, IsOptional, IsUUID, Min, Max } from 'class-validator';

/** PURCHASE = purchase without stamps that only gives a lucky-wheel spin. */
export const MERCHANT_TRANSACTION_TYPES = ['EARN_STAMPS', 'REDEEM_REWARD', 'PURCHASE'] as const;
export type MerchantTransactionType = (typeof MERCHANT_TRANSACTION_TYPES)[number];

export class CreateTransactionDto {
  @IsUUID()
  clientId: string;

  @IsEnum(MERCHANT_TRANSACTION_TYPES)
  type: MerchantTransactionType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Le montant ne peut pas être négatif' })
  @Max(1000000, { message: 'Le montant ne peut pas dépasser 1 000 000' })
  amount: number;

  /** 0 only for PURCHASE; EARN_STAMPS / REDEEM_REWARD counts are checked by the service. */
  @IsInt({ message: 'Le nombre de tampons doit être un entier' })
  @Min(0, { message: 'Le nombre de tampons ne peut pas être négatif' })
  @Max(1000000, { message: 'Le nombre de tampons ne peut pas dépasser 1 000 000' })
  stamps: number;

  @IsUUID()
  @IsOptional()
  rewardId?: string;
}
