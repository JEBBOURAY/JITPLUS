import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendEmailBlastDto {
  @IsString()
  @IsNotEmpty({ message: 'Le sujet est obligatoire' })
  @MaxLength(150)
  subject: string;

  @IsString()
  @IsNotEmpty({ message: 'Le contenu est obligatoire' })
  @MaxLength(2000)
  body: string;
}
