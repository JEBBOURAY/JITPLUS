import { IsUUID } from 'class-validator';

export class VerifyClientDto {
  @IsUUID('4', { message: 'clientId invalide' })
  clientId: string;
}
