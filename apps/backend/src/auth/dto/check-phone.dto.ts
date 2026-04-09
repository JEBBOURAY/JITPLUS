import { IsNotEmpty, IsString } from 'class-validator';

export class CheckPhoneDto {
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}
