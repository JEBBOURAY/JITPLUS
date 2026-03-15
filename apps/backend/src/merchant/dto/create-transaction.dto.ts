import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';

export class CreateTransactionDto {
  @IsUUID()
  clientId: string;

  @IsEnum(['EARN_POINTS', 'REDEEM_REWARD'])
  type: 'EARN_POINTS' | 'REDEEM_REWARD';

  @IsNumber()
  @Min(0, { message: 'Le montant ne peut pas être négatif' })
  amount: number;

  @IsNumber()
  @IsPositive({ message: 'Le nombre de points doit être supérieur à zéro' })
  points: number;

  @IsUUID()
  @IsOptional()
  rewardId?: string;
}
