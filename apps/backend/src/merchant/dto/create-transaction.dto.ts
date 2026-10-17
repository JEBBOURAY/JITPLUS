import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsUUID, Min, Max } from 'class-validator';

export class CreateTransactionDto {
  @IsUUID()
  clientId: string;

  @IsEnum(['EARN_STAMPS', 'REDEEM_REWARD'])
  type: 'EARN_STAMPS' | 'REDEEM_REWARD';

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Le montant ne peut pas être négatif' })
  @Max(1000000, { message: 'Le montant ne peut pas dépasser 1 000 000 DH' })
  amount: number;

  @IsInt({ message: 'Le nombre de tampons doit être un entier' })
  @IsPositive({ message: 'Le nombre de tampons doit être supérieur à zéro' })
  @Max(1000000, { message: 'Le nombre de tampons ne peut pas dépasser 1 000 000' })
  stamps: number;

  @IsUUID()
  @IsOptional()
  rewardId?: string;
}
