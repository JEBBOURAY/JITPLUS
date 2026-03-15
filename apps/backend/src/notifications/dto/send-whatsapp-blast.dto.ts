import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendWhatsappBlastDto {
  @IsString()
  @IsNotEmpty({ message: 'Le message est obligatoire' })
  @MaxLength(2000)
  body: string;
}
