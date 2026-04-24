import { IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min, Max } from 'class-validator';

export class CreateTransactionDto {
  @IsUUID()
  clientId: string;

  @IsEnum(['EARN_POINTS', 'REDEEM_REWARD'])
  type: 'EARN_POINTS' | 'REDEEM_REWARD';

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Le montant ne peut pas être négatif' })
  @Max(1000000, { message: 'Le montant ne peut pas dépasser 1 000 000 DH' })
  amount: number;

  @IsInt({ message: 'Le nombre de points doit être un entier' })
  @IsPositive({ message: 'Le nombre de points doit être supérieur à zéro' })
  @Max(1000000, { message: 'Le nombre de points ne peut pas dépasser 1 000 000' })
  points: number;

  @IsUUID()
  @IsOptional()
  rewardId?: string;
}
