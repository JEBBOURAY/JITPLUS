import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est requis' })
  @MaxLength(100)
  password: string;
}
