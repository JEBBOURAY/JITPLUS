import { IsEnum, IsNotEmpty, IsNumber, Min } from 'class-validator';
import { PayoutMethod } from '@prisma/client';

export class RequestPayoutDto {
  @IsNumber()
  @Min(100, { message: 'Le montant minimum de retrait est de 100 DH' })
  amount: number;

  @IsEnum(PayoutMethod)
  method: PayoutMethod;

  @IsNotEmpty({ message: 'Les détails du compte (RIB ou Numéro) sont requis' })
  accountDetails: any;
}
